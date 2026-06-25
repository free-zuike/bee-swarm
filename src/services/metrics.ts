import type { Env } from '../types';
import { getMetrics, upsertMetrics, deleteMetrics } from './d1DataService';

export interface PushMetrics {
  total: number;
  success: number;
  failed: number;
  byChannel: Record<string, { success: number; failed: number }>;
  avgLatency: number;
  lastPushAt?: string;
}

export interface DailyMetrics {
  date: string;
  pushes: number;
  success: number;
  failed: number;
  byChannel: Record<string, number>;
}

export class MetricsCollector {
  private env: Env;
  private userId: string;
  private metricsId: string;
  private sessionMetrics: PushMetrics;
  private startTime: number;
  private lastPushSuccess?: boolean;

  constructor(env: Env, userId: string) {
    this.env = env;
    this.userId = userId;
    this.metricsId = crypto.randomUUID();
    this.startTime = Date.now();
    this.sessionMetrics = {
      total: 0,
      success: 0,
      failed: 0,
      byChannel: {},
      avgLatency: 0,
    };
  }

  async loadSessionMetrics(): Promise<void> {
    try {
      const d1Metrics = await getMetrics(this.env, this.userId);
      if (d1Metrics) {
        this.metricsId = d1Metrics.id;
        this.sessionMetrics = {
          total: d1Metrics.total,
          success: d1Metrics.success,
          failed: d1Metrics.failed,
          byChannel: (d1Metrics.channelStats || {}) as Record<string, { success: number; failed: number }>,
          avgLatency: d1Metrics.avgLatency || 0,
        };
      }
    } catch {
      // Ignore load errors
    }
  }

  async recordPush(channel: string, success: boolean, latencyMs: number): Promise<void> {
    await this.loadSessionMetrics();

    const prevTotal = this.sessionMetrics.total;
    const prevAvgLatency = this.sessionMetrics.avgLatency;
    const prevSuccess = this.sessionMetrics.success;
    const prevFailed = this.sessionMetrics.failed;
    const prevByChannel = this.sessionMetrics.byChannel;

    this.sessionMetrics.total++;
    this.sessionMetrics.avgLatency =
      (prevAvgLatency * prevTotal + latencyMs) / this.sessionMetrics.total;

    if (success) {
      this.sessionMetrics.success = prevSuccess + 1;
    } else {
      this.sessionMetrics.failed = prevFailed + 1;
    }

    const updatedByChannel = { ...prevByChannel };
    if (!updatedByChannel[channel]) {
      updatedByChannel[channel] = { success: 0, failed: 0 };
    }
    if (success) {
      updatedByChannel[channel].success++;
    } else {
      updatedByChannel[channel].failed++;
    }
    this.sessionMetrics.byChannel = updatedByChannel;

    this.sessionMetrics.lastPushAt = new Date().toISOString();
    this.lastPushSuccess = success;

    await this.persistMetrics();
  }

  private async persistMetrics(): Promise<void> {
    try {
      const now = new Date().toISOString();
      const today = this.formatDate();

      // 获取现有的每日统计数据
      let dailyStats: Record<
        string,
        { pushes: number; success: number; failed: number; byChannel: Record<string, number> }
      > = {};
      try {
        const existing = await getMetrics(this.env, this.userId);
        if (existing && existing.dailyStats) {
          dailyStats = existing.dailyStats as Record<string, { pushes: number; success: number; failed: number; byChannel: Record<string, number> }>;
        }
      } catch {
        // Ignore error loading existing stats
      }

      // 更新今日统计
      if (!dailyStats[today]) {
        dailyStats[today] = { pushes: 0, success: 0, failed: 0, byChannel: {} };
      }
      dailyStats[today].pushes++;
      if (this.lastPushSuccess) {
        dailyStats[today].success++;
      } else {
        dailyStats[today].failed++;
      }

      const d1Metrics = {
        id: this.metricsId,
        userId: this.userId,
        total: this.sessionMetrics.total,
        success: this.sessionMetrics.success,
        failed: this.sessionMetrics.failed,
        channelStats: this.sessionMetrics.byChannel,
        dailyStats,
        createdAt: now,
        updatedAt: now,
        avgLatency: this.sessionMetrics.avgLatency,
      };
      await upsertMetrics(this.env, d1Metrics);
    } catch {
      // Ignore persist errors
    }
  }

  private formatDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  getSessionMetrics(): PushMetrics {
    return { ...this.sessionMetrics };
  }

  async getDailyMetrics(days = 7): Promise<DailyMetrics[]> {
    const result: DailyMetrics[] = [];

    try {
      const d1Metrics = await getMetrics(this.env, this.userId);
      if (d1Metrics && d1Metrics.dailyStats) {
        const metrics = d1Metrics.dailyStats as Record<string, { pushes: number; success: number; failed: number; byChannel?: Record<string, number> }>;
        const today = new Date();

        for (let i = 0; i < days; i++) {
          const date = new Date(today);
          date.setDate(date.getDate() - i);
          const dateStr = date.toISOString().split('T')[0];
          const dayData = metrics[dateStr] || { pushes: 0, success: 0, failed: 0 };

          result.push({
            date: dateStr,
            pushes: dayData.pushes,
            success: dayData.success,
            failed: dayData.failed,
            byChannel: dayData.byChannel || {},
          });
        }
      }
    } catch {
      // Return empty metrics on error
    }

    return result;
  }

  async getSuccessRate(): Promise<{ rate: number; trend: 'up' | 'down' | 'stable' }> {
    const metrics = await this.getDailyMetrics(7);
    if (metrics.length < 2) {
      return {
        rate:
          this.sessionMetrics.total > 0
            ? (this.sessionMetrics.success / this.sessionMetrics.total) * 100
            : 0,
        trend: 'stable',
      };
    }

    const recent = metrics.slice(0, 3);
    const older = metrics.slice(3, 7);

    const recentSuccess = recent.reduce((sum, m) => sum + m.success, 0);
    const recentTotal = recent.reduce((sum, m) => sum + m.pushes, 0);
    const olderSuccess = older.reduce((sum, m) => sum + m.success, 0);
    const olderTotal = older.reduce((sum, m) => sum + m.pushes, 0);

    const recentRate = recentTotal > 0 ? recentSuccess / recentTotal : 0;
    const olderRate = olderTotal > 0 ? olderSuccess / olderTotal : 0;

    const rate =
      this.sessionMetrics.total > 0
        ? (this.sessionMetrics.success / this.sessionMetrics.total) * 100
        : recentRate * 100;

    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (recentRate > olderRate * 1.05) trend = 'up';
    else if (recentRate < olderRate * 0.95) trend = 'down';

    return { rate, trend };
  }
}
