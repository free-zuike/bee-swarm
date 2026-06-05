// ============================================
// 数据清理服务 - 防止 D1 数据库膨胀
// ============================================
import type { Env } from '../types';

export interface CleanupConfig {
  /** 推送历史保留天数 */
  pushHistoryRetentionDays: number;
  /** 审计日志保留天数 */
  auditLogRetentionDays: number;
  /** 每次清理的最大记录数 */
  batchSize: number;
}

const DEFAULT_CONFIG: CleanupConfig = {
  pushHistoryRetentionDays: 30,
  auditLogRetentionDays: 90,
  batchSize: 100,
};

/** 清理过期数据 */
export async function cleanupExpiredData(env: Env, config: Partial<CleanupConfig> = {}): Promise<{
  pushHistoryDeleted: number;
  auditLogsDeleted: number;
}> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let pushHistoryDeleted = 0;
  let auditLogsDeleted = 0;

  // 计算过期时间戳
  const pushHistoryCutoff = new Date(Date.now() - cfg.pushHistoryRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  const auditLogCutoff = new Date(Date.now() - cfg.auditLogRetentionDays * 24 * 60 * 60 * 1000).toISOString();

  try {
    // 1. 清理推送历史（分批删除，避免锁表）
    let deletedThisBatch = 0;
    do {
      const result = await env.DB!.prepare(
        `DELETE FROM push_history 
         WHERE created_at < ? 
         LIMIT ?`
      ).bind(pushHistoryCutoff, cfg.batchSize).run();
      
      deletedThisBatch = result.meta?.changes || 0;
      pushHistoryDeleted += deletedThisBatch;
      
      // 避免一次性删除太多
      if (deletedThisBatch > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } while (deletedThisBatch >= cfg.batchSize);

    console.log(`[Cleanup] Deleted ${pushHistoryDeleted} push history records older than ${cfg.pushHistoryRetentionDays} days`);

  } catch (err) {
    console.error('[Cleanup] Error cleaning push_history:', err);
  }

  try {
    // 2. 清理审计日志（分批删除）
    let deletedThisBatch = 0;
    do {
      const result = await env.DB!.prepare(
        `DELETE FROM audit_logs 
         WHERE created_at < ? 
         LIMIT ?`
      ).bind(auditLogCutoff, cfg.batchSize).run();
      
      deletedThisBatch = result.meta?.changes || 0;
      auditLogsDeleted += deletedThisBatch;
      
      if (deletedThisBatch > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } while (deletedThisBatch >= cfg.batchSize);

    console.log(`[Cleanup] Deleted ${auditLogsDeleted} audit logs older than ${cfg.auditLogRetentionDays} days`);

  } catch (err) {
    console.error('[Cleanup] Error cleaning audit_logs:', err);
  }

  return { pushHistoryDeleted, auditLogsDeleted };
}

/** 获取数据库使用统计 */
export async function getDatabaseStats(env: Env): Promise<{
  pushHistoryCount: number;
  auditLogsCount: number;
  usersCount: number;
  estimatedSize: string;
}> {
  try {
    const [pushHistory, auditLogs, users] = await Promise.all([
      env.DB!.prepare('SELECT COUNT(*) as count FROM push_history').first<{ count: number }>(),
      env.DB!.prepare('SELECT COUNT(*) as count FROM audit_logs').first<{ count: number }>(),
      env.DB!.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>(),
    ]);

    // 估算大小（基于记录数粗略估算）
    const totalRecords = (pushHistory?.count || 0) + (auditLogs?.count || 0) + (users?.count || 0);
    const estimatedKB = Math.round(totalRecords * 0.5); // 假设每条记录约 0.5KB
    const estimatedSize = estimatedKB > 1024 
      ? `${(estimatedKB / 1024).toFixed(1)} MB` 
      : `${estimatedKB} KB`;

    return {
      pushHistoryCount: pushHistory?.count || 0,
      auditLogsCount: auditLogs?.count || 0,
      usersCount: users?.count || 0,
      estimatedSize,
    };
  } catch (err) {
    console.error('[Stats] Error getting database stats:', err);
    return {
      pushHistoryCount: 0,
      auditLogsCount: 0,
      usersCount: 0,
      estimatedSize: 'unknown',
    };
  }
}
