import type { Env, ChannelResult, PushChannel, ChannelConfig } from '../types';
import { MetricsCollector } from './metrics';

export interface PushTemplate {
  id: string;
  name: string;
  title: string;
  content: string;
  channels?: PushChannel[];
  url?: string;
  imageUrl?: string;
  useMarkdown?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelGroup {
  id: string;
  name: string;
  channels: PushChannel[];
  createdAt: string;
}

export interface ScheduledPush {
  id: string;
  templateId?: string;
  title: string;
  content: string;
  channels: PushChannel[];
  url?: string;
  scheduledAt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdBy: string;
}

type PushParams = {
  title: string;
  body?: string;
  url?: string;
  imageUrl?: string;
  markdown?: boolean;
};

export class PushService {
  private env: Env;
  private userId: string;
  private metrics: MetricsCollector;

  constructor(env: Env, userId: string) {
    this.env = env;
    this.userId = userId;
    this.metrics = new MetricsCollector(env, userId);
  }

  async pushConcurrent(
    channels: PushChannel[],
    settings: Record<string, ChannelConfig>,
    payload: PushParams,
    sendFn: (
      channel: PushChannel,
      config: ChannelConfig,
      payload: PushParams
    ) => Promise<ChannelResult>
  ): Promise<{
    results: ChannelResult[];
    metrics: { success: number; failed: number; total: number };
  }> {
    const enabledChannels = channels.filter((ch) => settings[ch]?.enabled);

    if (enabledChannels.length === 0) {
      return {
        results: [],
        metrics: { success: 0, failed: 0, total: 0 },
      };
    }

    const promises = enabledChannels.map(async (channel) => {
      const start = Date.now();
      try {
        const result = await sendFn(channel, settings[channel], payload);
        const latency = Date.now() - start;
        await this.metrics.recordPush(channel, result.success, latency);
        return result;
      } catch (err) {
        const latency = Date.now() - start;
        await this.metrics.recordPush(channel, false, latency);
        return {
          channel,
          success: false,
          message: (err as Error).message,
        };
      }
    });

    const results = await Promise.all(promises);
    const success = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return {
      results,
      metrics: { success, failed, total: results.length },
    };
  }

  async getTemplates(): Promise<PushTemplate[]> {
    const key = `templates:${this.userId}`;
    try {
      const stored = await this.env.SUBSCRIPTIONS.get(key);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  async saveTemplate(
    template: Omit<PushTemplate, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<PushTemplate> {
    const templates = await this.getTemplates();
    const now = new Date().toISOString();
    const newTemplate: PushTemplate = {
      ...template,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    templates.push(newTemplate);
    await this.env.SUBSCRIPTIONS.put(`templates:${this.userId}`, JSON.stringify(templates));
    return newTemplate;
  }

  async updateTemplate(id: string, updates: Partial<PushTemplate>): Promise<PushTemplate | null> {
    const templates = await this.getTemplates();
    const index = templates.findIndex((t) => t.id === id);
    if (index === -1) return null;

    templates[index] = {
      ...templates[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await this.env.SUBSCRIPTIONS.put(`templates:${this.userId}`, JSON.stringify(templates));
    return templates[index];
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const templates = await this.getTemplates();
    const filtered = templates.filter((t) => t.id !== id);
    if (filtered.length === templates.length) return false;
    await this.env.SUBSCRIPTIONS.put(`templates:${this.userId}`, JSON.stringify(filtered));
    return true;
  }

  async getChannelGroups(): Promise<ChannelGroup[]> {
    const key = `channel_groups:${this.userId}`;
    try {
      const stored = await this.env.SUBSCRIPTIONS.get(key);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  async saveChannelGroup(group: Omit<ChannelGroup, 'id' | 'createdAt'>): Promise<ChannelGroup> {
    const groups = await this.getChannelGroups();
    const newGroup: ChannelGroup = {
      ...group,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    groups.push(newGroup);
    await this.env.SUBSCRIPTIONS.put(`channel_groups:${this.userId}`, JSON.stringify(groups));
    return newGroup;
  }

  async deleteChannelGroup(id: string): Promise<boolean> {
    const groups = await this.getChannelGroups();
    const filtered = groups.filter((g) => g.id !== id);
    if (filtered.length === groups.length) return false;
    await this.env.SUBSCRIPTIONS.put(`channel_groups:${this.userId}`, JSON.stringify(filtered));
    return true;
  }

  async getScheduledPushes(
    status?: 'pending' | 'processing' | 'completed' | 'failed'
  ): Promise<ScheduledPush[]> {
    const key = `scheduled:${this.userId}`;
    try {
      const stored = await this.env.SUBSCRIPTIONS.get(key);
      let pushes: ScheduledPush[] = stored ? JSON.parse(stored) : [];
      if (status) {
        pushes = pushes.filter((p) => p.status === status);
      }
      return pushes;
    } catch {
      return [];
    }
  }

  async createScheduledPush(
    push: Omit<ScheduledPush, 'id' | 'status' | 'createdBy'>
  ): Promise<ScheduledPush> {
    const pushes = await this.getScheduledPushes();
    const newPush: ScheduledPush = {
      ...push,
      id: crypto.randomUUID(),
      status: 'pending',
      createdBy: this.userId,
    };
    pushes.push(newPush);
    await this.env.SUBSCRIPTIONS.put(`scheduled:${this.userId}`, JSON.stringify(pushes));
    return newPush;
  }

  async cancelScheduledPush(id: string): Promise<boolean> {
    const key = `scheduled:${this.userId}`;
    try {
      const stored = await this.env.SUBSCRIPTIONS.get(key);
      if (!stored) return false;
      const pushes: ScheduledPush[] = JSON.parse(stored);
      const push = pushes.find((p) => p.id === id);
      if (!push || push.status !== 'pending') return false;
      push.status = 'failed';
      await this.env.SUBSCRIPTIONS.put(key, JSON.stringify(pushes));
      return true;
    } catch {
      return false;
    }
  }

  async processScheduledPushes(): Promise<number> {
    const now = new Date();
    const pushes = await this.getScheduledPushes('pending');
    let processed = 0;

    for (const push of pushes) {
      const scheduledTime = new Date(push.scheduledAt);
      if (scheduledTime <= now) {
        await this.updateScheduledPushStatus(push.id, 'processing');
        processed++;
      }
    }

    return processed;
  }

  private async updateScheduledPushStatus(
    id: string,
    status: ScheduledPush['status']
  ): Promise<void> {
    const key = `scheduled:${this.userId}`;
    const stored = await this.env.SUBSCRIPTIONS.get(key);
    if (!stored) return;

    const pushes: ScheduledPush[] = JSON.parse(stored);
    const push = pushes.find((p) => p.id === id);
    if (push) {
      push.status = status;
      await this.env.SUBSCRIPTIONS.put(key, JSON.stringify(pushes));
    }
  }

  getMetrics(): MetricsCollector {
    return this.metrics;
  }

  async getPushStats(): Promise<{
    session: { total: number; success: number; failed: number };
    trend: { rate: number; direction: 'up' | 'down' | 'stable' };
    recent: Array<{ date: string; pushes: number; success: number; failed: number }>;
  }> {
    await this.metrics.loadSessionMetrics();
    const sessionMetrics = this.metrics.getSessionMetrics();
    const successRate = await this.metrics.getSuccessRate();
    const dailyMetrics = await this.metrics.getDailyMetrics(7);

    return {
      session: {
        total: sessionMetrics.total,
        success: sessionMetrics.success,
        failed: sessionMetrics.failed,
      },
      trend: {
        rate: successRate.rate,
        direction: successRate.trend,
      },
      recent: dailyMetrics.slice(0, 7).reverse(),
    };
  }
}
