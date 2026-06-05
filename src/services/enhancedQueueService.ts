// ============================================
// 增强版队列服务
// 添加任务优先级、智能重试和死信队列支持
// ============================================

import type { Env } from '../types';
import type { PushRequest } from '../../types';
import type { PushQueueMessage } from './queueService';

/**
 * 任务优先级
 */
export type EnhancedTaskPriority = 'high' | 'normal' | 'low';

/**
 * 任务状态
 */
export type EnhancedTaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead';

/**
 * 任务状态记录
 */
export interface EnhancedTaskStatusRecord {
  requestId: string;
  status: EnhancedTaskStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  retryCount: number;
}

/**
 * 队列配置
 */
const QUEUE_CONFIG = {
  maxRetries: 5,
  retryDelayMs: [1000, 5000, 30000, 120000, 300000], // 指数退避
  deadLetterThreshold: 5,
  batchSize: 10,
};

/**
 * 增强版队列服务类
 * 提供异步任务的发送、处理和状态管理功能
 */
export class EnhancedQueueService {
  private queue: Queue | undefined;
  private env: Env;

  constructor(env: Env) {
    this.queue = env.PUSH_QUEUE;
    this.env = env;
    console.log('[EnhancedQueueService] Queue initialized:', this.queue ? 'available' : 'not available');
  }

  /**
   * 检查队列是否可用
   */
  isAvailable(): boolean {
    return !!this.queue;
  }

  /**
   * 创建增强版推送任务消息
   */
  createMessage(
    userId: string,
    payload: PushRequest,
    priority: EnhancedTaskPriority = 'normal'
  ): PushQueueMessage & { priority: EnhancedTaskPriority; retryCount: number; maxRetries: number } {
    return {
      requestId: crypto.randomUUID(),
      userId,
      payload,
      createdAt: new Date().toISOString(),
      priority,
      retryCount: 0,
      maxRetries: QUEUE_CONFIG.maxRetries,
    };
  }

  /**
   * 发送推送任务到队列
   * @param message 任务消息
   */
  async sendPushTask(message: PushQueueMessage): Promise<void> {
    console.log('[EnhancedQueueService] sendPushTask called:', message.requestId);
    
    if (!this.queue) {
      console.warn('[EnhancedQueueService] Queue not available, processing immediately');
      await this.processPushTask(message);
      return;
    }

    await this.queue.send(message);
    console.log('[EnhancedQueueService] Message sent:', message.requestId);
  }

  /**
   * 发送高优先级推送任务
   */
  async sendHighPriorityTask(userId: string, payload: PushRequest): Promise<void> {
    const message = this.createMessage(userId, payload, 'high');
    await this.sendPushTask(message);
  }

  /**
   * 发送普通优先级推送任务
   */
  async sendNormalPriorityTask(userId: string, payload: PushRequest): Promise<void> {
    const message = this.createMessage(userId, payload, 'normal');
    await this.sendPushTask(message);
  }

  /**
   * 发送低优先级推送任务
   */
  async sendLowPriorityTask(userId: string, payload: PushRequest): Promise<void> {
    const message = this.createMessage(userId, payload, 'low');
    await this.sendPushTask(message);
  }

  /**
   * 批量发送推送任务
   */
  async sendPushTasks(messages: PushQueueMessage[]): Promise<void> {
    if (!this.queue) {
      for (const msg of messages) {
        await this.processPushTask(msg).catch((err) => {
          console.error('[EnhancedQueueService] Failed to process message:', err);
        });
      }
      return;
    }

    const queueMessages: MessageSendRequest[] = messages.map((msg) => ({
      body: msg,
    }));

    await this.queue.sendBatch(queueMessages);
  }

  /**
   * 处理队列消息批次
   */
  async processBatch(batch: MessageBatch<PushQueueMessage>): Promise<void> {
    console.log(`[EnhancedQueueService] Processing batch of ${batch.messages.length} messages`);

    const results = await Promise.allSettled(
      batch.messages.map(async (msg) => {
        const message = msg.body;
        console.log(`[EnhancedQueueService] Processing message: ${message.requestId}`);

        try {
          await this.processPushTask(message);
          msg.ack();
          console.log(`[EnhancedQueueService] Message ${message.requestId} processed successfully`);
        } catch (error) {
          console.error(`[EnhancedQueueService] Failed to process message ${message.requestId}:`, error);
          
          const enhancedMsg = message as PushQueueMessage & { retryCount?: number; maxRetries?: number };
          const retryCount = enhancedMsg.retryCount ?? 0;
          const maxRetries = enhancedMsg.maxRetries ?? QUEUE_CONFIG.maxRetries;

          if (retryCount < maxRetries) {
            await this.retryTask({ ...enhancedMsg, retryCount, maxRetries });
            msg.ack();
          } else {
            await this.handleDeadLetter(message, error as Error);
            msg.ack();
          }
        }
      })
    );

    const failedCount = results.filter((r) => r.status === 'rejected').length;
    if (failedCount > 0) {
      console.warn(`[EnhancedQueueService] Batch completed: ${failedCount} failures out of ${batch.messages.length}`);
    }
  }

  /**
   * 重试任务（带指数退避）
   */
  private async retryTask(
    message: PushQueueMessage & { retryCount: number; maxRetries: number }
  ): Promise<void> {
    if (!this.queue) {
      console.warn('[EnhancedQueueService] Cannot retry: queue not available');
      return;
    }

    const retryMessage = {
      ...message,
      retryCount: message.retryCount + 1,
    };

    const delayIndex = Math.min(message.retryCount, QUEUE_CONFIG.retryDelayMs.length - 1);
    const delayMs = QUEUE_CONFIG.retryDelayMs[delayIndex];

    console.log(`[EnhancedQueueService] Retrying message ${message.requestId} in ${delayMs}ms (attempt ${message.retryCount + 1})`);
    await this.queue.send(retryMessage);
  }

  /**
   * 处理死信消息
   */
  private async handleDeadLetter(message: PushQueueMessage, error: Error): Promise<void> {
    console.warn(`[EnhancedQueueService] Moving message ${message.requestId} to dead letter queue`);

    if (this.env.DB) {
      try {
        await this.env.DB.prepare(
          `INSERT INTO failed_tasks (id, user_id, payload, error_message, retry_count, created_at, last_attempt)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            message.requestId,
            message.userId,
            JSON.stringify(message.payload),
            error.message,
            0,
            message.createdAt,
            new Date().toISOString()
          )
          .run();
      } catch (dbError) {
        console.error('[EnhancedQueueService] Failed to record dead letter:', dbError);
      }
    }
  }

  /**
   * 直接处理推送任务
   */
  private async processPushTask(message: PushQueueMessage): Promise<void> {
    const { dispatchPushWithOptions } = await import('./dispatcher');
    
    console.log(`[EnhancedQueueService] Processing push task: ${message.requestId}`);
    
    await dispatchPushWithOptions(
      message.payload,
      message.payload.channels || [],
      message.userId,
      this.env
    );
  }

  /**
   * 获取任务状态
   */
  async getTaskStatus(requestId: string): Promise<EnhancedTaskStatusRecord | null> {
    if (!this.env.DB) {
      return null;
    }

    try {
      const result = await this.env.DB.prepare(
        `SELECT * FROM failed_tasks WHERE id = ?`
      )
        .bind(requestId)
        .first<any>();

      if (!result) {
        return null;
      }

      return {
        requestId: result.id,
        status: 'failed',
        createdAt: result.created_at,
        errorMessage: result.error_message,
        retryCount: result.retry_count,
      };
    } catch {
      return null;
    }
  }

  /**
   * 获取用户的失败任务列表
   */
  async getUserFailedTasks(userId: string, limit = 20): Promise<EnhancedTaskStatusRecord[]> {
    if (!this.env.DB) {
      return [];
    }

    try {
      const result = await this.env.DB.prepare(
        `SELECT * FROM failed_tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
      )
        .bind(userId, limit)
        .all<any>();

      return (result.results || []).map((row: any) => ({
        requestId: row.id,
        status: 'failed' as const,
        createdAt: row.created_at,
        errorMessage: row.error_message,
        retryCount: row.retry_count,
      }));
    } catch {
      return [];
    }
  }
}
