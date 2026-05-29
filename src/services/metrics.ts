import type { Env } from '../types';

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
  private sessionMetrics: PushMetrics;
  private startTime: number;

  constructor(env: Env, userId: string) {
    this.env = env;
    this.userId = userId;
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
      const stored = await this.env.SUBSCRIPTIONS.get(`metrics:session:${this.userId}`);
      if (stored) {
        const data = JSON.parse(stored);
        this.sessionMetrics = {
          total: data.total || 0,
          success: data.success || 0,
          failed: data.failed || 0,
          byChannel: data.byChannel || {},
          avgLatency: data.avgLatency || 0,
          lastPushAt: data.lastPushAt,
        };
      }
    } catch {
      // Ignore load errors
    }
  }

  async recordPush(channel: string, success: boolean, latencyMs: number): Promise<void> {
    this.sessionMetrics.total++;
    this.sessionMetrics.avgLatency =
      (this.sessionMetrics.avgLatency * (this.sessionMetrics.total - 1) + latencyMs) /
      this.sessionMetrics.total;

    if (success) {
      this.sessionMetrics.success++;
    } else {
      this.sessionMetrics.failed++;
    }

    if (!this.sessionMetrics.byChannel[channel]) {
      this.sessionMetrics.byChannel[channel] = { success: 0, failed: 0 };
    }
    if (success) {
      this.sessionMetrics.byChannel[channel].success++;
    } else {
      this.sessionMetrics.byChannel[channel].failed++;
    }

    this.sessionMetrics.lastPushAt = new Date().toISOString();

    await this.persistMetrics();
    await this.persistSessionMetrics();
  }

  private async persistSessionMetrics(): Promise<void> {
    try {
      await this.env.SUBSCRIPTIONS.put(
        `metrics:session:${this.userId}`,
        JSON.stringify(this.sessionMetrics),
        { expirationTtl: 7 * 24 * 3600 }
      );
    } catch {
      // Ignore persist errors
    }
  }

  private async persistMetrics(): Promise<void> {
    const key = `metrics:${this.userId}`;
    try {
      const existing = await this.env.SUBSCRIPTIONS.get(key);
      const metrics = existing ? JSON.parse(existing) : {};
      metrics[this.formatDate()] = {
        pushes: this.sessionMetrics.total,
        success: this.sessionMetrics.success,
        failed: this.sessionMetrics.failed,
      };
      await this.env.SUBSCRIPTIONS.put(key, JSON.stringify(metrics));
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
    const key = `metrics:${this.userId}`;
    const result: DailyMetrics[] = [];

    try {
      const stored = await this.env.SUBSCRIPTIONS.get(key);
      if (stored) {
        const metrics = JSON.parse(stored);
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
