// ============================================
// Cloudflare 服务集成示例
// 展示如何在应用中使用新增的 Cloudflare 服务
// ============================================

import type { Env } from '../types';
import {
  createKVLimiter,
  CacheService,
  VectorizeService,
  AnalyticsService,
  PushStatisticsCollector,
  D1AnalyticsService,
} from '../cloudflare-services';

/**
 * 初始化 Cloudflare 服务
 */
export class CloudflareServices {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * 获取缓存服务
   */
  getCacheService(): CacheService {
    return new CacheService();
  }

  /**
   * 获取向量搜索服务
   */
  getVectorizeService(): VectorizeService {
    return new VectorizeService(this.env);
  }

  /**
   * 获取分析服务
   */
  getAnalyticsService(): AnalyticsService {
    return new AnalyticsService(this.env);
  }

  /**
   * 获取 D1 分析服务
   */
  getD1AnalyticsService(): D1AnalyticsService {
    return new D1AnalyticsService(this.env);
  }

  /**
   * 获取推送统计收集器
   */
  getPushStatisticsCollector(userId: string): PushStatisticsCollector {
    return new PushStatisticsCollector(this.env, userId);
  }
}

/**
 * 健康检查集成
 */
export async function recordHealthCheck(
  env: Env,
  userId: string,
  channel: string,
  healthy: boolean,
  latencyMs: number,
  message: string,
  error?: string
): Promise<void> {
  if (!env.HEALTH_TRACKER) {
    return;
  }

  const stub = env.HEALTH_TRACKER.get(env.HEALTH_TRACKER.idFromName(`health-${userId}`));

  try {
    await stub.fetch('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'record',
        data: {
          channel,
          healthy,
          lastCheckTime: new Date().toISOString(),
          consecutiveFailures: healthy ? 0 : 1,
          totalChecks: 1,
          successRate: healthy ? 1 : 0,
          averageLatency: latencyMs,
          lastError: error,
          message,
        },
      }),
    });
  } catch {
    console.error(`[Health] Failed to record health check for ${channel}`);
  }
}

/**
 * 获取健康状态摘要
 */
export async function getHealthSummary(
  env: Env,
  userId: string
): Promise<{ total: number; healthy: number; unhealthy: number; successRate: number } | null> {
  if (!env.HEALTH_TRACKER) {
    return null;
  }

  const stub = env.HEALTH_TRACKER.get(env.HEALTH_TRACKER.idFromName(`health-${userId}`));

  try {
    const response = await stub.fetch('http://localhost/?action=summary');
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * 分布式锁辅助函数
 */
export class DistributedLockHelper {
  private env: Env;
  private lockName: string;

  constructor(env: Env, lockName: string) {
    this.env = env;
    this.lockName = lockName;
  }

  /**
   * 获取锁
   */
  async acquire(ttl = 30000): Promise<{ acquired: boolean; lockId?: string }> {
    if (!this.env.TASK_LOCK) {
      return { acquired: true };
    }

    const stub = this.env.TASK_LOCK.get(this.env.TASK_LOCK.idFromName(this.lockName));
    const lockId = `${this.lockName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      const response = await stub.fetch('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'acquire', ownerId: lockId, ttl }),
      });

      const result = await response.json() as { acquired: boolean };
      return {
        acquired: result.acquired,
        lockId: result.acquired ? lockId : undefined,
      };
    } catch {
      return { acquired: true };
    }
  }

  /**
   * 释放锁
   */
  async release(lockId: string): Promise<void> {
    if (!this.env.TASK_LOCK) {
      return;
    }

    const stub = this.env.TASK_LOCK.get(this.env.TASK_LOCK.idFromName(this.lockName));

    try {
      await stub.fetch('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'release', ownerId: lockId }),
      });
    } catch {
      console.error(`[Lock] Failed to release lock: ${this.lockName}`);
    }
  }
}

/**
 * 模板搜索辅助函数
 */
export async function searchTemplates(
  env: Env,
  query: string,
  userId: string
): Promise<Array<{ id: string; name: string; category: string; score: number }>> {
  const service = new VectorizeService(env);

  if (!service.isAvailable()) {
    return [];
  }

  const result = await service.searchTemplates(query, userId);
  return result.templates;
}

/**
 * 获取模板推荐
 */
export async function getTemplateRecommendations(
  env: Env,
  templateId: string,
  userId: string,
  limit = 5
): Promise<Array<{ id: string; name: string; score: number }>> {
  const service = new VectorizeService(env);

  if (!service.isAvailable()) {
    return [];
  }

  return await service.getRecommendations(templateId, userId, limit);
}

/**
 * 记录推送统计
 */
export async function logPushStatistics(
  env: Env,
  userId: string,
  channelId: string,
  success: boolean,
  latencyMs: number,
  errorMessage?: string
): Promise<void> {
  const collector = new PushStatisticsCollector(env, userId);
  await collector.record(channelId, success, latencyMs, errorMessage);
}

/**
 * 获取用户统计摘要
 */
export async function getUserAnalyticsSummary(
  env: Env,
  userId: string,
  days = 7
): Promise<{
  totalPushes: number;
  successCount: number;
  failureCount: number;
  successRate: number;
}> {
  const analytics = new D1AnalyticsService(env);
  return await analytics.getUserSummary(userId, days);
}

/**
 * 获取每日趋势
 */
export async function getUserDailyTrend(
  env: Env,
  userId: string,
  days = 30
): Promise<Array<{ date: string; total: number; success: number; failure: number; successRate: number }>> {
  const analytics = new D1AnalyticsService(env);
  return await analytics.getDailyTrend(userId, days);
}