import type { Env } from '../types';

/**
 * 审计日志类型
 */
export type AuditAction =
  | 'login'
  | 'logout'
  | 'register'
  | 'push_sent'
  | 'push_failed'
  | 'channel_updated'
  | 'channel_deleted'
  | 'template_created'
  | 'template_updated'
  | 'template_deleted'
  | 'scheduled_push_created'
  | 'scheduled_push_cancelled'
  | 'backup_created'
  | 'backup_restored'
  | 'settings_updated';

/**
 * 审计日志条目
 */
export interface AuditLogEntry {
  id: string;
  userId: string;
  action: AuditAction;
  metadata: Record<string, unknown>;
  timestamp: string;
  ip?: string;
  userAgent?: string;
}

/**
 * 审计日志管理类
 */
export class AuditLogger {
  private env: Env;
  private userId: string;
  private static readonly MAX_LOGS = 100; // 减少到 100 条日志，节省 KV 空间
  private static readonly RETENTION_DAYS = 7; // 保留 7 天

  constructor(env: Env, userId: string) {
    this.env = env;
    this.userId = userId;
  }

  /**
   * 记录审计日志
   */
  async log(
    action: AuditAction,
    metadata: Record<string, unknown> = {},
    options?: { ip?: string; userAgent?: string }
  ): Promise<void> {
    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      userId: this.userId,
      action,
      metadata,
      timestamp: new Date().toISOString(),
      ip: options?.ip,
      userAgent: options?.userAgent,
    };

    // 只维护一个日志列表，不单独保存每条日志，减少 KV 操作
    await this.updateLogList(entry);
  }

  /**
   * 获取用户最近的审计日志
   */
  async getLogs(
    options: {
      limit?: number;
      offset?: number;
      action?: AuditAction;
      startDate?: string;
      endDate?: string;
    } = {}
  ): Promise<AuditLogEntry[]> {
    const { limit = 50, offset = 0, action, startDate, endDate } = options;

    // 获取日志列表
    const logList = await this.getLogList();

    // 过滤日志
    let filteredLogs = logList;

    if (action) {
      filteredLogs = filteredLogs.filter((log) => log.action === action);
    }

    if (startDate) {
      filteredLogs = filteredLogs.filter((log) => log.timestamp >= startDate);
    }

    if (endDate) {
      filteredLogs = filteredLogs.filter((log) => log.timestamp <= endDate);
    }

    // 排序并分页
    return filteredLogs
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(offset, offset + limit);
  }

  /**
   * 清理审计日志
   */
  async clearLogs(): Promise<void> {
    // 只删除日志列表，不需要处理单独的日志
    await this.env.SUBSCRIPTIONS.delete(`audit:${this.userId}:list`);
  }

  private async getLogList(): Promise<AuditLogEntry[]> {
    try {
      const stored = await this.env.SUBSCRIPTIONS.get(`audit:${this.userId}:list`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private async updateLogList(entry: AuditLogEntry): Promise<void> {
    let logs = await this.getLogList();

    // 添加新日志
    logs.unshift(entry);

    // 限制日志数量
    if (logs.length > AuditLogger.MAX_LOGS) {
      logs = logs.slice(0, AuditLogger.MAX_LOGS);
    }

    // 清理过期日志
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - AuditLogger.RETENTION_DAYS);
    logs = logs.filter((log) => new Date(log.timestamp) > cutoffDate);

    // 保存
    await this.env.SUBSCRIPTIONS.put(`audit:${this.userId}:list`, JSON.stringify(logs), {
      expirationTtl: this.RENTENTION_SECONDS() * 2,
    });
  }

  private RENTENTION_SECONDS(): number {
    return AuditLogger.RETENTION_DAYS * 24 * 60 * 60;
  }
}

/**
 * 创建审计日志记录器的工厂函数
 */
export function createAuditLogger(env: Env, userId: string): AuditLogger {
  return new AuditLogger(env, userId);
}
