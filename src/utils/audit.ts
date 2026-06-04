import type { Env } from '../types';
import {
  insertAuditLog,
  getAuditLogs,
  clearAuditLogs,
  AuditAction,
} from '../services/d1DataService';

/**
 * 审计日志类型
 */
export type { AuditAction } from '../services/d1DataService';

/**
 * 审计日志条目
 */
export interface AuditLogEntry {
  id: string;
  userId: string;
  action: AuditAction;
  metadata: Record<string, unknown>;
  timestamp: string;
  avatar_url?: string;
  ip?: string;
  userAgent?: string;
}

/**
 * 审计日志管理类
 */
export class AuditLogger {
  private env: Env;
  private userId: string;

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
    const entry = {
      id: crypto.randomUUID(),
      userId: this.userId,
      action,
      data: { ...metadata, ip: options?.ip, userAgent: options?.userAgent },
      createdAt: new Date().toISOString(),
    };

    await insertAuditLog(this.env, entry);
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
      allUsers?: boolean;
    } = {}
  ): Promise<AuditLogEntry[]> {
    const userId = options.allUsers ? null : this.userId;
    const logs = await getAuditLogs(this.env, userId, options);
    return logs.map((log) => ({
      id: log.id,
      userId: log.userId,
      action: log.action,
      metadata: log.data || {},
      timestamp: log.createdAt,
      avatar_url: log.avatar_url || '',
    }));
  }

  /**
   * 清理审计日志
   */
  async clearLogs(options: { allUsers?: boolean } = {}): Promise<void> {
    const userId = options.allUsers ? null : this.userId;
    await clearAuditLogs(this.env, userId);
  }
}

/**
 * 创建审计日志记录器的工厂函数
 */
export function createAuditLogger(env: Env, userId: string): AuditLogger {
  return new AuditLogger(env, userId);
}
