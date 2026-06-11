// ============================================
// 队列服务
// ============================================

import type { Env } from '../types';
import type { PushRequest, PushChannel } from '../../types';

/**
 * 推送任务队列消息
 */
export interface PushQueueMessage {
  requestId: string;
  userId: string;
  payload: PushRequest & {
    scheduledPushId?: string;
    isRecurring?: boolean;
    recurringType?: string;
    scheduledAt?: string;
    timezone?: string; // 用户时区
  };
  createdAt: string;
}

/**
 * 队列服务类
 * 提供异步任务的发送和处理功能
 */
export class QueueService {
  private queue: Queue | undefined;

  constructor(env: Env) {
    this.queue = env.PUSH_QUEUE;
    console.log('[QueueService] Queue initialized:', this.queue ? 'available' : 'not available');
  }

  /**
   * 检查队列是否可用
   */
  isAvailable(): boolean {
    return !!this.queue;
  }

  /**
   * 发送推送任务到队列
   * @param message 任务消息
   */
  async sendPushTask(message: PushQueueMessage): Promise<void> {
    console.log('[QueueService] sendPushTask called with message:', message);
    if (!this.queue) {
      throw new Error('Queue not available');
    }

    console.log('[QueueService] Sending message to queue...');
    await this.queue.send(message);
    console.log('[QueueService] Message sent successfully');
  }

  /**
   * 批量发送推送任务
   * @param messages 任务消息数组
   */
  async sendPushTasks(messages: PushQueueMessage[]): Promise<void> {
    if (!this.queue) {
      throw new Error('Queue not available');
    }

    // 转换为 Cloudflare Queues 要求的格式
    const queueMessages: MessageSendRequest[] = messages.map((msg) => ({
      body: msg,
    }));

    await this.queue.sendBatch(queueMessages);
  }

  /**
   * 处理队列消息
   * @param batch 消息批次
   * @param handler 消息处理函数
   */
  async processBatch(
    batch: MessageBatch<PushQueueMessage>,
    handler: (message: PushQueueMessage) => Promise<void>
  ): Promise<void> {
    console.log(`[QueueService] processBatch called with ${batch.messages.length} messages`);
    const results: PromiseSettledResult<void>[] = await Promise.allSettled(
      batch.messages.map(async (msg) => {
        try {
          console.log('[QueueService] Processing message:', msg.body.requestId);
          await handler(msg.body);
          console.log('[QueueService] Message processed successfully, acknowledging');
          msg.ack();
        } catch (error) {
          console.error('[Queue] Failed to process message:', error);
          // 不使用 nack，因为可能会导致无限重试
          // 直接确认，然后记录日志
          msg.ack();
        }
      })
    );

    const failedCount = results.filter((r) => r.status === 'rejected').length;
    if (failedCount > 0) {
      console.warn(`[Queue] Processed ${batch.messages.length} messages, ${failedCount} failed`);
    }
  }
}
