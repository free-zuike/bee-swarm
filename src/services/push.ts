import type { Env, ChannelResult, PushChannel, ChannelConfig } from '../types';
import { MetricsCollector } from './metrics';

interface PushTemplateRow {
  id: string;
  name: string;
  title?: string;
  body?: string;
  channels?: string;
  url?: string;
  image_url?: string;
  markdown?: number;
  category?: string;
  variables?: string;
  created_at: string;
  updated_at: string;
}

interface ChannelGroupRow {
  id: string;
  name: string;
  channels?: string;
  created_at: string;
  updated_at?: string;
}

interface ScheduledPushRow {
  id: string;
  template_id?: string;
  title?: string;
  body?: string;
  url?: string;
  channels?: string;
  next_run?: number;
  enabled?: number;
  recurring_type?: string;
  selected_week_days?: string;
  selected_month_days?: string;
  yearly_dates?: string;
  cron?: string;
  timezone?: string;
  status?: string;
  user_id?: string;
  created_at?: string;
  overdue_reminder_sent?: number;
}

export interface PushTemplate {
  id: string;
  name: string;
  title: string;
  content: string;
  channels?: PushChannel[];
  url?: string;
  imageUrl?: string;
  useMarkdown?: boolean;
  category?: string;
  variables?: TemplateVariable[];
  createdAt: string;
  updatedAt: string;
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
  nextRun?: string;
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
  // 每年任务的日期组合数组，每个元素包含月份和日期
  yearlyDates?: Array<{ month: number; day: number }>;
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
  enabled?: boolean;
  // 时区配置，默认使用 Asia/Shanghai
  timezone?: string;
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

  /**
   * 查询单个推送模板（优化：避免查询整个列表）
   */
  private async getTemplateById(id: string): Promise<PushTemplate | null> {
    if (!this.env.DB) return null;

    const result = await this.env.DB.prepare(
      'SELECT * FROM push_templates WHERE id = ? AND user_id = ?'
    )
      .bind(id, this.userId)
      .first<PushTemplateRow>();

    if (!result) return null;

    return {
      id: result.id,
      name: result.name,
      title: result.title || '',
      content: result.body || '',
      channels: result.channels ? JSON.parse(result.channels) : [],
      url: result.url,
      imageUrl: result.image_url,
      useMarkdown: result.markdown === 1,
      category: result.category,
      variables: result.variables ? JSON.parse(result.variables) : [],
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    };
  }

  /**
   * 查询单个渠道分组（优化：避免查询整个列表）
   */
  private async getChannelGroupById(id: string): Promise<ChannelGroup | null> {
    if (!this.env.DB) return null;

    const result = await this.env.DB.prepare(
      'SELECT * FROM channel_groups WHERE id = ? AND user_id = ?'
    )
      .bind(id, this.userId)
      .first<ChannelGroupRow>();

    if (!result) return null;

    return {
      id: result.id,
      name: result.name,
      channels: JSON.parse(result.channels || '[]'),
      createdAt: result.created_at,
    };
  }

  /**
   * 查询单个定时推送（优化：避免查询整个列表）
   */
  private async getScheduledPushById(id: string): Promise<ScheduledPush | null> {
    if (!this.env.DB) return null;

    const result = await this.env.DB.prepare(
      'SELECT * FROM scheduled_pushes WHERE id = ? AND user_id = ?'
    )
      .bind(id, this.userId)
      .first<ScheduledPushRow>();

    if (!result) return null;

    return {
      id: result.id,
      templateId: result.template_id,
      title: result.title || '',
      content: result.body || '',
      channels: JSON.parse(result.channels || '[]'),
      url: result.url,
      scheduledAt: new Date(result.next_run || 0).toISOString(),
      nextRun: new Date(result.next_run || 0).toISOString(),
      scheduleType: result.enabled ? 'recurring' : 'once',
      recurringType: (result.recurring_type as ScheduledPush['recurringType']) || undefined,
      enabled: result.enabled === 1,
      createdBy: result.user_id || '',
      createdAt: result.created_at,
      status: (result.status as ScheduledPush['status']) || 'pending',
      overdueReminderSent: result.overdue_reminder_sent === 1,
      yearlyDates: result.yearly_dates ? JSON.parse(result.yearly_dates) : undefined,
      selectedWeekDays: result.selected_week_days
        ? JSON.parse(result.selected_week_days)
        : undefined,
      selectedMonthDays: result.selected_month_days
        ? JSON.parse(result.selected_month_days)
        : undefined,
      cronExpression: result.cron || undefined,
      timezone: result.timezone || 'Asia/Shanghai', // 如果列不存在，默认值
    };
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

  /**
   * 获取推送模板列表（优化：添加分页限制）
   */
  async getTemplates(options?: { limit?: number; offset?: number }): Promise<PushTemplate[]> {
    if (!this.env.DB) return [];

    const limit = options?.limit || 100; // 默认最多返回 100 条
    const offset = options?.offset || 0;

    const result = await this.env.DB.prepare(
      'SELECT * FROM push_templates WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    )
      .bind(this.userId, limit, offset)
      .all<PushTemplateRow>();

    return (result.results || []).map((row: PushTemplateRow) => ({
      id: row.id,
      name: row.name,
      title: row.title || '',
      content: row.body || '',
      channels: row.channels ? JSON.parse(row.channels) : [],
      url: row.url,
      imageUrl: row.image_url,
      useMarkdown: row.markdown === 1,
      category: row.category,
      variables: row.variables ? JSON.parse(row.variables) : [],
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

    await this.env.DB.prepare(
      `
      INSERT INTO push_templates (id, user_id, name, title, body, channels, url, image_url, markdown, category, variables, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
      .bind(
        id,
        this.userId,
        template.name,
        template.title,
        template.content || '',
        template.channels ? JSON.stringify(template.channels) : null,
        template.url || null,
        template.imageUrl || null,
        template.useMarkdown ? 1 : 0,
        template.category || null,
        template.variables ? JSON.stringify(template.variables) : null,
        now,
        now
      )
      .run();

    return {
      ...template,
      id,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * 更新推送模板（优化：使用单个查询替代列表查询）
   */
  async updateTemplate(id: string, updates: Partial<PushTemplate>): Promise<PushTemplate | null> {
    if (!this.env.DB) return null;

    const now = new Date().toISOString();

    const fields: string[] = ['updated_at = ?'];
    const values: (string | number | null)[] = [now];

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
      values.push(updates.url || null);
    }
    if (updates.imageUrl !== undefined) {
      fields.push('image_url = ?');
      values.push(updates.imageUrl || null);
    }
    if (updates.useMarkdown !== undefined) {
      fields.push('markdown = ?');
      values.push(updates.useMarkdown ? 1 : 0);
    }
    if (updates.category !== undefined) {
      fields.push('category = ?');
      values.push(updates.category || null);
    }
    if (updates.variables !== undefined) {
      fields.push('variables = ?');
      values.push(updates.variables ? JSON.stringify(updates.variables) : null);
    }

    values.push(id, this.userId);

    await this.env.DB.prepare(
      `UPDATE push_templates SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`
    )
      .bind(...values)
      .run();

    // 优化：直接查询单个记录，而不是整个列表
    return await this.getTemplateById(id);
  }

  async deleteTemplate(id: string): Promise<boolean> {
    if (!this.env.DB) return false;

    const result = await this.env.DB.prepare(
      'DELETE FROM push_templates WHERE id = ? AND user_id = ?'
    )
      .bind(id, this.userId)
      .run();

    return result.success && (result.meta?.changes || 0) > 0;
  }

  /**
   * 获取渠道分组列表（优化：添加分页限制）
   */
  async getChannelGroups(options?: { limit?: number; offset?: number }): Promise<ChannelGroup[]> {
    if (!this.env.DB) return [];

    const limit = options?.limit || 100; // 默认最多返回 100 条
    const offset = options?.offset || 0;

    const result = await this.env.DB.prepare(
      'SELECT * FROM channel_groups WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    )
      .bind(this.userId, limit, offset)
      .all<ChannelGroupRow>();

    return (result.results || []).map((row: ChannelGroupRow) => ({
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

    await this.env.DB.prepare(
      `
      INSERT INTO channel_groups (id, user_id, name, channels, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    )
      .bind(id, this.userId, group.name, JSON.stringify(group.channels), now, now)
      .run();

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
    )
      .bind(id, this.userId)
      .run();

    return result.success && (result.meta?.changes || 0) > 0;
  }

  /**
   * 更新渠道分组（优化：使用单个查询替代列表查询）
   */
  async updateChannelGroup(
    id: string,
    updates: { name?: string; channels?: PushChannel[] }
  ): Promise<ChannelGroup | null> {
    if (!this.env.DB) return null;

    const now = new Date().toISOString();

    const fields: string[] = ['updated_at = ?'];
    const values: (string | number | null)[] = [now];

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
    )
      .bind(...values)
      .run();

    // 优化：直接查询单个记录，而不是整个列表
    return await this.getChannelGroupById(id);
  }

  /**
   * 获取定时推送列表（优化：添加分页限制）
   */
  async getScheduledPushes(
    status?: 'pending' | 'processing' | 'completed' | 'failed' | 'overdue',
    options?: { limit?: number; offset?: number }
  ): Promise<ScheduledPush[]> {
    if (!this.env.DB) return [];

    const limit = options?.limit || 100; // 默认最多返回 100 条
    const offset = options?.offset || 0;

    let sql = 'SELECT * FROM scheduled_pushes WHERE user_id = ?';
    const params: (string | number)[] = [this.userId];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY next_run ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = await this.env.DB.prepare(sql)
      .bind(...params)
      .all<ScheduledPushRow>();

    return (result.results || []).map((row: ScheduledPushRow) => ({
      id: row.id,
      templateId: row.template_id,
      title: row.title || '',
      content: row.body || '',
      channels: JSON.parse(row.channels || '[]'),
      url: row.url,
      scheduledAt: new Date(row.next_run || 0).toISOString(),
      nextRun: new Date(row.next_run || 0).toISOString(),
      scheduleType: row.enabled ? 'recurring' : 'once',
      recurringType: (row.recurring_type as ScheduledPush['recurringType']) || undefined,
      enabled: row.enabled === 1,
      createdBy: row.user_id || '',
      createdAt: row.created_at,
      status: (row.status as ScheduledPush['status']) || 'pending',
      overdueReminderSent: row.overdue_reminder_sent === 1,
      yearlyDates: row.yearly_dates ? JSON.parse(row.yearly_dates) : undefined,
      selectedWeekDays: row.selected_week_days ? JSON.parse(row.selected_week_days) : undefined,
      selectedMonthDays: row.selected_month_days ? JSON.parse(row.selected_month_days) : undefined,
      cronExpression: row.cron || undefined,
      timezone: row.timezone || 'Asia/Shanghai', // 如果列不存在，默认值
    }));
  }

  async createScheduledPush(
    push: Omit<ScheduledPush, 'id' | 'status' | 'createdBy'>
  ): Promise<ScheduledPush> {
    if (!this.env.DB) throw new Error('D1 数据库未配置');

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const nextRun = new Date(push.scheduledAt).getTime();

    // 尝试使用新的列结构，如果失败则回退到旧结构
    try {
      await this.env.DB.prepare(
        `
        INSERT INTO scheduled_pushes (
          id, user_id, template_id, cron, next_run, title, body, url, channels, enabled, recurring_type, selected_week_days, selected_month_days, yearly_dates, timezone, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
        .bind(
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
          push.recurringType || null,
          push.selectedWeekDays ? JSON.stringify(push.selectedWeekDays) : null,
          push.selectedMonthDays ? JSON.stringify(push.selectedMonthDays) : null,
          push.yearlyDates ? JSON.stringify(push.yearlyDates) : null,
          push.timezone || 'Asia/Shanghai',
          now,
          now
        )
        .run();
    } catch (e) {
      // 回退到旧结构
      await this.env.DB.prepare(
        `
        INSERT INTO scheduled_pushes (
          id, user_id, template_id, cron, next_run, title, body, url, channels, enabled, recurring_type, selected_week_days, selected_month_days, yearly_dates, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
        .bind(
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
          push.recurringType || null,
          push.selectedWeekDays ? JSON.stringify(push.selectedWeekDays) : null,
          push.selectedMonthDays ? JSON.stringify(push.selectedMonthDays) : null,
          push.yearlyDates ? JSON.stringify(push.yearlyDates) : null,
          now,
          now
        )
        .run();
    }

    return {
      ...push,
      id,
      status: 'pending',
      createdBy: this.userId,
      timezone: push.timezone || 'Asia/Shanghai',
    };
  }

  /**
   * 更新定时推送（优化：使用单个查询替代列表查询）
   */
  async updateScheduledPush(
    id: string,
    updates: Partial<Omit<ScheduledPush, 'id' | 'createdBy' | 'createdAt'>>
  ): Promise<ScheduledPush | null> {
    if (!this.env.DB) return null;

    const now = new Date().toISOString();
    const fields: string[] = ['updated_at = ?'];
    const values: (string | number | null)[] = [now];

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
    if (updates.scheduleType !== undefined) {
      fields.push('enabled = ?');
      values.push(updates.scheduleType === 'recurring' ? 1 : 0);
    }
    if (updates.recurringType !== undefined) {
      fields.push('recurring_type = ?');
      values.push(updates.recurringType);
    }
    if (updates.selectedWeekDays !== undefined) {
      fields.push('selected_week_days = ?');
      values.push(JSON.stringify(updates.selectedWeekDays));
    }
    if (updates.selectedMonthDays !== undefined) {
      fields.push('selected_month_days = ?');
      values.push(JSON.stringify(updates.selectedMonthDays));
    }
    if (updates.yearlyDates !== undefined) {
      fields.push('yearly_dates = ?');
      values.push(JSON.stringify(updates.yearlyDates));
    }
    if (updates.cronExpression !== undefined) {
      fields.push('cron = ?');
      values.push(updates.cronExpression);
    }
    if (updates.timezone !== undefined) {
      fields.push('timezone = ?');
      values.push(updates.timezone);
    }

    values.push(id, this.userId);

    // 尝试更新，如果时区列不存在则回退到不包含时区字段
    try {
      await this.env.DB.prepare(
        `UPDATE scheduled_pushes SET ${fields.join(', ')} WHERE id = ? AND user_id = ? AND status = 'pending'`
      )
        .bind(...values)
        .run();
    } catch (e) {
      // 如果失败，尝试从 fields 中移除 timezone 字段并重试
      const timezoneIndex = fields.findIndex((f) => f.startsWith('timezone'));
      if (timezoneIndex > -1) {
        fields.splice(timezoneIndex, 1);
        values.splice(timezoneIndex, 1);
        // 重新绑定值（排除最后两个 id/userId）
        await this.env.DB.prepare(
          `UPDATE scheduled_pushes SET ${fields.join(', ')} WHERE id = ? AND user_id = ? AND status = 'pending'`
        )
          .bind(...values)
          .run();
      } else {
        throw e;
      }
    }

    // 优化：直接查询单个记录，而不是整个列表
    return await this.getScheduledPushById(id);
  }

  async deleteScheduledPush(id: string): Promise<boolean> {
    if (!this.env.DB) return false;

    const result = await this.env.DB.prepare(
      'DELETE FROM scheduled_pushes WHERE id = ? AND user_id = ?'
    )
      .bind(id, this.userId)
      .run();

    return result.success && (result.meta?.changes || 0) > 0;
  }

  async cancelScheduledPush(id: string): Promise<boolean> {
    if (!this.env.DB) return false;

    const result = await this.env.DB.prepare(
      "UPDATE scheduled_pushes SET status = 'failed', updated_at = ? WHERE id = ? AND user_id = ? AND status = 'pending'"
    )
      .bind(new Date().toISOString(), id, this.userId)
      .run();

    return result.success && (result.meta?.changes || 0) > 0;
  }

  async batchCancelScheduledPushes(
    ids: string[]
  ): Promise<{ cancelled: number; notFound: number }> {
    if (!this.env.DB || ids.length === 0) return { cancelled: 0, notFound: ids.length };

    const placeholders = ids.map(() => '?').join(',');
    const result = await this.env.DB.prepare(
      `UPDATE scheduled_pushes SET status = 'failed', updated_at = ? WHERE id IN (${placeholders}) AND user_id = ? AND status = 'pending'`
    )
      .bind(new Date().toISOString(), ...ids, this.userId)
      .run();

    return {
      cancelled: result.meta?.changes || 0,
      notFound: ids.length - (result.meta?.changes || 0),
    };
  }

  async batchEnableScheduledPushes(ids: string[]): Promise<{ enabled: number; notFound: number }> {
    if (!this.env.DB || ids.length === 0) return { enabled: 0, notFound: ids.length };

    const placeholders = ids.map(() => '?').join(',');
    const result = await this.env.DB.prepare(
      `UPDATE scheduled_pushes SET status = 'pending', updated_at = ? WHERE id IN (${placeholders}) AND user_id = ? AND status = 'failed'`
    )
      .bind(new Date().toISOString(), ...ids, this.userId)
      .run();

    return {
      enabled: result.meta?.changes || 0,
      notFound: ids.length - (result.meta?.changes || 0),
    };
  }

  async updateScheduledPushStatus(id: string, status: ScheduledPush['status']): Promise<void> {
    if (!this.env.DB) return;

    const completedAt = status === 'completed' ? new Date().toISOString() : null;

    await this.env.DB.prepare(
      `
      UPDATE scheduled_pushes SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?
    `
    )
      .bind(status, new Date().toISOString(), id, this.userId)
      .run();
  }

  async updateScheduledPushAndTime(
    id: string,
    status: ScheduledPush['status'],
    nextScheduledAt: string
  ): Promise<void> {
    if (!this.env.DB) return;

    await this.env.DB.prepare(
      `
      UPDATE scheduled_pushes SET status = ?, next_run = ?, updated_at = ? WHERE id = ? AND user_id = ?
    `
    )
      .bind(status, new Date(nextScheduledAt).getTime(), new Date().toISOString(), id, this.userId)
      .run();
  }

  async markPushAsOverdue(id: string): Promise<void> {
    if (!this.env.DB) return;

    await this.env.DB.prepare(
      `
      UPDATE scheduled_pushes SET status = 'overdue', updated_at = ? WHERE id = ? AND user_id = ? AND status = 'pending'
    `
    )
      .bind(new Date().toISOString(), id, this.userId)
      .run();
  }

  async getOverdueTasks(): Promise<ScheduledPush[]> {
    return this.getScheduledPushes('overdue');
  }

  /**
   * 重新安排超时任务（优化：使用单个查询替代列表查询）
   */
  async rescheduleOverdueTask(id: string, newScheduledAt: string): Promise<ScheduledPush | null> {
    if (!this.env.DB) return null;

    await this.env.DB.prepare(
      `
      UPDATE scheduled_pushes SET status = 'pending', next_run = ?, updated_at = ? WHERE id = ? AND user_id = ?
    `
    )
      .bind(new Date(newScheduledAt).getTime(), new Date().toISOString(), id, this.userId)
      .run();

    // 优化：直接查询单个记录，而不是整个列表
    return await this.getScheduledPushById(id);
  }

  getMetrics(): MetricsCollector {
    return this.metrics;
  }

  async getPushStats(days: number = 7): Promise<{
    session: { total: number; success: number; failed: number };
    trend: { rate: number; direction: 'up' | 'down' | 'stable' };
    recent: Array<{ date: string; pushes: number; success: number; failed: number }>;
  }> {
    // 从数据库查询实际推送数据
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString();

    // 总体统计
    const totalResult = await this.env.DB.prepare(
      `SELECT COUNT(*) as total FROM push_history WHERE user_id = ? AND created_at >= ?`
    )
      .bind(this.userId, sinceStr)
      .first<{ total: number }>();

    const successResult = await this.env.DB.prepare(
      `SELECT COUNT(*) as count FROM push_history WHERE user_id = ? AND created_at >= ? AND status = 'success'`
    )
      .bind(this.userId, sinceStr)
      .first<{ count: number }>();

    const failedResult = await this.env.DB.prepare(
      `SELECT COUNT(*) as count FROM push_history WHERE user_id = ? AND created_at >= ? AND status != 'success'`
    )
      .bind(this.userId, sinceStr)
      .first<{ count: number }>();

    const total = totalResult?.total || 0;
    const success = successResult?.count || 0;
    const failed = failedResult?.count || 0;

    // 每日统计
    const dailyResult = await this.env.DB.prepare(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) as pushes,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) as failed
      FROM push_history 
      WHERE user_id = ? AND created_at >= ?
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT ?`
    )
      .bind(this.userId, sinceStr, days)
      .all<{
        date: string;
        pushes: number;
        success: number;
        failed: number;
      }>();

    // 计算趋势（最近 vs 之前）
    const halfDays = Math.max(1, Math.floor(days / 2));
    const recentHalf = await this.env.DB.prepare(
      `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success
       FROM push_history WHERE user_id = ? AND created_at >= ?`
    )
      .bind(this.userId, new Date(Date.now() - halfDays * 86400000).toISOString())
      .first<{ total: number; success: number }>();

    const olderHalf = await this.env.DB.prepare(
      `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success
       FROM push_history WHERE user_id = ? AND created_at >= ? AND created_at < ?`
    )
      .bind(this.userId, sinceStr, new Date(Date.now() - halfDays * 86400000).toISOString())
      .first<{ total: number; success: number }>();

    const recentRate = recentHalf?.total ? ((recentHalf.success || 0) / recentHalf.total) * 100 : 0;
    const olderRate = olderHalf?.total ? ((olderHalf.success || 0) / olderHalf.total) * 100 : 0;
    const rateDiff = recentRate - olderRate;

    return {
      session: { total, success, failed },
      trend: {
        rate: total > 0 ? (success / total) * 100 : 0,
        direction: rateDiff > 5 ? 'up' : rateDiff < -5 ? 'down' : 'stable',
      },
      recent: (dailyResult.results || []).reverse(),
    };
  }

  /**
   * 检测超时任务（优化：添加分页限制）
   */
  async detectOverdueTasks(overdueMinutes: number = 30): Promise<ScheduledPush[]> {
    const now = new Date();
    // 优化：添加分页限制，避免查询过多记录
    const pushes = await this.getScheduledPushes('pending', { limit: 1000 });
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
    )
      .bind(taskId, this.userId)
      .first<{ overdue_reminder_sent: number }>();

    return result?.overdue_reminder_sent === 1;
  }
}
