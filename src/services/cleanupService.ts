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
  'users',
  'channel_configs',
  'push_templates',
  'scheduled_pushes',
  'channel_groups',
  'push_history',
  'audit_logs',
  'metrics',
  'scheduled_locks',
  'backup_runs',
  'backup_endpoints',
  'backup_records',
  'system_settings',
  'd1_migrations',
  'sqlite_sequence',
  'sqlite_stat1',
  'push_drafts',
  'push_favorites',
  'push_execution_logs',
  'push_workflows',
  'allowed_ips',
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
  /^password_reset_requests$/i,
];

/**
 * 检测数据库中是否有未登记的新表
 */
export async function detectNewTables(env: Env): Promise<string[]> {
  const newTables: string[] = [];

  try {
    const result = await env
      .DB!.prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all<{ name: string }>();

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

    const result = await env
      .DB!.prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all<{ name: string }>();

    for (const row of result.results || []) {
      const tableName = row.name;

      if (isSafeTable(tableName)) {
        continue;
      }

      if (shouldDeleteTable(tableName)) {
        await env.DB!.prepare(`DROP TABLE IF EXISTS \`${tableName}\``).run();
        deletedTables.push(tableName);
      }
    }

    if (deletedTables.length > 0) {
    } else {
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

/** 获取所有表的信息 */
export async function getAllTables(env: Env): Promise<{
  tables: Array<{
    name: string;
    isSafe: boolean;
    shouldDelete: boolean;
    rowCount?: number;
  }>;
}> {
  const tables: Array<{
    name: string;
    isSafe: boolean;
    shouldDelete: boolean;
    rowCount?: number;
  }> = [];

  try {
    const result = await env
      .DB!.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all<{ name: string }>();

    for (const row of result.results || []) {
      const tableName = row.name;
      const isSafe = isSafeTable(tableName);
      const shouldDel = shouldDeleteTable(tableName);

      // 尝试获取表的行数（仅对非系统表）
      let rowCount: number | undefined;
      if (!tableName.startsWith('sqlite_')) {
        try {
          const countResult = await env
            .DB!.prepare(`SELECT COUNT(*) as count FROM \`${tableName}\``)
            .first<{ count: number }>();
          rowCount = countResult?.count;
        } catch {
          // 忽略错误
        }
      }

      tables.push({
        name: tableName,
        isSafe,
        shouldDelete: shouldDel,
        rowCount,
      });
    }
  } catch (err) {
    console.error('[Cleanup] Error getting tables:', err);
  }

  return { tables };
}

/** 删除指定的表 */
export async function deleteTable(
  env: Env,
  tableName: string
): Promise<{ success: boolean; error?: string }> {
  // 检查是否是安全表，防止误删
  if (isSafeTable(tableName)) {
    return { success: false, error: '不能删除安全表' };
  }

  try {
    await env.DB!.prepare(`DROP TABLE IF EXISTS \`${tableName}\``).run();
    return { success: true };
  } catch (err) {
    console.error('[Cleanup] Error deleting table:', err);
    return { success: false, error: '删除表失败' };
  }
}

/** 清理所有应该删除的表 */
export async function cleanupOrphanTablesForce(env: Env): Promise<{ deletedTables: string[] }> {
  const deletedTables: string[] = [];

  try {
    const { tables } = await getAllTables(env);

    for (const table of tables) {
      if (table.shouldDelete) {
        const result = await deleteTable(env, table.name);
        if (result.success) {
          deletedTables.push(table.name);
        }
      }
    }
  } catch (err) {
    console.error('[Cleanup] Error cleaning orphan tables:', err);
  }

  return { deletedTables };
}
