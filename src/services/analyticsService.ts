// ============================================
// Analytics Engine 分析服务
// 用于收集和分析推送统计数据
// 免费额度：10 million 数据点/月
// ============================================

import type { Env } from '../types';

/**
 * 推送分析事件
 */
export interface PushAnalyticsEvent {
  eventType: 'push' | 'push_success' | 'push_failure' | 'channel_check' | 'user_action';
  userId: string;
  channelId?: string;
  status?: 'success' | 'failure';
  latencyMs?: number;
  errorMessage?: string;
  metadata?: Record<string, string | number | boolean>;
}

/**
 * 分析查询
 */
export interface AnalyticsQuery {
  start: string;
  end: string;
  userId?: string;
  eventType?: string;
  channelId?: string;
}

/**
 * 分析摘要
 */
export interface AnalyticsSummary {
  totalPushes: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgLatency: number;
  topChannels: Array<{ channelId: string; count: number }>;
  hourlyDistribution: Array<{ hour: number; count: number }>;
}

/**
 * Analytics Engine 服务
 */
export class AnalyticsService {
  private env: Env;
  private dataset: string;
  private analytics: AnalyticsEngineDataset | undefined;

  constructor(env: Env, dataset = 'bee-swarm-analytics') {
    this.env = env;
    this.dataset = dataset;
    this.analytics = env.ANALYTICS;
  }

  /**
   * 检查是否可用
   */
  isAvailable(): boolean {
    return !!this.analytics;
  }

  /**
   * 记录推送事件
   */
  async recordPushEvent(event: Omit<PushAnalyticsEvent, 'timestamp'>): Promise<void> {
    if (!this.analytics) {
      return;
    }

    try {
      await this.analytics.writeDataPoint({
        indexes: [
          event.userId,
          event.eventType,
          event.channelId || 'unknown',
          event.status || 'unknown',
        ],
        doubles: [event.latencyMs || 0, 1],
        blobs: [
          JSON.stringify({
            error: event.errorMessage,
            metadata: event.metadata,
          }),
        ],
      });
    } catch {
      console.error('[Analytics] Failed to record event');
    }
  }

  /**
   * 记录推送成功
   */
  async recordPushSuccess(
    userId: string,
    channelId: string,
    latencyMs: number,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.recordPushEvent({
      eventType: 'push_success',
      userId,
      channelId,
      status: 'success',
      latencyMs,
      metadata: metadata as Record<string, string | number | boolean>,
    });
  }

  /**
   * 记录推送失败
   */
  async recordPushFailure(
    userId: string,
    channelId: string,
    latencyMs: number,
    errorMessage: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.recordPushEvent({
      eventType: 'push_failure',
      userId,
      channelId,
      status: 'failure',
      latencyMs,
      errorMessage,
      metadata: metadata as Record<string, string | number | boolean>,
    });
  }

  /**
   * 记录用户行为
   */
  async recordUserAction(
    userId: string,
    action: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.recordPushEvent({
      eventType: 'user_action',
      userId,
      metadata: { action, ...(metadata as Record<string, string | number | boolean>) },
    });
  }
}

/**
 * D1 分析服务
 * 使用 D1 数据库查询分析数据
 */
export class D1AnalyticsService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * 获取用户统计摘要
   */
  async getUserSummary(userId: string, days = 7): Promise<AnalyticsSummary> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoff = cutoffDate.toISOString();

    try {
      const stats = await this.env
        .DB!.prepare(
          `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
          SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) as failure_count,
          AVG(latency_ms) as avg_latency
        FROM push_history
        WHERE user_id = ? AND created_at >= ?`
        )
        .bind(userId, cutoff)
        .first<{
          total: number;
          success_count: number;
          failure_count: number;
          avg_latency: number;
        }>();

      const topChannels = await this.env
        .DB!.prepare(
          `SELECT channel, COUNT(*) as count
        FROM push_history
        WHERE user_id = ? AND created_at >= ?
        GROUP BY channel
        ORDER BY count DESC
        LIMIT 5`
        )
        .bind(userId, cutoff)
        .all<{ channel: string; count: number }>();

      const total = stats?.total || 0;
      const successCount = stats?.success_count || 0;
      const failureCount = stats?.failure_count || 0;
      const successRate = total > 0 ? (successCount / total) * 100 : 0;

      return {
        totalPushes: total,
        successCount,
        failureCount,
        successRate: Math.round(successRate * 100) / 100,
        avgLatency: Math.round((stats?.avg_latency || 0) * 100) / 100,
        topChannels: (topChannels.results || []).map((r) => ({
          channelId: r.channel,
          count: r.count,
        })),
        hourlyDistribution: [],
      };
    } catch {
      return {
        totalPushes: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        avgLatency: 0,
        topChannels: [],
        hourlyDistribution: [],
      };
    }
  }

  /**
   * 获取每日趋势
   */
  async getDailyTrend(
    userId: string,
    days = 30
  ): Promise<
    Array<{
      date: string;
      total: number;
      success: number;
      failure: number;
      successRate: number;
    }>
  > {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoff = cutoffDate.toISOString();

    try {
      const results = await this.env
        .DB!.prepare(
          `SELECT 
          DATE(created_at) as date,
          COUNT(*) as total,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
          SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) as failure
        FROM push_history
        WHERE user_id = ? AND created_at >= ?
        GROUP BY DATE(created_at)
        ORDER BY date DESC`
        )
        .bind(userId, cutoff)
        .all<{
          date: string;
          total: number;
          success: number;
          failure: number;
        }>();

      return (results.results || []).map((row) => ({
        date: row.date,
        total: row.total,
        success: row.success,
        failure: row.failure,
        successRate: row.total > 0 ? Math.round((row.success / row.total) * 10000) / 100 : 0,
      }));
    } catch {
      return [];
    }
  }

  /**
   * 获取渠道性能
   */
  async getChannelPerformance(
    userId: string,
    days = 7
  ): Promise<
    Array<{
      channelId: string;
      total: number;
      success: number;
      failure: number;
      successRate: number;
      avgLatency: number;
    }>
  > {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoff = cutoffDate.toISOString();

    try {
      const results = await this.env
        .DB!.prepare(
          `SELECT 
          channel as channelId,
          COUNT(*) as total,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
          SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) as failure,
          AVG(latency_ms) as avgLatency
        FROM push_history
        WHERE user_id = ? AND created_at >= ?
        GROUP BY channel
        ORDER BY total DESC`
        )
        .bind(userId, cutoff)
        .all<{
          channelId: string;
          total: number;
          success: number;
          failure: number;
          avgLatency: number;
        }>();

      return (results.results || []).map((row) => ({
        ...row,
        successRate: row.total > 0 ? Math.round((row.success / row.total) * 10000) / 100 : 0,
        avgLatency: Math.round(row.avgLatency * 100) / 100,
      }));
    } catch {
      return [];
    }
  }

  /**
   * 获取实时统计
   */
  async getRealtimeStats(userId: string): Promise<{
    last24h: { total: number; successRate: number };
    lastHour: { total: number; successRate: number };
  }> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    try {
      const [last24h, lastHour] = await Promise.all([
        this.env
          .DB!.prepare(
            `SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success
          FROM push_history
          WHERE user_id = ? AND created_at >= ?`
          )
          .bind(userId, oneDayAgo)
          .first<{ total: number; success: number }>(),

        this.env
          .DB!.prepare(
            `SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success
          FROM push_history
          WHERE user_id = ? AND created_at >= ?`
          )
          .bind(userId, oneHourAgo)
          .first<{ total: number; success: number }>(),
      ]);

      return {
        last24h: {
          total: last24h?.total || 0,
          successRate:
            (last24h?.total || 0) > 0
              ? Math.round(((last24h?.success || 0) / last24h!.total) * 10000) / 100
              : 0,
        },
        lastHour: {
          total: lastHour?.total || 0,
          successRate:
            (lastHour?.total || 0) > 0
              ? Math.round(((lastHour?.success || 0) / lastHour!.total) * 10000) / 100
              : 0,
        },
      };
    } catch {
      return {
        last24h: { total: 0, successRate: 0 },
        lastHour: { total: 0, successRate: 0 },
      };
    }
  }
}

/**
 * 推送统计收集器
 */
export class PushStatisticsCollector {
  private analyticsService: AnalyticsService;
  private userId: string;

  constructor(env: Env, userId: string) {
    this.analyticsService = new AnalyticsService(env);
    this.userId = userId;
  }

  /**
   * 记录一次推送
   */
  async record(
    channelId: string,
    success: boolean,
    latencyMs: number,
    errorMessage?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (success) {
      await this.analyticsService.recordPushSuccess(this.userId, channelId, latencyMs, metadata);
    } else {
      await this.analyticsService.recordPushFailure(
        this.userId,
        channelId,
        latencyMs,
        errorMessage || 'Unknown error',
        metadata
      );
    }
  }

  /**
   * 记录多次推送结果
   */
  async recordBatch(
    results: Array<{
      channelId: string;
      success: boolean;
      latencyMs: number;
      errorMessage?: string;
    }>
  ): Promise<void> {
    await Promise.all(
      results.map((r) => this.record(r.channelId, r.success, r.latencyMs, r.errorMessage))
    );
  }
}
