// ============================================
// 审计日志服务
// 提供全面的操作审计和追踪
// ============================================

import type { Env } from '../types';

/**
 * 审计日志操作类型
 */
export type AuditAction =
  | 'login'
  | 'logout'
  | 'create'
  | 'update'
  | 'delete'
  | 'push'
  | 'export'
  | 'backup'
  | 'restore'
  | 'config_change'
  | 'permission_change'
  | 'test'
  | 'unknown';

/**
 * 审计日志目标类型
 */
export type AuditTargetType =
  | 'user'
  | 'channel'
  | 'template'
  | 'group'
  | 'scheduled'
  | 'backup'
  | 'config'
  | 'api_key'
  | 'unknown';

/**
 * 审计日志级别
 */
export type AuditLevel = 'info' | 'warning' | 'danger';

/**
 * 审计日志记录
 */
export interface AuditLog {
  id: string;
  userId: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string;
  targetName?: string;
  description: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  level: AuditLevel;
  createdAt: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

/**
 * 审计日志查询参数
 */
export interface AuditQueryParams {
  userId?: string;
  action?: AuditAction;
  targetType?: AuditTargetType;
  startDate?: string;
  endDate?: string;
  level?: AuditLevel;
  limit?: number;
  offset?: number;
}

/**
 * 审计统计
 */
export interface AuditStats {
  total: number;
  byAction: Record<AuditAction, number>;
  byLevel: Record<AuditLevel, number>;
  last7Days: number;
  dangerCount: number;
}

/**
 * 审计日志服务类
 */
export class AuditService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * 记录审计日志
   */
  async log(
    userId: string,
    action: AuditAction,
    targetType: AuditTargetType,
    description: string,
    options: {
      targetId?: string;
      targetName?: string;
      details?: Record<string, any>;
      ipAddress?: string;
      userAgent?: string;
      level?: AuditLevel;
    } = {}
  ): Promise<string> {
    try {
      const logId = crypto.randomUUID();
      const now = new Date().toISOString();
      const level = options.level || this.getLevelForAction(action);

      const log: AuditLog = {
        id: logId,
        userId,
        action,
        targetType,
        targetId: options.targetId,
        targetName: options.targetName,
        description,
        details: options.details,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
        level,
        createdAt: now,
        acknowledged: false,
      };

      // 保存到数据库（需要先创建表结构）
      // await this.env.DB!.prepare(...).bind(...).run();

      // 如果是危险级别，可能需要触发告警
      if (level === 'danger') {
        await this.handleDangerAction(log);
      }

      return logId;
    } catch (error) {
      console.error('Failed to log audit:', error);
      return '';
    }
  }

  /**
   * 根据操作类型获取日志级别
   */
  private getLevelForAction(action: AuditAction): AuditLevel {
    const dangerousActions: AuditAction[] = ['delete', 'restore', 'permission_change'];
    const warningActions: AuditAction[] = ['logout', 'config_change', 'export'];
    
    if (dangerousActions.includes(action)) return 'danger';
    if (warningActions.includes(action)) return 'warning';
    return 'info';
  }

  /**
   * 处理危险操作
   */
  private async handleDangerAction(log: AuditLog): Promise<void> {
    // 可以发送告警通知等
    console.warn(`Dangerous action detected: ${log.action} by user ${log.userId}`);
  }

  /**
   * 查询审计日志
   */
  async queryLogs(params: AuditQueryParams): Promise<AuditLog[]> {
    try {
      const {
        userId,
        action,
        targetType,
        startDate,
        endDate,
        level,
        limit = 50,
        offset = 0,
      } = params;

      // let query = `SELECT * FROM audit_logs WHERE 1=1`;
      // const binds: any[] = [];

      // if (userId) {
      //   query += ' AND user_id = ?';
      //   binds.push(userId);
      // }

      // if (action) {
      //   query += ' AND action = ?';
      //   binds.push(action);
      // }

      // if (targetType) {
      //   query += ' AND target_type = ?';
      //   binds.push(targetType);
      // }

      // if (level) {
      //   query += ' AND level = ?';
      //   binds.push(level);
      // }

      // if (startDate) {
      //   query += ' AND created_at >= ?';
      //   binds.push(startDate);
      // }

      // if (endDate) {
      //   query += ' AND created_at <= ?';
      //   binds.push(endDate);
      // }

      // query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      // binds.push(limit, offset);

      return [];
    } catch (error) {
      console.error('Failed to query logs:', error);
      return [];
    }
  }

  /**
   * 确认审计日志
   */
  async acknowledge(logId: string, userId: string): Promise<boolean> {
    try {
      const now = new Date().toISOString();
      // await this.env.DB!.prepare(...).bind(...).run();
      return true;
    } catch (error) {
      console.error('Failed to acknowledge:', error);
      return false;
    }
  }

  /**
   * 获取审计统计
   */
  async getStats(userId: string): Promise<AuditStats> {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // const result = await this.env.DB!.prepare(...).bind(userId, sevenDaysAgo).first<any>();

      return {
        total: 0,
        byAction: {
          login: 0,
          logout: 0,
          create: 0,
          update: 0,
          delete: 0,
          push: 0,
          export: 0,
          backup: 0,
          restore: 0,
          config_change: 0,
          permission_change: 0,
          test: 0,
          unknown: 0,
        },
        byLevel: {
          info: 0,
          warning: 0,
          danger: 0,
        },
        last7Days: 0,
        dangerCount: 0,
      };
    } catch (error) {
      console.error('Failed to get stats:', error);
      return {
        total: 0,
        byAction: {
          login: 0,
          logout: 0,
          create: 0,
          update: 0,
          delete: 0,
          push: 0,
          export: 0,
          backup: 0,
          restore: 0,
          config_change: 0,
          permission_change: 0,
          test: 0,
          unknown: 0,
        },
        byLevel: {
          info: 0,
          warning: 0,
          danger: 0,
        },
        last7Days: 0,
        dangerCount: 0,
      };
    }
  }

  /**
   * 清理旧日志
   */
  async cleanupOldLogs(userId: string, keepDays = 90): Promise<number> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - keepDays);

      // const result = await this.env.DB!.prepare(...).bind(userId, cutoff.toISOString()).run();
      return 0; // result.meta?.changes || 0;
    } catch (error) {
      console.error('Failed to cleanup logs:', error);
      return 0;
    }
  }

  /**
   * 快捷方法：记录创建
   */
  async logCreate(
    userId: string,
    targetType: AuditTargetType,
    targetName: string,
    details?: Record<string, any>
  ): Promise<string> {
    return this.log(userId, 'create', targetType, `创建了 ${targetName}`, {
      targetName,
      details,
    });
  }

  /**
   * 快捷方法：记录更新
   */
  async logUpdate(
    userId: string,
    targetType: AuditTargetType,
    targetName: string,
    changes?: Record<string, any>
  ): Promise<string> {
    return this.log(userId, 'update', targetType, `更新了 ${targetName}`, {
      targetName,
      details: { changes },
    });
  }

  /**
   * 快捷方法：记录删除
   */
  async logDelete(
    userId: string,
    targetType: AuditTargetType,
    targetName: string,
    details?: Record<string, any>
  ): Promise<string> {
    return this.log(userId, 'delete', targetType, `删除了 ${targetName}`, {
      targetName,
      details,
      level: 'danger',
    });
  }

  /**
   * 快捷方法：记录推送
   */
  async logPush(
    userId: string,
    channelName: string,
    success: boolean,
    details?: Record<string, any>
  ): Promise<string> {
    const description = success ? `成功推送至 ${channelName}` : `推送至 ${channelName} 失败`;
    const level = success ? 'info' : 'warning';
    
    return this.log(userId, 'push', 'channel', description, {
      targetName: channelName,
      details: { success, ...details },
      level,
    });
  }

  /**
   * 快捷方法：记录登录
   */
  async logLogin(
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<string> {
    return this.log(userId, 'login', 'user', '用户登录', {
      ipAddress,
      userAgent,
    });
  }

  /**
   * 快捷方法：记录配置变更
   */
  async logConfigChange(
    userId: string,
    configName: string,
    changes: Record<string, any>
  ): Promise<string> {
    return this.log(userId, 'config_change', 'config', `配置变更: ${configName}`, {
      details: { changes },
      level: 'warning',
    });
  }

  /**
   * 获取最近的危险操作
   */
  async getRecentDangerActions(userId: string, limit = 10): Promise<AuditLog[]> {
    return this.queryLogs({
      userId,
      level: 'danger',
      limit,
    });
  }

  /**
   * 导出审计日志
   */
  async exportLogs(userId: string, startDate?: string, endDate?: string): Promise<string> {
    const logs = await this.queryLogs({
      userId,
      startDate,
      endDate,
      limit: 1000,
    });

    return JSON.stringify(logs, null, 2);
  }
}
