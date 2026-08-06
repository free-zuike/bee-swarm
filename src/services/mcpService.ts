// ============================================
// MCP (Model Context Protocol) 服务
// 提供 AI 模型可调用的推送通知工具
// ============================================

import type { Env, PushChannel, ChannelResult } from '../types';
import { dispatchPushWithOptions } from './dispatcher';
import { PushService, type ScheduledPush } from './push';
import { CHANNEL_DEFINITIONS } from './dispatcher';

// ==================== MCP 类型定义 ====================

export interface MCPRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

// ==================== 工具定义 ====================

/** 需要管理员权限的工具 */
const ADMIN_TOOLS = new Set(['get_system_status']);

/** 根据角色返回可见的工具列表 */
function getToolsForRole(role: string): MCPTool[] {
  if (role === 'admin') return tools;
  return tools.filter((t) => !ADMIN_TOOLS.has(t.name));
}

const tools: MCPTool[] = [
  {
    name: 'send_push',
    description: '发送推送通知到指定渠道',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '推送标题' },
        body: { type: 'string', description: '推送内容' },
        url: { type: 'string', description: '点击跳转链接' },
        channels: { type: 'string', description: '目标渠道，逗号分隔（如 wework,dingtalk,telegram）。留空则使用所有已启用渠道' },
      },
      required: ['title'],
    },
  },
  {
    name: 'create_scheduled_push',
    description: '创建定时推送任务（一次性或循环）',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '推送标题' },
        body: { type: 'string', description: '推送内容' },
        channels: { type: 'string', description: '目标渠道，逗号分隔' },
        scheduledAt: { type: 'string', description: '首次执行时间（ISO 8601 格式，如 2025-01-01T10:00:00+08:00）' },
        scheduleType: { type: 'string', description: '调度类型：once（一次性）或 recurring（循环）', enum: ['once', 'recurring'] },
        recurringType: { type: 'string', description: '循环类型：daily / weekly / monthly / hourly / cron', enum: ['daily', 'weekly', 'monthly', 'hourly', 'cron'] },
        selectedWeekDays: { type: 'string', description: '每周执行日（仅 weekly 类型，0-6 逗号分隔，如 1,3,5 表示周一三五）' },
        cronExpression: { type: 'string', description: 'Cron 表达式（仅 cron 类型，5 字段格式）' },
        timezone: { type: 'string', description: '时区，默认 Asia/Shanghai' },
        url: { type: 'string', description: '点击跳转链接' },
      },
      required: ['title', 'channels', 'scheduledAt'],
    },
  },
  {
    name: 'update_scheduled_push',
    description: '更新定时推送任务（仅 pending 状态可编辑）',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '定时任务 ID' },
        title: { type: 'string', description: '推送标题' },
        body: { type: 'string', description: '推送内容' },
        channels: { type: 'string', description: '目标渠道，逗号分隔' },
        scheduledAt: { type: 'string', description: '执行时间（ISO 8601）' },
        scheduleType: { type: 'string', description: '调度类型', enum: ['once', 'recurring'] },
        recurringType: { type: 'string', description: '循环类型', enum: ['daily', 'weekly', 'monthly', 'hourly', 'cron'] },
        selectedWeekDays: { type: 'string', description: '每周执行日，逗号分隔' },
        cronExpression: { type: 'string', description: 'Cron 表达式' },
        timezone: { type: 'string', description: '时区' },
        url: { type: 'string', description: '点击跳转链接' },
      },
      required: ['id'],
    },
  },
  {
    name: 'cancel_scheduled_push',
    description: '取消定时推送任务',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '定时任务 ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'reschedule_overdue_task',
    description: '重新安排已超时的定时任务',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '超时任务 ID' },
        scheduledAt: { type: 'string', description: '新的执行时间（ISO 8601）' },
      },
      required: ['id', 'scheduledAt'],
    },
  },
  {
    name: 'list_scheduled_pushes',
    description: '列出定时推送任务列表',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: '按状态筛选：pending / processing / completed / failed / overdue', enum: ['pending', 'processing', 'completed', 'failed', 'overdue'] },
      },
      required: [],
    },
  },
  {
    name: 'get_scheduled_push_detail',
    description: '获取单个定时推送任务的详细信息',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '定时任务 ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_templates',
    description: '获取推送模板列表',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'get_channel_groups',
    description: '获取渠道分组列表',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'get_push_history',
    description: '获取最近的推送历史记录',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'string', description: '返回条数，默认 10' },
      },
      required: [],
    },
  },
  {
    name: 'get_push_history_detail',
    description: '获取单条推送历史的详细信息（含渠道结果）',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '推送历史 ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_push_stats',
    description: '获取推送统计信息（成功率、趋势等）',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'string', description: '统计天数，默认 7' },
      },
      required: [],
    },
  },
  {
    name: 'get_execution_logs',
    description: '获取推送执行日志',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'string', description: '返回条数，默认 10' },
      },
      required: [],
    },
  },
  {
    name: 'test_channel',
    description: '测试单个推送渠道（发送真实测试消息）',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: '渠道标识，如 wework / dingtalk / telegram / bark / ntfy / email / slack / discord / serverchan / pushplus / webhook / gotify / line / teams / pushover' },
      },
      required: ['channel'],
    },
  },
  {
    name: 'check_all_channels_health',
    description: '检查所有已配置渠道的健康状态',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'get_drafts',
    description: '获取推送草稿列表',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'get_favorites',
    description: '获取推送收藏列表',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'list_channels',
    description: '列出所有可用的推送渠道及其状态',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'get_system_status',
    description: '获取系统健康状态和统计信息（仅管理员）',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
];

// ==================== 工具处理函数 ====================

async function handleSendPush(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const title = String(args.title || '');
  const body = args.body ? String(args.body) : '';
  const url = args.url ? String(args.url) : '';
  const channels = args.channels
    ? String(args.channels)
        .split(',')
        .map((c) => c.trim() as PushChannel)
        .filter(Boolean)
    : undefined;

  if (!title) {
    throw new Error('推送标题不能为空');
  }

  const results = await dispatchPushWithOptions(
    { title, body, url },
    channels,
    username,
    env,
    { concurrent: true }
  );

  const allSuccess = results.every((r) => r.success);
  return {
    success: allSuccess,
    summary: allSuccess
      ? `推送成功，已发送到 ${results.length} 个渠道`
      : `部分渠道推送失败（${results.filter((r) => !r.success).length}/${results.length}）`,
    results: results.map((r: ChannelResult) => ({
      channel: r.channel,
      success: r.success,
      message: r.message,
    })),
  };
}

async function handleListChannels(
  env: Env,
  username: string
): Promise<unknown> {
  const settings = await loadUserChannelSettings(username, env);

  return CHANNEL_DEFINITIONS.map((ch) => {
    const enabled = settings[`channel:${ch.id}:enabled`];
    return {
      id: ch.id,
      name: ch.name,
      icon: ch.icon,
      enabled: enabled !== 'false',
      supportsMarkdown: ch.supportsMarkdown,
    };
  });
}

async function handleCreateScheduledPush(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const title = String(args.title || '');
  const body = args.body ? String(args.body) : '';
  const channels = String(args.channels || '')
    .split(',')
    .map((c) => c.trim() as PushChannel)
    .filter(Boolean);
  const scheduledAt = String(args.scheduledAt || '');
  const scheduleType = (args.scheduleType as string) || 'once';
  const recurringType = args.recurringType as string | undefined;
  const timezone = String(args.timezone || 'Asia/Shanghai');
  const url = args.url ? String(args.url) : '';

  if (!title) throw new Error('推送标题不能为空');
  if (!scheduledAt) throw new Error('执行时间不能为空');
  if (channels.length === 0) throw new Error('至少需要一个推送渠道');

  let selectedWeekDays: number[] | undefined;
  if (args.selectedWeekDays) {
    selectedWeekDays = String(args.selectedWeekDays)
      .split(',')
      .map((d) => parseInt(d.trim(), 10))
      .filter((d) => !isNaN(d) && d >= 0 && d <= 6);
  }

  const pushService = new PushService(env, username);
  const push = await pushService.createScheduledPush({
    title,
    content: body,
    channels,
    url: url || undefined,
    scheduledAt,
    scheduleType: scheduleType as 'once' | 'recurring',
    recurringType: recurringType as ScheduledPush['recurringType'],
    selectedWeekDays,
    cronExpression: args.cronExpression ? String(args.cronExpression) : undefined,
    timezone,
  });

  return {
    id: push.id,
    title: push.title,
    content: push.content,
    channels: push.channels,
    scheduledAt: push.scheduledAt,
    scheduleType: push.scheduleType,
    recurringType: push.recurringType,
    selectedWeekDays: push.selectedWeekDays,
    status: push.status,
    timezone: push.timezone,
  };
}

async function handleCancelScheduledPush(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const id = String(args.id || '');
  if (!id) throw new Error('定时任务 ID 不能为空');

  const pushService = new PushService(env, username);
  const cancelled = await pushService.cancelScheduledPush(id);

  return {
    success: cancelled,
    message: cancelled ? '定时任务已取消' : '未找到该任务或状态不允许取消',
  };
}

async function handleUpdateScheduledPush(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const id = String(args.id || '');
  if (!id) throw new Error('定时任务 ID 不能为空');

  const pushService = new PushService(env, username);
  const updates: Record<string, unknown> = {};

  if (args.title !== undefined) updates.title = String(args.title);
  if (args.body !== undefined) updates.content = String(args.body);
  if (args.url !== undefined) updates.url = String(args.url);
  if (args.scheduleType !== undefined) updates.scheduleType = args.scheduleType;
  if (args.recurringType !== undefined) updates.recurringType = args.recurringType;
  if (args.timezone !== undefined) updates.timezone = String(args.timezone);
  if (args.cronExpression !== undefined) updates.cronExpression = String(args.cronExpression);
  if (args.scheduledAt !== undefined) updates.scheduledAt = String(args.scheduledAt);
  if (args.channels !== undefined) {
    updates.channels = String(args.channels)
      .split(',')
      .map((c) => c.trim() as PushChannel)
      .filter(Boolean);
  }
  if (args.selectedWeekDays !== undefined) {
    updates.selectedWeekDays = String(args.selectedWeekDays)
      .split(',')
      .map((d) => parseInt(d.trim(), 10))
      .filter((d) => !isNaN(d) && d >= 0 && d <= 6);
  }

  const updated = await pushService.updateScheduledPush(id, updates as any);
  if (!updated) {
    return { success: false, message: '未找到该任务或状态不允许编辑' };
  }
  return {
    success: true,
    scheduled: {
      id: updated.id,
      title: updated.title,
      content: updated.content,
      channels: updated.channels,
      scheduledAt: updated.scheduledAt,
      scheduleType: updated.scheduleType,
      recurringType: updated.recurringType,
      status: updated.status,
      timezone: updated.timezone,
    },
  };
}

async function handleRescheduleOverdueTask(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const id = String(args.id || '');
  const scheduledAt = String(args.scheduledAt || '');
  if (!id) throw new Error('超时任务 ID 不能为空');
  if (!scheduledAt) throw new Error('新的执行时间不能为空');

  const pushService = new PushService(env, username);
  const updated = await pushService.rescheduleOverdueTask(id, scheduledAt);

  if (!updated) {
    return { success: false, message: '未找到该超时任务' };
  }
  return {
    success: true,
    scheduled: {
      id: updated.id,
      title: updated.title,
      scheduledAt: updated.scheduledAt,
      status: updated.status,
    },
  };
}

async function handleGetScheduledPushDetail(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const id = String(args.id || '');
  if (!id || !env.DB) return null;

  const result = await env.DB.prepare(
    'SELECT * FROM scheduled_pushes WHERE id = ? AND user_id = ?'
  )
    .bind(id, username)
    .first();

  if (!result) return null;

  const r = result as Record<string, unknown>;
  return {
    id: r.id,
    title: r.title,
    content: r.body,
    channels: r.channels ? JSON.parse(r.channels as string) : [],
    url: r.url,
    scheduledAt: r.next_run && (r.next_run as number) > 0
      ? new Date(((r.next_run as number) > 1e12 ? (r.next_run as number) : (r.next_run as number) * 60000)).toISOString()
      : null,
    scheduleType: r.enabled === 1 ? 'recurring' : 'once',
    recurringType: r.recurring_type,
    selectedWeekDays: r.selected_week_days ? JSON.parse(r.selected_week_days as string) : undefined,
    cronExpression: r.cron,
    status: r.status,
    enabled: r.enabled === 1,
    timezone: r.timezone || 'Asia/Shanghai',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function handleListScheduledPushes(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const pushService = new PushService(env, username);
  const status = args.status as string | undefined;
  const pushes = await pushService.getScheduledPushes(
    status as 'pending' | 'processing' | 'completed' | 'failed' | 'overdue' | undefined
  );

  return pushes.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    scheduleType: p.scheduleType,
    recurringType: p.recurringType,
    scheduledAt: p.scheduledAt,
    nextRun: p.nextRun,
    channels: p.channels,
    enabled: p.enabled,
    timezone: p.timezone,
  }));
}

async function handleGetPushHistory(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const limit = Math.min(Math.max(parseInt(String(args.limit || '10'), 10) || 10, 1), 100);
  if (!env.DB) return { history: [] };

  const result = await env.DB.prepare(
    `SELECT * FROM push_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
  )
    .bind(username, limit)
    .all();

  return {
    history: (result.results || []).map((r: Record<string, unknown>) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      status: r.status,
      channels: r.channels ? JSON.parse(r.channels as string) : [],
      createdAt: r.created_at,
    })),
  };
}

async function handleGetPushHistoryDetail(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const id = String(args.id || '');
  if (!id || !env.DB) return null;

  const result = await env.DB.prepare(
    `SELECT * FROM push_history WHERE id = ? AND user_id = ?`
  )
    .bind(id, username)
    .first();

  if (!result) return null;

  const r = result as Record<string, unknown>;
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    url: r.url,
    imageUrl: r.image_url,
    markdown: r.markdown === 1,
    channels: r.channels ? JSON.parse(r.channels as string) : [],
    results: r.results ? JSON.parse(r.results as string) : [],
    status: r.status,
    createdAt: r.created_at,
    deliveredAt: r.delivered_at,
    readAt: r.read_at,
    clickedAt: r.clicked_at,
  };
}

async function handleGetExecutionLogs(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const limit = Math.min(Math.max(parseInt(String(args.limit || '10'), 10) || 10, 1), 100);
  if (!env.DB) return { logs: [] };

  const result = await env.DB.prepare(
    `SELECT * FROM push_execution_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
  )
    .bind(username, limit)
    .all();

  return {
    logs: (result.results || []).map((r: Record<string, unknown>) => ({
      id: r.id,
      pushHistoryId: r.push_history_id,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      status: r.status,
      channels: r.channels ? JSON.parse(r.channels as string) : [],
      channelResults: r.channel_results ? JSON.parse(r.channel_results as string) : [],
      errorMessage: r.error_message,
      createdAt: r.created_at,
    })),
  };
}

async function handleTestChannel(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const channel = String(args.channel || '') as PushChannel;
  if (!channel) throw new Error('渠道标识不能为空');

  const results = await dispatchPushWithOptions(
    { title: '渠道测试', body: `这是一条来自 MCP 的测试消息，用于验证 ${channel} 渠道。` },
    [channel],
    username,
    env,
  );

  const result = results[0];
  return {
    channel,
    healthy: result?.success,
    message: result?.success ? '渠道正常' : result?.message,
    testedAt: new Date().toISOString(),
  };
}

async function handleCheckAllChannelsHealth(
  env: Env,
  username: string
): Promise<unknown> {
  const settings = await loadUserChannelSettings(username, env);

  const results = await Promise.all(
    CHANNEL_DEFINITIONS.map(async (ch) => {
      const channelPrefix = `channel:${ch.id}:`;
      const isConfigured = Object.keys(settings).some((key) => key.startsWith(channelPrefix));

      if (!isConfigured) {
        return { channel: ch.id, healthy: false, message: '渠道未配置', testedAt: new Date().toISOString() };
      }

      const res = await dispatchPushWithOptions(
        { title: '渠道健康检查', body: `验证 ${ch.id} 渠道是否正常工作。` },
        [ch.id as PushChannel],
        username,
        env,
      );

      return {
        channel: ch.id,
        healthy: res[0]?.success,
        message: res[0]?.success ? '渠道正常' : res[0]?.message,
        testedAt: new Date().toISOString(),
      };
    })
  );

  return { channels: results };
}

async function handleGetChannelGroups(
  env: Env,
  username: string
): Promise<unknown> {
  const pushService = new PushService(env, username);
  const groups = await pushService.getChannelGroups();
  return groups;
}

async function handleGetDrafts(
  env: Env,
  username: string
): Promise<unknown> {
  const pushService = new PushService(env, username);
  const drafts = await pushService.getDrafts();
  return drafts;
}

async function handleGetFavorites(
  env: Env,
  username: string
): Promise<unknown> {
  const pushService = new PushService(env, username);
  const favorites = await pushService.getFavorites();
  return favorites;
}

async function handleGetTemplates(
  env: Env,
  username: string
): Promise<unknown> {
  const pushService = new PushService(env, username);
  const templates = await pushService.getTemplates();

  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    title: t.title,
    content: t.content,
    channels: t.channels,
    category: t.category,
    useMarkdown: t.useMarkdown,
    createdAt: t.createdAt,
  }));
}

async function handleGetPushStats(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const days = Math.min(Math.max(parseInt(String(args.days || '7'), 10) || 7, 1), 90);
  const pushService = new PushService(env, username);
  const stats = await pushService.getPushStats(days);

  return stats;
}

async function handleGetSystemStatus(
  env: Env
): Promise<unknown> {
  let dbConnected = false;
  let userCount = 0;
  let pendingTasks = 0;

  try {
    if (env.DB) {
      dbConnected = true;
      const userResult = await env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
      userCount = userResult?.count || 0;

      const taskResult = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM scheduled_pushes WHERE status = 'pending'"
      ).first<{ count: number }>();
      pendingTasks = taskResult?.count || 0;
    }
  } catch {
    dbConnected = false;
  }

  return {
    status: 'ok',
    database: dbConnected ? 'connected' : 'disconnected',
    stats: {
      users: userCount,
      pendingTasks,
    },
    timestamp: new Date().toISOString(),
  };
}

type ChannelSettings = Record<string, string>;

async function loadUserChannelSettings(username: string, env: Env): Promise<ChannelSettings> {
  if (!env.DB) return {};

  const result = await env.DB.prepare(
    'SELECT * FROM channel_configs WHERE user_id = ?'
  )
    .bind(username)
    .all<{ channel_id: string; config: string; enabled: number }>();

  const settings: ChannelSettings = {};
  for (const row of result.results || []) {
    settings[`channel:${row.channel_id}:enabled`] = row.enabled ? 'true' : 'false';
    try {
      const config = JSON.parse(row.config);
      for (const [key, value] of Object.entries(config)) {
        settings[`channel:${row.channel_id}:${key}`] = String(value);
      }
    } catch {
      // 忽略解析错误
    }
  }
  return settings;
}

// ==================== MCP 请求分发 ====================

export async function handleMCPRequest(
  request: MCPRequest,
  env: Env,
  username: string,
  userRole: string = 'user'
): Promise<MCPResponse> {
  const { id, method, params } = request;

  try {
    switch (method) {
      case 'initialize': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
              resources: {},
            },
            serverInfo: {
              name: 'bee-swarm-mcp',
              version: '1.0.0',
            },
          },
        };
      }

      case 'notifications/initialized':
        return { jsonrpc: '2.0', id, result: null };

      case 'tools/list':
        return { jsonrpc: '2.0', id, result: { tools: getToolsForRole(userRole) } };

      case 'tools/call': {
        const p = params as { name?: string; arguments?: Record<string, unknown> } | undefined;
        const toolName = p?.name || '';
        const args = p?.arguments || {};

        // 权限检查：管理员工具仅管理员可用
        if (ADMIN_TOOLS.has(toolName) && userRole !== 'admin') {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32001, message: '权限不足，此工具需要管理员权限' },
          };
        }

        let result: unknown;
        switch (toolName) {
          case 'send_push':
            result = await handleSendPush(env, username, args);
            break;
          case 'create_scheduled_push':
            result = await handleCreateScheduledPush(env, username, args);
            break;
          case 'update_scheduled_push':
            result = await handleUpdateScheduledPush(env, username, args);
            break;
          case 'cancel_scheduled_push':
            result = await handleCancelScheduledPush(env, username, args);
            break;
          case 'reschedule_overdue_task':
            result = await handleRescheduleOverdueTask(env, username, args);
            break;
          case 'list_channels':
            result = await handleListChannels(env, username);
            break;
          case 'list_scheduled_pushes':
            result = await handleListScheduledPushes(env, username, args);
            break;
          case 'get_scheduled_push_detail':
            result = await handleGetScheduledPushDetail(env, username, args);
            break;
          case 'get_templates':
            result = await handleGetTemplates(env, username);
            break;
          case 'get_channel_groups':
            result = await handleGetChannelGroups(env, username);
            break;
          case 'get_push_history':
            result = await handleGetPushHistory(env, username, args);
            break;
          case 'get_push_history_detail':
            result = await handleGetPushHistoryDetail(env, username, args);
            break;
          case 'get_push_stats':
            result = await handleGetPushStats(env, username, args);
            break;
          case 'get_execution_logs':
            result = await handleGetExecutionLogs(env, username, args);
            break;
          case 'test_channel':
            result = await handleTestChannel(env, username, args);
            break;
          case 'check_all_channels_health':
            result = await handleCheckAllChannelsHealth(env, username);
            break;
          case 'get_drafts':
            result = await handleGetDrafts(env, username);
            break;
          case 'get_favorites':
            result = await handleGetFavorites(env, username);
            break;
          case 'get_system_status':
            result = await handleGetSystemStatus(env);
            break;
          default:
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32601, message: `未知工具: ${toolName}` },
            };
        }
        return { jsonrpc: '2.0', id, result };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `未知方法: ${method}` },
        };
    }
  } catch (err) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: (err as Error).message,
      },
    };
  }
}