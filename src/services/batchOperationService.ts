// ============================================
// 批量操作服务
// 提供高效的批量数据操作功能
// ============================================

import type { Env } from '../types';

/**
 * 批量操作类型
 */
export type BatchOperationType =
  | 'enable'
  | 'disable'
  | 'delete'
  | 'update'
  | 'test';

/**
 * 批量操作目标
 */
export type BatchTargetType =
  | 'channels'
  | 'templates'
  | 'groups'
  | 'scheduled';

/**
 * 批量操作结果
 */
export interface BatchOperationResult {
  total: number;
  success: number;
  failed: number;
  errors: Array<{
    id: string;
    error: string;
  }>;
  details?: any[];
}

/**
 * 批量操作配置
 */
export interface BatchConfig {
  /** 最大批量大小 */
  maxBatchSize: number;
  /** 并发限制 */
  concurrency: number;
  /** 是否继续执行即使部分失败 */
  continueOnError: boolean;
  /** 操作间隔（毫秒） */
  delayMs: number;
}

/**
 * 默认批量配置
 */
const DEFAULT_BATCH_CONFIG: BatchConfig = {
  maxBatchSize: 100,
  concurrency: 5,
  continueOnError: true,
  delayMs: 100,
};

/**
 * 批量操作服务类
 */
export class BatchOperationService {
  private env: Env;
  private config: BatchConfig;

  constructor(env: Env, config?: Partial<BatchConfig>) {
    this.env = env;
    this.config = { ...DEFAULT_BATCH_CONFIG, ...config };
  }

  /**
   * 批量启用/禁用渠道
   */
  async toggleChannels(
    ids: string[],
    enable: boolean,
    userId: string
  ): Promise<BatchOperationResult> {
    const result: BatchOperationResult = {
      total: ids.length,
      success: 0,
      failed: 0,
      errors: [],
    };

    // 分批处理
    const batches = this.splitIntoBatches(ids);

    for (const batch of batches) {
      const batchResults = await Promise.allSettled(
        batch.map(async (id) => {
          await this.env.DB!.prepare(
            `UPDATE channel_configs SET enabled = ?, updated_at = ? WHERE id = ? AND user_id = ?`
          )
            .bind(enable ? 1 : 0, new Date().toISOString(), id, userId)
            .run();

          return { id, success: true };
        })
      );

      // 处理结果
      batchResults.forEach((res, index) => {
        if (res.status === 'fulfilled' && res.value.success) {
          result.success++;
        } else {
          result.failed++;
          result.errors.push({
            id: batch[index],
            error: res.status === 'rejected' ? res.reason.message : '更新失败',
          });
        }
      });

      // 延迟
      if (this.config.delayMs > 0) {
        await this.delay(this.config.delayMs);
      }
    }

    return result;
  }

  /**
   * 批量删除
   */
  async batchDelete(
    target: BatchTargetType,
    ids: string[],
    userId: string
  ): Promise<BatchOperationResult> {
    const result: BatchOperationResult = {
      total: ids.length,
      success: 0,
      failed: 0,
      errors: [],
      details: [],
    };

    const tableMap: Record<BatchTargetType, string> = {
      channels: 'channel_configs',
      templates: 'push_templates',
      groups: 'channel_groups',
      scheduled: 'scheduled_pushes',
    };

    const table = tableMap[target];

    for (const id of ids) {
      try {
        const deleteResult = await this.env.DB!.prepare(
          `DELETE FROM ${table} WHERE id = ? AND user_id = ?`
        )
          .bind(id, userId)
          .run();

        if (deleteResult.meta?.changes > 0) {
          result.success++;
          result.details?.push({ id, deleted: true });
        } else {
          result.failed++;
          result.errors.push({ id, error: '记录不存在或无权删除' });
        }
      } catch (error) {
        result.failed++;
        result.errors.push({
          id,
          error: (error as Error).message,
        });
      }

      // 延迟
      if (this.config.delayMs > 0) {
        await this.delay(this.config.delayMs);
      }
    }

    return result;
  }

  /**
   * 批量测试渠道
   */
  async testChannels(ids: string[], userId: string): Promise<{
    results: Array<{
      id: string;
      success: boolean;
      latencyMs?: number;
      error?: string;
    }>;
    summary: {
      total: number;
      success: number;
      failed: number;
      avgLatency: number;
    };
  }> {
    const results: Array<{
      id: string;
      success: boolean;
      latencyMs?: number;
      error?: string;
    }> = [];

    // 获取渠道配置
    const placeholders = ids.map(() => '?').join(',');
    const channelsResult = await this.env.DB!.prepare(
      `SELECT * FROM channel_configs WHERE id IN (${placeholders}) AND user_id = ?`
    )
      .bind(...ids, userId)
      .all<any>();

    const channels = channelsResult.results || [];

    // 并发测试
    const testPromises = channels.map(async (channel) => {
      const startTime = Date.now();

      try {
        // 简单的健康检查
        const healthCheckResult = await this.performHealthCheck(channel);

        return {
          id: channel.id,
          success: healthCheckResult.success,
          latencyMs: Date.now() - startTime,
          error: healthCheckResult.error,
        };
      } catch (error) {
        return {
          id: channel.id,
          success: false,
          latencyMs: Date.now() - startTime,
          error: (error as Error).message,
        };
      }
    });

    // 使用信号量控制并发
    const limitedPromises = this.concurrencyLimit(testPromises, this.config.concurrency);
    const settledResults = await Promise.allSettled(limitedPromises as any);

    settledResults.forEach((res) => {
      if (res.status === 'fulfilled') {
        results.push(res.value as any);
      }
    });

    // 统计
    const summary = {
      total: results.length,
      success: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      avgLatency:
        results.reduce((sum, r) => sum + (r.latencyMs || 0), 0) / (results.length || 1),
    };

    return { results, summary };
  }

  /**
   * 批量更新模板
   */
  async batchUpdateTemplates(
    updates: Array<{
      id: string;
      data: Record<string, any>;
    }>,
    userId: string
  ): Promise<BatchOperationResult> {
    const result: BatchOperationResult = {
      total: updates.length,
      success: 0,
      failed: 0,
      errors: [],
      details: [],
    };

    for (const update of updates) {
      try {
        const setClause = Object.keys(update.data)
          .map((key) => `${key} = ?`)
          .join(', ');
        const values = Object.values(update.data);
        values.push(new Date().toISOString(), update.id, userId);

        const updateResult = await this.env.DB!.prepare(
          `UPDATE push_templates SET ${setClause}, updated_at = ? WHERE id = ? AND user_id = ?`
        )
          .bind(...values)
          .run();

        if (updateResult.meta?.changes > 0) {
          result.success++;
          result.details?.push({ id: update.id, updated: true });
        } else {
          result.failed++;
          result.errors.push({ id: update.id, error: '记录不存在或无权更新' });
        }
      } catch (error) {
        result.failed++;
        result.errors.push({
          id: update.id,
          error: (error as Error).message,
        });
      }

      // 延迟
      if (this.config.delayMs > 0) {
        await this.delay(this.config.delayMs);
      }
    }

    return result;
  }

  /**
   * 批量复制模板
   */
  async batchCloneTemplates(
    sourceIds: string[],
    userId: string,
    suffix: string = '_copy'
  ): Promise<BatchOperationResult> {
    const result: BatchOperationResult = {
      total: sourceIds.length,
      success: 0,
      failed: 0,
      errors: [],
      details: [],
    };

    for (const sourceId of sourceIds) {
      try {
        // 获取源模板
        const sourceResult = await this.env.DB!.prepare(
          `SELECT * FROM push_templates WHERE id = ? AND user_id = ?`
        )
          .bind(sourceId, userId)
          .first<any>();

        if (!sourceResult) {
          result.failed++;
          result.errors.push({ id: sourceId, error: '源模板不存在' });
          continue;
        }

        // 创建副本
        const newId = crypto.randomUUID();
        const now = new Date().toISOString();

        await this.env.DB!.prepare(
          `INSERT INTO push_templates (id, user_id, name, title_template, content_template, 
           description, variables, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            newId,
            userId,
            `${sourceResult.name}${suffix}`,
            sourceResult.title_template,
            sourceResult.content_template,
            sourceResult.description,
            sourceResult.variables,
            now,
            now
          )
          .run();

        result.success++;
        result.details?.push({
          sourceId,
          newId,
          name: `${sourceResult.name}${suffix}`,
        });
      } catch (error) {
        result.failed++;
        result.errors.push({
          id: sourceId,
          error: (error as Error).message,
        });
      }

      // 延迟
      if (this.config.delayMs > 0) {
        await this.delay(this.config.delayMs);
      }
    }

    return result;
  }

  /**
   * 分批处理数组
   */
  private splitIntoBatches<T>(items: T[]): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += this.config.maxBatchSize) {
      batches.push(items.slice(i, i + this.config.maxBatchSize));
    }
    return batches;
  }

  /**
   * 并发限制
   */
  private async concurrencyLimit<T>(
    promises: Promise<T>[],
    limit: number
  ): Promise<T[]> {
    const results: T[] = [];
    const executing: Promise<T>[] = [];

    for (const promise of promises) {
      const p = Promise.resolve(promise).then((result) => {
        const index = executing.indexOf(p);
        if (index > -1) {
          executing.splice(index, 1);
        }
        return result;
      });

      executing.push(p);

      if (executing.length >= limit) {
        const result = await Promise.race(executing);
        results.push(result);
        const idx = executing.indexOf(p);
        if (idx > -1) {
          executing.splice(idx, 1);
        }
      }
    }

    // 等待剩余的完成
    const remaining = await Promise.allSettled(executing);
    remaining.forEach((r) => {
      if (r.status === 'fulfilled') {
        results.push(r.value);
      }
    });

    return results;
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 执行渠道健康检查
   */
  private async performHealthCheck(channel: any): Promise<{
    success: boolean;
    error?: string;
  }> {
    // 简单的健康检查实现
    // 实际应该调用渠道特定的健康检查
    try {
      // 这里只是简单的测试，实际应该测试真实的连接
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 获取批量操作统计
   */
  async getBatchStats(userId: string): Promise<{
    channels: number;
    templates: number;
    groups: number;
    scheduled: number;
  }> {
    const [channels, templates, groups, scheduled] = await Promise.all([
      this.env.DB!.prepare('SELECT COUNT(*) as count FROM channel_configs WHERE user_id = ?')
        .bind(userId)
        .first<{ count: number }>(),
      this.env.DB!.prepare('SELECT COUNT(*) as count FROM push_templates WHERE user_id = ?')
        .bind(userId)
        .first<{ count: number }>(),
      this.env.DB!.prepare('SELECT COUNT(*) as count FROM channel_groups WHERE user_id = ?')
        .bind(userId)
        .first<{ count: number }>(),
      this.env.DB!.prepare('SELECT COUNT(*) as count FROM scheduled_pushes WHERE user_id = ?')
        .bind(userId)
        .first<{ count: number }>(),
    ]);

    return {
      channels: channels?.count || 0,
      templates: templates?.count || 0,
      groups: groups?.count || 0,
      scheduled: scheduled?.count || 0,
    };
  }
}
