// ============================================
// 队列服务
// ============================================

import type { Env } from '../types';
import type { PushRequest } from '../../types';

/**
 * 推送任务队列消息
 */
export interface PushQueueMessage {
  requestId: string;
  userId: string;
  payload: PushRequest;
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
    if (!this.queue) {
      throw new Error('Queue not available');
    }

    await this.queue.send(message);
  }

  /**
   * 批量发送推送任务
   * @param messages 任务消息数组
   */
  async sendPushTasks(messages: PushQueueMessage[]): Promise<void> {
    if (!this.queue) {
      throw new Error('Queue not available');
    }

    await this.queue.sendBatch(messages);
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
    const results: PromiseSettledResult<void>[] = await Promise.allSettled(
      batch.messages.map(async (msg) => {
        try {
          await handler(msg.body);
          msg.ack();
        } catch (error) {
          console.error('[Queue] Failed to process message:', error);
          msg.nack();
        }
      })
    );

    const failedCount = results.filter(r => r.status === 'rejected').length;
    if (failedCount > 0) {
      console.warn(`[Queue] Processed ${batch.messages.length} messages, ${failedCount} failed`);
    }
  }
}