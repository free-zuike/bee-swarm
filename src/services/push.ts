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
  variables?: TemplateVariable[];
}

export interface TemplateVariable {
  key: string;
  defaultValue: string;
  description?: string;
}

export function replaceTemplateVariables(
  text: string,
  variables: Record<string, string>,
  autoVars: boolean = true
): string {
  if (!text) return text;

  if (autoVars) {
    const now = new Date();
    variables = {
      ...variables,
      date: now.toLocaleDateString('zh-CN'),
      time: now.toLocaleTimeString('zh-CN'),
      datetime: now.toLocaleString('zh-CN'),
      timestamp: String(now.getTime()),
      year: String(now.getFullYear()),
      month: String(now.getMonth() + 1).padStart(2, '0'),
      day: String(now.getDate()).padStart(2, '0'),
    };
  }

  return text.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    return variables[key] !== undefined ? variables[key] : _match;
  });
}

export function extractVariables(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
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
  scheduleType?: 'once' | 'recurring';
  recurringType?:
    | 'hourly'
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'interval'
    | 'cron'
    | 'intervalMonth'
    | 'yearly'
    | 'intervalYear';
  selectedWeekDays?: number[];
  selectedMonthDays?: number[];
  intervalHours?: number;
  intervalMonths?: number;
  intervalYears?: number;
  cronExpression?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'overdue';
  createdBy: string;
  createdAt?: string;
  completedAt?: string;
  results?: ChannelResult[];
  overdueReminderSent?: boolean;
  overdueAt?: string;
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
    if (!this.env.DB) return [];
    
    const result = await this.env.DB.prepare(
      'SELECT * FROM push_templates WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(this.userId).all<any>();

    return (result.results || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      title: row.title || '',
      content: row.body || '',
      channels: row.channels ? JSON.parse(row.channels) : [],
      url: row.url,
      imageUrl: row.image_url,
      useMarkdown: row.markdown === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async saveTemplate(
    template: Omit<PushTemplate, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<PushTemplate> {
    if (!this.env.DB) throw new Error('D1 数据库未配置');
    
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.env.DB.prepare(`
      INSERT INTO push_templates (id, user_id, name, title, body, channels, url, image_url, markdown, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      this.userId,
      template.name,
      template.title,
      template.content || '',
      template.channels ? JSON.stringify(template.channels) : null,
      template.url || null,
      template.imageUrl || null,
      template.useMarkdown ? 1 : 0,
      now,
      now
    ).run();

    return {
      ...template,
      id,
      createdAt: now,
      updatedAt: now,
    };
  }

  async updateTemplate(id: string, updates: Partial<PushTemplate>): Promise<PushTemplate | null> {
    if (!this.env.DB) return null;
    
    const now = new Date().toISOString();
    
    const fields: string[] = ['updated_at = ?'];
    const values: any[] = [now];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.content !== undefined) {
      fields.push('body = ?');
      values.push(updates.content);
    }
    if (updates.channels !== undefined) {
      fields.push('channels = ?');
      values.push(JSON.stringify(updates.channels));
    }
    if (updates.url !== undefined) {
      fields.push('url = ?');
      values.push(updates.url);
    }
    if (updates.imageUrl !== undefined) {
      fields.push('image_url = ?');
      values.push(updates.imageUrl);
    }
    if (updates.useMarkdown !== undefined) {
      fields.push('markdown = ?');
      values.push(updates.useMarkdown ? 1 : 0);
    }

    values.push(id, this.userId);

    await this.env.DB.prepare(
      `UPDATE push_templates SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`
    ).bind(...values).run();

    const templates = await this.getTemplates();
    return templates.find(t => t.id === id) || null;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    if (!this.env.DB) return false;
    
    const result = await this.env.DB.prepare(
      'DELETE FROM push_templates WHERE id = ? AND user_id = ?'
    ).bind(id, this.userId).run();
    
    return result.success && (result.meta?.changes || 0) > 0;
  }

  async getChannelGroups(): Promise<ChannelGroup[]> {
    if (!this.env.DB) return [];
    
    const result = await this.env.DB.prepare(
      'SELECT * FROM channel_groups WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(this.userId).all<any>();

    return (result.results || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      channels: JSON.parse(row.channels || '[]'),
      createdAt: row.created_at,
    }));
  }

  async saveChannelGroup(group: Omit<ChannelGroup, 'id' | 'createdAt'>): Promise<ChannelGroup> {
    if (!this.env.DB) throw new Error('D1 数据库未配置');
    
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.env.DB.prepare(`
      INSERT INTO channel_groups (id, user_id, name, channels, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      this.userId,
      group.name,
      JSON.stringify(group.channels),
      now,
      now
    ).run();

    return {
      ...group,
      id,
      createdAt: now,
    };
  }

  async deleteChannelGroup(id: string): Promise<boolean> {
    if (!this.env.DB) return false;
    
    const result = await this.env.DB.prepare(
      'DELETE FROM channel_groups WHERE id = ? AND user_id = ?'
    ).bind(id, this.userId).run();
    
    return result.success && (result.meta?.changes || 0) > 0;
  }

  async updateChannelGroup(
    id: string,
    updates: { name?: string; channels?: PushChannel[] }
  ): Promise<ChannelGroup | null> {
    if (!this.env.DB) return null;
    
    const now = new Date().toISOString();
    
    const fields: string[] = ['updated_at = ?'];
    const values: any[] = [now];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.channels !== undefined) {
      fields.push('channels = ?');
      values.push(JSON.stringify(updates.channels));
    }

    values.push(id, this.userId);

    await this.env.DB.prepare(
      `UPDATE channel_groups SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`
    ).bind(...values).run();

    const groups = await this.getChannelGroups();
    return groups.find(g => g.id === id) || null;
  }

  async getScheduledPushes(
    status?: 'pending' | 'processing' | 'completed' | 'failed' | 'overdue'
  ): Promise<ScheduledPush[]> {
    if (!this.env.DB) return [];
    
    let sql = 'SELECT * FROM scheduled_pushes WHERE user_id = ?';
    const params: any[] = [this.userId];
    
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    
    sql += ' ORDER BY next_run ASC';

    const result = await this.env.DB.prepare(sql).bind(...params).all<any>();

    return (result.results || []).map((row: any) => ({
      id: row.id,
      templateId: row.template_id,
      title: row.title || '',
      content: row.body || '',
      channels: JSON.parse(row.channels || '[]'),
      url: row.url,
      scheduledAt: new Date(row.next_run).toISOString(),
      scheduleType: row.enabled ? 'recurring' : 'once',
      enabled: row.enabled === 1,
      createdBy: row.user_id,
      createdAt: row.created_at,
      status: row.status,
      overdueReminderSent: row.overdue_reminder_sent === 1,
    }));
  }

  async createScheduledPush(
    push: Omit<ScheduledPush, 'id' | 'status' | 'createdBy'>
  ): Promise<ScheduledPush> {
    if (!this.env.DB) throw new Error('D1 数据库未配置');
    
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const nextRun = new Date(push.scheduledAt).getTime();

    await this.env.DB.prepare(`
      INSERT INTO scheduled_pushes (
        id, user_id, template_id, cron, next_run, title, body, url, channels, enabled, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      this.userId,
      push.templateId || null,
      push.cronExpression || '* * * * *',
      nextRun,
      push.title,
      push.content || '',
      push.url || null,
      JSON.stringify(push.channels),
      push.scheduleType === 'recurring' ? 1 : 0,
      now,
      now
    ).run();

    return {
      ...push,
      id,
      status: 'pending',
      createdBy: this.userId,
    };
  }

  async updateScheduledPush(
    id: string,
    updates: Partial<Omit<ScheduledPush, 'id' | 'createdBy' | 'createdAt'>>
  ): Promise<ScheduledPush | null> {
    if (!this.env.DB) return null;
    
    const now = new Date().toISOString();
    const fields: string[] = ['updated_at = ?'];
    const values: any[] = [now];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.content !== undefined) {
      fields.push('body = ?');
      values.push(updates.content);
    }
    if (updates.channels !== undefined) {
      fields.push('channels = ?');
      values.push(JSON.stringify(updates.channels));
    }
    if (updates.url !== undefined) {
      fields.push('url = ?');
      values.push(updates.url);
    }
    if (updates.scheduledAt !== undefined) {
      fields.push('next_run = ?');
      values.push(new Date(updates.scheduledAt).getTime());
    }

    values.push(id, this.userId);

    await this.env.DB.prepare(
      `UPDATE scheduled_pushes SET ${fields.join(', ')} WHERE id = ? AND user_id = ? AND status = 'pending'`
    ).bind(...values).run();

    const pushes = await this.getScheduledPushes();
    return pushes.find(p => p.id === id) || null;
  }

  async deleteScheduledPush(id: string): Promise<boolean> {
    if (!this.env.DB) return false;
    
    const result = await this.env.DB.prepare(
      'DELETE FROM scheduled_pushes WHERE id = ? AND user_id = ?'
    ).bind(id, this.userId).run();
    
    return result.success && (result.meta?.changes || 0) > 0;
  }

  async cancelScheduledPush(id: string): Promise<boolean> {
    if (!this.env.DB) return false;
    
    const result = await this.env.DB.prepare(
      "UPDATE scheduled_pushes SET status = 'failed', updated_at = ? WHERE id = ? AND user_id = ? AND status = 'pending'"
    ).bind(new Date().toISOString(), id, this.userId).run();
    
    return result.success && (result.meta?.changes || 0) > 0;
  }

  async batchCancelScheduledPushes(
    ids: string[]
  ): Promise<{ cancelled: number; notFound: number }> {
    if (!this.env.DB || ids.length === 0) return { cancelled: 0, notFound: ids.length };
    
    const placeholders = ids.map(() => '?').join(',');
    const result = await this.env.DB.prepare(
      `UPDATE scheduled_pushes SET status = 'failed', updated_at = ? WHERE id IN (${placeholders}) AND user_id = ? AND status = 'pending'`
    ).bind(new Date().toISOString(), ...ids, this.userId).run();
    
    return {
      cancelled: result.meta?.changes || 0,
      notFound: ids.length - (result.meta?.changes || 0)
    };
  }

  async batchEnableScheduledPushes(ids: string[]): Promise<{ enabled: number; notFound: number }> {
    if (!this.env.DB || ids.length === 0) return { enabled: 0, notFound: ids.length };
    
    const placeholders = ids.map(() => '?').join(',');
    const result = await this.env.DB.prepare(
      `UPDATE scheduled_pushes SET status = 'pending', updated_at = ? WHERE id IN (${placeholders}) AND user_id = ? AND status = 'failed'`
    ).bind(new Date().toISOString(), ...ids, this.userId).run();
    
    return {
      enabled: result.meta?.changes || 0,
      notFound: ids.length - (result.meta?.changes || 0)
    };
  }

  async updateScheduledPushStatus(id: string, status: ScheduledPush['status']): Promise<void> {
    if (!this.env.DB) return;
    
    const completedAt = status === 'completed' ? new Date().toISOString() : null;
    
    await this.env.DB.prepare(`
      UPDATE scheduled_pushes SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?
    `).bind(status, new Date().toISOString(), id, this.userId).run();
  }

  async updateScheduledPushAndTime(
    id: string,
    status: ScheduledPush['status'],
    nextScheduledAt: string
  ): Promise<void> {
    if (!this.env.DB) return;
    
    await this.env.DB.prepare(`
      UPDATE scheduled_pushes SET status = ?, next_run = ?, updated_at = ? WHERE id = ? AND user_id = ?
    `).bind(status, new Date(nextScheduledAt).getTime(), new Date().toISOString(), id, this.userId).run();
  }

  async markPushAsOverdue(id: string): Promise<void> {
    if (!this.env.DB) return;
    
    await this.env.DB.prepare(`
      UPDATE scheduled_pushes SET status = 'overdue', updated_at = ? WHERE id = ? AND user_id = ? AND status = 'pending'
    `).bind(new Date().toISOString(), id, this.userId).run();
  }

  async getOverdueTasks(): Promise<ScheduledPush[]> {
    return this.getScheduledPushes('overdue');
  }

  async rescheduleOverdueTask(id: string, newScheduledAt: string): Promise<ScheduledPush | null> {
    if (!this.env.DB) return null;
    
    await this.env.DB.prepare(`
      UPDATE scheduled_pushes SET status = 'pending', next_run = ?, updated_at = ? WHERE id = ? AND user_id = ?
    `).bind(new Date(newScheduledAt).getTime(), new Date().toISOString(), id, this.userId).run();

    const pushes = await this.getScheduledPushes();
    return pushes.find(p => p.id === id) || null;
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

  async detectOverdueTasks(overdueMinutes: number = 30): Promise<ScheduledPush[]> {
    const now = new Date();
    const pushes = await this.getScheduledPushes('pending');
    const overduePushes: ScheduledPush[] = [];

    for (const push of pushes) {
      const scheduledTime = new Date(push.scheduledAt);
      const timeDiffMs = now.getTime() - scheduledTime.getTime();
      const timeDiffMinutes = timeDiffMs / (1000 * 60);

      if (timeDiffMinutes > overdueMinutes && push.status !== 'overdue') {
        await this.markPushAsOverdue(push.id);
        overduePushes.push({ ...push, status: 'overdue' });
      }
    }

    return overduePushes;
  }
  
  /**
   * 检查任务是否已发送超时提醒
   */
  async hasSentOverdueReminder(taskId: string): Promise<boolean> {
    if (!this.env.DB) return false;
    
    const result = await this.env.DB.prepare(
      'SELECT overdue_reminder_sent FROM scheduled_pushes WHERE id = ? AND user_id = ?'
    ).bind(taskId, this.userId).first<{ overdue_reminder_sent: number }>();
    
    return result?.overdue_reminder_sent === 1;
  }
}
