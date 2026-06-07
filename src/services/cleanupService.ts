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
  /** 是否自动删除孤立表 */
  autoDeleteOrphanTables: boolean;
}

const DEFAULT_CONFIG: CleanupConfig = {
  pushHistoryRetentionDays: 30,
  auditLogRetentionDays: 90,
  batchSize: 100,
  autoDeleteOrphanTables: false,
};

/** 清理过期数据 */
export async function cleanupExpiredData(
  env: Env,
  config: Partial<CleanupConfig> = {}
): Promise<{
  pushHistoryDeleted: number;
  auditLogsDeleted: number;
  orphanTablesDeleted: string[];
}> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let pushHistoryDeleted = 0;
  let auditLogsDeleted = 0;
  let orphanTablesDeleted: string[] = [];

  // 计算过期时间戳
  const pushHistoryCutoff = new Date(
    Date.now() - cfg.pushHistoryRetentionDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const auditLogCutoff = new Date(
    Date.now() - cfg.auditLogRetentionDays * 24 * 60 * 60 * 1000
  ).toISOString();

  try {
    // 1. 清理推送历史（分批删除，避免锁表）
    let deletedThisBatch = 0;
    do {
      const result = await env
        .DB!.prepare(
          `DELETE FROM push_history 
         WHERE created_at < ? 
         LIMIT ?`
        )
        .bind(pushHistoryCutoff, cfg.batchSize)
        .run();

      deletedThisBatch = result.meta?.changes || 0;
      pushHistoryDeleted += deletedThisBatch;

      // 避免一次性删除太多
      if (deletedThisBatch > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } while (deletedThisBatch >= cfg.batchSize);

    console.log(
      `[Cleanup] Deleted ${pushHistoryDeleted} push history records older than ${cfg.pushHistoryRetentionDays} days`
    );
  } catch (err) {
    console.error('[Cleanup] Error cleaning push_history:', err);
  }

  try {
    // 2. 清理审计日志（分批删除）
    let deletedThisBatch = 0;
    do {
      const result = await env
        .DB!.prepare(
          `DELETE FROM audit_logs 
         WHERE created_at < ? 
         LIMIT ?`
        )
        .bind(auditLogCutoff, cfg.batchSize)
        .run();

      deletedThisBatch = result.meta?.changes || 0;
      auditLogsDeleted += deletedThisBatch;

      if (deletedThisBatch > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } while (deletedThisBatch >= cfg.batchSize);

    console.log(
      `[Cleanup] Deleted ${auditLogsDeleted} audit logs older than ${cfg.auditLogRetentionDays} days`
    );
  } catch (err) {
    console.error('[Cleanup] Error cleaning audit_logs:', err);
  }

  if (cfg.autoDeleteOrphanTables) {
    orphanTablesDeleted = await cleanupOrphanTables(env);
  }

  return { pushHistoryDeleted, auditLogsDeleted, orphanTablesDeleted };
}

/**
 * ============================================
 * 安全白名单 - 请勿随意修改！
 * ============================================
 * 所有业务表必须添加到此列表，否则可能被自动清理服务误删。
 * ============================================
 */
const SAFE_TABLES: string[] = [
  'users', 'channel_configs', 'push_templates', 'scheduled_pushes',
  'channel_groups', 'push_history', 'audit_logs', 'metrics',
  'scheduled_locks', 'backup_runs', 'backup_endpoints',
  'backup_records', 'system_settings', 'd1_migrations',
  'sqlite_sequence', 'sqlite_stat1'
];

/**
 * ============================================
 * 删除模式 - 只删除符合这些模式的表
 * ============================================
 */
const DELETE_PATTERNS: RegExp[] = [
  /^.*backup_\d+.*$/i,
  /^.*_backup_\d+.*$/i,
  /^.*_new$/i,
  /^password_reset_requests$/i
];

/**
 * 检测数据库中是否有未登记的新表
 */
export async function detectNewTables(env: Env): Promise<string[]> {
  const newTables: string[] = [];
  
  try {
    const result = await env.DB!.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all<{ name: string }>();

    for (const row of result.results || []) {
      const tableName = row.name;
      if (!isSafeTable(tableName) && !shouldDeleteTable(tableName)) {
        newTables.push(tableName);
        console.warn(`[Cleanup] WARNING: Unregistered table detected: ${tableName}`);
        console.warn(`[Cleanup]          Please add it to SAFE_TABLES if it's a valid table`);
      }
    }

    if (newTables.length > 0) {
      console.warn(`[Cleanup] WARNING: Found ${newTables.length} unregistered tables`);
    }
  } catch (err) {
    console.error('[Cleanup] Error detecting new tables:', err);
  }

  return newTables;
}

/**
 * 判断表是否在安全白名单中
 */
export function isSafeTable(tableName: string): boolean {
  return SAFE_TABLES.includes(tableName.toLowerCase());
}

/**
 * 判断表是否应该被删除
 */
export function shouldDeleteTable(tableName: string): boolean {
  for (const pattern of DELETE_PATTERNS) {
    if (pattern.test(tableName)) {
      return true;
    }
  }
  return false;
}

/**
 * 清理孤立表
 */
async function cleanupOrphanTables(env: Env): Promise<string[]> {
  const deletedTables: string[] = [];
  
  try {
    await detectNewTables(env);

    const result = await env.DB!.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all<{ name: string }>();

    for (const row of result.results || []) {
      const tableName = row.name;
      
      if (isSafeTable(tableName)) {
        continue;
      }

      if (shouldDeleteTable(tableName)) {
        await env.DB!.prepare(`DROP TABLE IF EXISTS \`${tableName}\``).run();
        deletedTables.push(tableName);
        console.log(`[Cleanup] Deleted orphan table: ${tableName}`);
      }
    }

    if (deletedTables.length > 0) {
      console.log(`[Cleanup] Total orphan tables deleted: ${deletedTables.length}`);
    } else {
      console.log('[Cleanup] No orphan tables found');
    }
  } catch (err) {
    console.error('[Cleanup] Error cleaning orphan tables:', err);
  }

  return deletedTables;
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
    const estimatedSize =
      estimatedKB > 1024 ? `${(estimatedKB / 1024).toFixed(1)} MB` : `${estimatedKB} KB`;

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
