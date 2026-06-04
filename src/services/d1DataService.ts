import type { Env } from '../types';

/**
 * 检查 D1 数据库是否可用
 */
export function isD1Enabled(env: Env): env is Env & { DB: D1Database } {
  return env.DB !== undefined;
}

// ============================================
// 审计日志
// ============================================

export type AuditAction =
  | 'login'
  | 'logout'
  | 'register'
  | 'push_sent'
  | 'push_failed'
  | 'push_queued'
  | 'channel_updated'
  | 'channel_deleted'
  | 'template_created'
  | 'template_updated'
  | 'template_deleted'
  | 'scheduled_push_created'
  | 'scheduled_push_cancelled'
  | 'scheduled_push_rescheduled'
  | 'backup_created'
  | 'backup_restored'
  | 'settings_updated'
  | 'user_created'
  | 'user_deleted'
  | 'user_role_updated'
  | 'user_disabled'
  | 'user_enabled';

export interface AuditLog {
  id: string;
  userId: string;
  action: AuditAction;
  data: any;
  createdAt: string;
}

export async function insertAuditLog(env: Env, log: AuditLog): Promise<void> {
  if (!isD1Enabled(env)) return;
  try {
    await env
      .DB!.prepare(
        'INSERT INTO audit_logs (id, user_id, action, data, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(log.id, log.userId, log.action, JSON.stringify(log.data), log.createdAt)
      .run();
  } catch (error) {
    console.error('[D1] insertAuditLog error:', error);
  }
}

export async function getAuditLogs(
  env: Env,
  userId: string | null,
  options: {
    limit?: number;
    offset?: number;
    action?: AuditAction;
    startDate?: string;
    endDate?: string;
  } = {}
): Promise<AuditLog[]> {
  if (!isD1Enabled(env)) return [];
  try {
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    // 关联用户表获取头像
    let query = `SELECT al.id, al.user_id, al.action, al.data, al.created_at, u.avatar_url
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.email`;
    const bindings: any[] = [];

    if (userId) {
      query += ' WHERE al.user_id = ?';
      bindings.push(userId);
    }

    if (options.action) {
      query += userId ? ' AND al.action = ?' : ' WHERE al.action = ?';
      bindings.push(options.action);
    }

    if (options.startDate) {
      query += userId || options.action ? ' AND al.created_at >= ?' : ' WHERE al.created_at >= ?';
      bindings.push(options.startDate);
    }

    if (options.endDate) {
      const hasWhere = userId || options.action || options.startDate;
      query += hasWhere ? ' AND al.created_at <= ?' : ' WHERE al.created_at <= ?';
      bindings.push(options.endDate);
    }

    query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
    bindings.push(limit, offset);

    const result = await env
      .DB!.prepare(query)
      .bind(...bindings)
      .all();
    return (result.results || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      action: row.action as AuditAction,
      data: JSON.parse(row.data || '{}'),
      timestamp: row.created_at,
      avatar_url: row.avatar_url || '',
    }));
  } catch (error) {
    console.error('[D1] getAuditLogs error:', error);
    return [];
  }
}

export async function clearAuditLogs(env: Env, userId: string | null): Promise<void> {
  if (!isD1Enabled(env)) return;
  try {
    if (userId) {
      await env.DB!.prepare('DELETE FROM audit_logs WHERE user_id = ?').bind(userId).run();
    } else {
      await env.DB!.prepare('DELETE FROM audit_logs').run();
    }
  } catch (error) {
    console.error('[D1] clearAuditLogs error:', error);
  }
}

// ============================================
// 指标统计
// ============================================

export interface Metrics {
  id: string;
  userId: string;
  total: number;
  success: number;
  failed: number;
  channelStats: any;
  dailyStats: any;
  avgLatency?: number;
  createdAt: string;
  updatedAt: string;
}

export async function getMetrics(env: Env, userId: string): Promise<Metrics | null> {
  if (!isD1Enabled(env)) return null;
  try {
    const result = await env
      .DB!.prepare('SELECT * FROM metrics WHERE user_id = ?')
      .bind(userId)
      .first();

    if (result) {
      const row = result as any;
      return {
        id: row.id,
        userId: row.user_id,
        total: row.total,
        success: row.success,
        failed: row.failed,
        channelStats: JSON.parse(row.channel_stats || '{}'),
        dailyStats: JSON.parse(row.daily_stats || '{}'),
        avgLatency: row.avg_latency || 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }
    return null;
  } catch (error) {
    console.error('[D1] getMetrics error:', error);
    return null;
  }
}

export async function upsertMetrics(env: Env, metrics: Metrics): Promise<void> {
  if (!isD1Enabled(env)) return;
  try {
    await env
      .DB!.prepare(
        'INSERT OR REPLACE INTO metrics (id, user_id, total, success, failed, channel_stats, daily_stats, avg_latency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        metrics.id,
        metrics.userId,
        metrics.total,
        metrics.success,
        metrics.failed,
        JSON.stringify(metrics.channelStats),
        JSON.stringify(metrics.dailyStats),
        metrics.avgLatency || 0,
        metrics.createdAt,
        metrics.updatedAt
      )
      .run();
  } catch (error) {
    console.error('[D1] upsertMetrics error:', error);
  }
}

export async function deleteMetrics(env: Env, userId: string): Promise<void> {
  if (!isD1Enabled(env)) return;
  try {
    await env.DB!.prepare('DELETE FROM metrics WHERE user_id = ?').bind(userId).run();
  } catch (error) {
    console.error('[D1] deleteMetrics error:', error);
  }
}

// ============================================
// 定时任务锁
// ============================================

export interface ScheduledLock {
  id: string;
  userId: string;
  pushId: string;
  executedAt: string;
  createdAt: string;
}

export async function getScheduledLock(
  env: Env,
  userId: string,
  pushId: string
): Promise<ScheduledLock | null> {
  if (!isD1Enabled(env)) return null;
  try {
    const result = await env
      .DB!.prepare('SELECT * FROM scheduled_locks WHERE user_id = ? AND push_id = ?')
      .bind(userId, pushId)
      .first();

    if (result) {
      const row = result as any;
      return {
        id: row.id,
        userId: row.user_id,
        pushId: row.push_id,
        executedAt: row.executed_at,
        createdAt: row.created_at,
      };
    }
    return null;
  } catch (error) {
    console.error('[D1] getScheduledLock error:', error);
    return null;
  }
}

export async function insertScheduledLock(env: Env, lock: ScheduledLock): Promise<void> {
  if (!isD1Enabled(env)) return;
  try {
    await env
      .DB!.prepare(
        'INSERT OR REPLACE INTO scheduled_locks (id, user_id, push_id, executed_at, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(lock.id, lock.userId, lock.pushId, lock.executedAt, lock.createdAt)
      .run();
  } catch (error) {
    console.error('[D1] insertScheduledLock error:', error);
  }
}

// ============================================
// 备份运行记录
// ============================================

export interface BackupRun {
  id: string;
  userId: string;
  endpointId: string;
  lastRun: number;
  createdAt: string;
  updatedAt: string;
}

export async function getBackupRun(
  env: Env,
  userId: string,
  endpointId: string
): Promise<BackupRun | null> {
  if (!isD1Enabled(env)) return null;
  try {
    const result = await env
      .DB!.prepare('SELECT * FROM backup_runs WHERE user_id = ? AND endpoint_id = ?')
      .bind(userId, endpointId)
      .first();

    if (result) {
      const row = result as any;
      return {
        id: row.id,
        userId: row.user_id,
        endpointId: row.endpoint_id,
        lastRun: row.last_run,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }
    return null;
  } catch (error) {
    console.error('[D1] getBackupRun error:', error);
    return null;
  }
}

export async function upsertBackupRun(env: Env, backupRun: BackupRun): Promise<void> {
  if (!isD1Enabled(env)) return;
  try {
    await env
      .DB!.prepare(
        'INSERT OR REPLACE INTO backup_runs (id, user_id, endpoint_id, last_run, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(
        backupRun.id,
        backupRun.userId,
        backupRun.endpointId,
        backupRun.lastRun,
        backupRun.createdAt,
        backupRun.updatedAt
      )
      .run();
  } catch (error) {
    console.error('[D1] upsertBackupRun error:', error);
  }
}
