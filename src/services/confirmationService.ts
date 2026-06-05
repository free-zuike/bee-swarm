// ============================================
// 敏感操作二次确认服务
// 防止用户误操作删除重要数据
// ============================================

import type { Env } from '../types';

/**
 * 敏感操作类型
 */
export type SensitiveOperation =
  | 'delete_channel'
  | 'delete_template'
  | 'delete_group'
  | 'delete_scheduled'
  | 'delete_all_history'
  | 'restore_backup'
  | 'reset_config'
  | 'delete_user';

/**
 * 确认状态
 */
export type ConfirmationStatus = 'pending' | 'confirmed' | 'expired' | 'cancelled';

/**
 * 确认请求
 */
export interface ConfirmationRequest {
  id: string;
  userId: string;
  operation: SensitiveOperation;
  targetType: string;
  targetId?: string;
  targetName?: string;
  payload?: Record<string, any>;
  status: ConfirmationStatus;
  createdAt: string;
  expiresAt: string;
  confirmedAt?: string;
}

/**
 * 敏感操作配置
 */
export interface SensitiveOpConfig {
  operation: SensitiveOperation;
  requiresConfirmation: boolean;
  confirmationTimeout: number; // 秒
  message: string;
  warning: string;
}

/**
 * 敏感操作确认服务类
 */
export class ConfirmationService {
  private env: Env;
  private defaultTimeout = 300; // 5 分钟
  private operationsConfig: Record<SensitiveOperation, SensitiveOpConfig>;

  constructor(env: Env) {
    this.env = env;
    this.operationsConfig = this.initializeConfig();
  }

  /**
   * 初始化配置
   */
  private initializeConfig(): Record<SensitiveOperation, SensitiveOpConfig> {
    return {
      delete_channel: {
        operation: 'delete_channel',
        requiresConfirmation: true,
        confirmationTimeout: this.defaultTimeout,
        message: '您确定要删除这个通知渠道吗？此操作无法撤销。',
        warning: '删除后所有相关的推送历史将保留，但该渠道将不再接收新消息。',
      },
      delete_template: {
        operation: 'delete_template',
        requiresConfirmation: true,
        confirmationTimeout: this.defaultTimeout,
        message: '您确定要删除这个消息模板吗？此操作无法撤销。',
        warning: '删除后所有使用此模板的定时推送可能会受到影响。',
      },
      delete_group: {
        operation: 'delete_group',
        requiresConfirmation: true,
        confirmationTimeout: this.defaultTimeout,
        message: '您确定要删除这个渠道群组吗？此操作无法撤销。',
        warning: '删除群组不会删除群组内的渠道，但该群组的相关推送将停止。',
      },
      delete_scheduled: {
        operation: 'delete_scheduled',
        requiresConfirmation: true,
        confirmationTimeout: this.defaultTimeout,
        message: '您确定要删除这个定时推送任务吗？此操作无法撤销。',
        warning: '删除后此任务将不再执行。',
      },
      delete_all_history: {
        operation: 'delete_all_history',
        requiresConfirmation: true,
        confirmationTimeout: 600, // 10 分钟
        message: '您确定要清空所有推送历史吗？此操作无法撤销！',
        warning: '这将永久删除所有推送记录，请确保您有备份。',
      },
      restore_backup: {
        operation: 'restore_backup',
        requiresConfirmation: true,
        confirmationTimeout: 600,
        message: '您确定要从备份恢复数据吗？当前数据将被覆盖！',
        warning: '恢复操作将替换当前所有数据，建议先创建新备份。',
      },
      reset_config: {
        operation: 'reset_config',
        requiresConfirmation: true,
        confirmationTimeout: 600,
        message: '您确定要重置所有配置吗？此操作无法撤销！',
        warning: '将删除所有渠道、模板和群组设置，回到初始状态。',
      },
      delete_user: {
        operation: 'delete_user',
        requiresConfirmation: true,
        confirmationTimeout: 900, // 15 分钟
        message: '您确定要删除账户吗？所有数据将永久删除！',
        warning: '删除后无法恢复，请确保已导出所需数据。',
      },
    };
  }

  /**
   * 检查是否需要确认
   */
  requiresConfirmation(operation: SensitiveOperation): boolean {
    return this.operationsConfig[operation]?.requiresConfirmation ?? false;
  }

  /**
   * 获取操作配置
   */
  getOperationConfig(operation: SensitiveOperation): SensitiveOpConfig | null {
    return this.operationsConfig[operation] || null;
  }

  /**
   * 创建确认请求
   */
  async createConfirmation(
    userId: string,
    operation: SensitiveOperation,
    targetType: string,
    options: {
      targetId?: string;
      targetName?: string;
      payload?: Record<string, any>;
      timeout?: number;
    } = {}
  ): Promise<ConfirmationRequest | null> {
    try {
      const config = this.operationsConfig[operation];
      if (!config) return null;

      const now = new Date();
      const timeout = options.timeout || config.confirmationTimeout;
      const expiresAt = new Date(now.getTime() + timeout * 1000).toISOString();

      const request: ConfirmationRequest = {
        id: crypto.randomUUID(),
        userId,
        operation,
        targetType,
        targetId: options.targetId,
        targetName: options.targetName,
        payload: options.payload,
        status: 'pending',
        createdAt: now.toISOString(),
        expiresAt,
      };

      // 保存到数据库
      // await this.env.DB!.prepare(...).bind(...).run();

      return request;
    } catch (error) {
      console.error('Failed to create confirmation:', error);
      return null;
    }
  }

  /**
   * 确认操作
   */
  async confirm(
    confirmationId: string,
    userId: string
  ): Promise<{
    confirmed: boolean;
    request?: ConfirmationRequest;
    error?: string;
  }> {
    try {
      const request = await this.getRequest(confirmationId, userId);
      
      if (!request) {
        return { confirmed: false, error: '确认请求不存在' };
      }

      if (request.status !== 'pending') {
        return { confirmed: false, error: `请求状态为 ${request.status}` };
      }

      if (new Date() > new Date(request.expiresAt)) {
        await this.updateStatus(confirmationId, 'expired');
        return { confirmed: false, error: '确认请求已过期' };
      }

      await this.updateStatus(confirmationId, 'confirmed', new Date().toISOString());

      return { confirmed: true, request };
    } catch (error) {
      console.error('Failed to confirm:', error);
      return { confirmed: false, error: (error as Error).message };
    }
  }

  /**
   * 取消确认
   */
  async cancel(confirmationId: string, userId: string): Promise<boolean> {
    try {
      const request = await this.getRequest(confirmationId, userId);
      if (!request || request.status !== 'pending') return false;

      await this.updateStatus(confirmationId, 'cancelled');
      return true;
    } catch (error) {
      console.error('Failed to cancel:', error);
      return false;
    }
  }

  /**
   * 获取确认请求
   */
  async getRequest(confirmationId: string, userId: string): Promise<ConfirmationRequest | null> {
    try {
      // const result = await this.env.DB!.prepare(...).bind(confirmationId, userId).first<any>();
      return null; // 临时返回
    } catch (error) {
      console.error('Failed to get request:', error);
      return null;
    }
  }

  /**
   * 更新状态
   */
  private async updateStatus(
    confirmationId: string,
    status: ConfirmationStatus,
    confirmedAt?: string
  ): Promise<void> {
    try {
      // await this.env.DB!.prepare(...).bind(...).run();
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  }

  /**
   * 获取待确认列表
   */
  async getPendingConfirmations(userId: string): Promise<ConfirmationRequest[]> {
    try {
      // const result = await this.env.DB!.prepare(...).bind(userId).all<any>();
      return [];
    } catch (error) {
      console.error('Failed to get pending:', error);
      return [];
    }
  }

  /**
   * 清理过期请求
   */
  async cleanupExpired(): Promise<number> {
    try {
      const now = new Date().toISOString();
      // const result = await this.env.DB!.prepare(...).bind(now).run();
      return 0; // result.meta?.changes || 0;
    } catch (error) {
      console.error('Failed to cleanup:', error);
      return 0;
    }
  }

  /**
   * 快捷方法：删除渠道前确认
   */
  async requestDeleteChannel(
    userId: string,
    channelId: string,
    channelName: string
  ): Promise<ConfirmationRequest | null> {
    return this.createConfirmation(userId, 'delete_channel', 'channel', {
      targetId: channelId,
      targetName: channelName,
    });
  }

  /**
   * 快捷方法：删除模板前确认
   */
  async requestDeleteTemplate(
    userId: string,
    templateId: string,
    templateName: string
  ): Promise<ConfirmationRequest | null> {
    return this.createConfirmation(userId, 'delete_template', 'template', {
      targetId: templateId,
      targetName: templateName,
    });
  }

  /**
   * 快捷方法：删除群组前确认
   */
  async requestDeleteGroup(
    userId: string,
    groupId: string,
    groupName: string
  ): Promise<ConfirmationRequest | null> {
    return this.createConfirmation(userId, 'delete_group', 'group', {
      targetId: groupId,
      targetName: groupName,
    });
  }

  /**
   * 快捷方法：恢复备份前确认
   */
  async requestRestoreBackup(
    userId: string,
    backupId: string,
    backupName: string
  ): Promise<ConfirmationRequest | null> {
    return this.createConfirmation(userId, 'restore_backup', 'backup', {
      targetId: backupId,
      targetName: backupName,
    });
  }

  /**
   * 快捷方法：删除用户账户前确认
   */
  async requestDeleteUser(
    userId: string,
    userName: string
  ): Promise<ConfirmationRequest | null> {
    return this.createConfirmation(userId, 'delete_user', 'user', {
      targetId: userId,
      targetName: userName,
    });
  }

  /**
   * 检查是否已确认
   */
  async isConfirmed(confirmationId: string, userId: string): Promise<boolean> {
    const request = await this.getRequest(confirmationId, userId);
    return request?.status === 'confirmed';
  }

  /**
   * 获取所有敏感操作类型
   */
  getAllOperations(): SensitiveOperation[] {
    return Object.keys(this.operationsConfig) as SensitiveOperation[];
  }

  /**
   * 获取确认倒计时
   */
  getRemainingTime(request: ConfirmationRequest): number {
    const expiresAt = new Date(request.expiresAt).getTime();
    const now = Date.now();
    return Math.max(0, (expiresAt - now) / 1000);
  }

  /**
   * 批量取消用户的所有待确认
   */
  async cancelAllPending(userId: string): Promise<number> {
    try {
      const pending = await this.getPendingConfirmations(userId);
      for (const req of pending) {
        await this.cancel(req.id, userId);
      }
      return pending.length;
    } catch (error) {
      console.error('Failed to cancel all:', error);
      return 0;
    }
  }
}
