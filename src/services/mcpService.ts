// ============================================
// MCP (Model Context Protocol) 服务
// 提供 AI 模型可调用的推送通知工具
// ============================================

import type { Env, PushChannel, ChannelResult } from '../types';
import { dispatchPushWithOptions, saveUserChannelSetting, getPushHistory, deletePushHistory, batchDeletePushHistory, batchDeletePushHistoryByFilter, getChannelConfigs } from './dispatcher';
import { PushService, type ScheduledPush } from './push';
import { CHANNEL_DEFINITIONS } from './dispatcher';
import { getBackupEndpoints, executeAllBackups, listBackupsFromEndpoint, saveBackupEndpoint, deleteBackupEndpoint, testBackupEndpoint, deleteBackupFromEndpoint, restoreFromEndpoint, importData, validateBackup, getBackupHistory, deleteBackupRecordItem } from './backup';
import { UserService } from './userService';
import { SystemSettingsService } from './systemSettingsService';
import { createAuditLogger } from '../utils/audit';
import { getDatabaseStats, cleanupExpiredData, deleteTable, cleanupOrphanTablesForce, getAllTables } from './cleanupService';
import { archivePushHistory, listArchives, restoreArchivedData } from './archiveService';
import { generateTOTPSecret, verifyTOTP, generateQRCodeDataURL } from '../utils/totp';
import { replaceTemplateVariables, extractVariables } from './push';

// ==================== MCP 类型定义 ====================

/** MCP 协议版本（2026-07-28） */
export const LATEST_PROTOCOL_VERSION = '2026-07-28';
/** 服务器支持的协议版本列表（含官方 SDK 标准版本，兼容 legacy SSE 客户端） */
export const SUPPORTED_PROTOCOL_VERSIONS = [
  '2026-07-28',
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
];

/** 服务器信息 */
export const SERVER_INFO = {
  name: 'bee-swarm-mcp',
  version: '1.1.0',
  description: 'Bee Swarm 推送通知系统 MCP 服务器',
};

/** JSON-RPC 错误码 */
export const MCP_ERROR = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  HEADER_MISMATCH: -32020,
  MISSING_REQUIRED_CLIENT_CAPABILITY: -32021,
  UNSUPPORTED_PROTOCOL_VERSION: -32022,
} as const;

/** MCP 请求体（支持 `_meta` 每请求元数据） */
export interface MCPRequest {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
  _meta?: {
    'io.modelcontextprotocol/protocolVersion'?: string;
    'io.modelcontextprotocol/clientCapabilities'?: Record<string, unknown>;
    'io.modelcontextprotocol/clientInfo'?: Record<string, unknown>;
    'io.modelcontextprotocol/logLevel'?: string;
    progressToken?: string | number;
    [key: string]: unknown;
  };
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id?: number | string | null;
  result?: Record<string, unknown> & { resultType: 'complete' | 'input_required' | string; _meta?: Record<string, unknown> };
  error?: { code: number; message: string; data?: unknown };
}

/** 工具注解（2025-11-25+ 规范） */
interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface MCPTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
  annotations?: ToolAnnotations;
  outputSchema?: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// ==================== 工具定义 ====================

/** 需要管理员权限的工具 */
const ADMIN_TOOLS = new Set([
  'get_system_status',
  'list_users',
  'get_audit_logs',
  'get_system_settings',
  'get_system_health',
  'get_metrics',
]);

/** 保留的工具列表（37个核心工具） */
const KEEP_TOOLS = new Set([
  'send_push', 'create_scheduled_push', 'update_scheduled_push', 'cancel_scheduled_push',
  'reschedule_overdue_task', 'list_scheduled_pushes', 'get_scheduled_push_detail',
  'get_templates', 'get_channel_groups', 'get_push_history', 'get_push_history_detail',
  'get_push_stats', 'get_execution_logs', 'test_channel', 'check_all_channels_health',
  'list_channels', 'revoke_push', 'batch_send_to_groups', 'get_overdue_tasks',
  'create_template', 'update_template', 'preview_template', 'get_template_variables',
  'run_backup', 'list_backups', 'list_backup_endpoints', 'get_backup_history',
  'get_current_user', 'get_user_settings', 'export_data', 'get_webhook_url',
  'get_system_status', 'get_system_health', 'get_metrics', 'list_users',
  'get_audit_logs', 'get_system_settings',
]);

/** 根据工具名推断注解（只读/破坏性提示） */
function buildAnnotations(name: string): ToolAnnotations {
  const readOnly = /^(list_|get_|check_|preview_)/.test(name);
  const destructive = /^(cancel_|revoke_|delete_)/.test(name);
  return {
    readOnlyHint: readOnly,
    destructiveHint: destructive,
    idempotentHint: destructive,
    openWorldHint: false,
  };
}

/** 根据角色返回可见的工具列表 */
export function getToolsForRole(role: string): MCPTool[] {
  return tools
    .filter((t) => KEEP_TOOLS.has(t.name))
    .map((t) => ({ ...t, annotations: buildAnnotations(t.name) }));
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
    name: 'list_channels',
    description: '列出所有可用的推送渠道及其状态',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'create_template',
    description: '创建推送模板',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '模板名称' },
        title: { type: 'string', description: '推送标题' },
        body: { type: 'string', description: '推送内容' },
        channels: { type: 'string', description: '默认渠道，逗号分隔' },
        url: { type: 'string', description: '跳转链接' },
        category: { type: 'string', description: '分类' },
      },
      required: ['name', 'title'],
    },
  },
  {
    name: 'update_template',
    description: '更新推送模板',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '模板 ID' },
        name: { type: 'string', description: '模板名称' },
        title: { type: 'string', description: '推送标题' },
        body: { type: 'string', description: '推送内容' },
        channels: { type: 'string', description: '默认渠道，逗号分隔' },
        url: { type: 'string', description: '跳转链接' },
        category: { type: 'string', description: '分类' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_backup_endpoints',
    description: '列出备份端点配置',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'run_backup',
    description: '立即执行备份到所有已启用的端点',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'list_backups',
    description: '列出备份端点的备份文件',
    inputSchema: {
      type: 'object',
      properties: {
        endpointId: { type: 'string', description: '备份端点 ID' },
      },
      required: ['endpointId'],
    },
  },
  {
    name: 'get_user_settings',
    description: '获取当前用户的设置',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'export_data',
    description: '导出用户数据为 JSON',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'get_current_user',
    description: '获取当前登录用户的信息',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'revoke_push',
    description: '撤销一条推送',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '推送历史 ID' } },
      required: ['id'],
    },
  },
  {
    name: 'preview_template',
    description: '预览推送模板（渲染变量）',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '模板 ID' },
        variables: { type: 'string', description: '变量键值对 JSON，如 {"name":"张三"}' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_template_variables',
    description: '获取模板中的变量列表',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '模板 ID' } },
      required: ['id'],
    },
  },
  {
    name: 'get_overdue_tasks',
    description: '获取所有超时的定时任务',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'batch_send_to_groups',
    description: '向指定渠道分组发送推送',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '推送标题' },
        body: { type: 'string', description: '推送内容' },
        groupIds: { type: 'string', description: '分组 ID 列表，逗号分隔' },
        url: { type: 'string', description: '跳转链接' },
      },
      required: ['title', 'groupIds'],
    },
  },
  {
    name: 'get_backup_history',
    description: '获取备份历史记录',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_webhook_url',
    description: '获取 Webhook 推送 URL',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  // ==================== 管理员工具 ====================
  {
    name: 'get_system_status',
    description: '获取系统健康状态和统计信息（仅管理员）',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'list_users',
    description: '获取所有用户列表（仅管理员）',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'get_audit_logs',
    description: '获取审计日志列表（仅管理员）',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'string', description: '返回条数，默认 50' },
        action: { type: 'string', description: '按操作类型筛选' },
      },
      required: [],
    },
  },
  {
    name: 'get_system_settings',
    description: '获取系统设置（仅管理员）',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'get_system_health',
    description: '获取系统健康检查报告（仅管理员）',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_metrics',
    description: '获取系统指标统计（仅管理员）',
    inputSchema: { type: 'object', properties: {}, required: [] },
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

async function handleCreateTemplate(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const pushService = new PushService(env, username);
  const channels = args.channels
    ? String(args.channels).split(',').map((c) => c.trim() as PushChannel).filter(Boolean)
    : [];
  const template = await pushService.saveTemplate({
    name: String(args.name || ''),
    title: String(args.title || ''),
    content: String(args.body || ''),
    channels: channels.length > 0 ? channels : undefined,
    url: args.url ? String(args.url) : undefined,
    category: args.category ? String(args.category) : undefined,
    useMarkdown: false,
    variables: [],
  });
  return template;
}

async function handleUpdateTemplate(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const id = String(args.id || '');
  if (!id) throw new Error('模板 ID 不能为空');
  const pushService = new PushService(env, username);
  const updates: Record<string, unknown> = {};
  if (args.name !== undefined) updates.name = String(args.name);
  if (args.title !== undefined) updates.title = String(args.title);
  if (args.body !== undefined) updates.content = String(args.body);
  if (args.url !== undefined) updates.url = String(args.url);
  if (args.category !== undefined) updates.category = String(args.category);
  if (args.channels !== undefined) {
    updates.channels = String(args.channels).split(',').map((c) => c.trim() as PushChannel).filter(Boolean);
  }
  const updated = await pushService.updateTemplate(id, updates as any);
  if (!updated) throw new Error('未找到该模板');
  return updated;
}

async function handleListBackupEndpoints(
  env: Env,
  username: string
): Promise<unknown> {
  const endpoints = await getBackupEndpoints(env, username);
  return endpoints.map((ep) => ({
    id: ep.id,
    name: ep.name,
    type: ep.type,
    enabled: ep.enabled,
    schedule: ep.schedule,
    lastBackup: ep.lastBackup,
  }));
}

async function handleRunBackup(
  env: Env,
  username: string
): Promise<unknown> {
  const results = await executeAllBackups(env, username);
  return {
    success: results.every((r) => r.success),
    results: results.map((r) => ({
      endpointId: r.endpointId,
      endpointName: r.endpointName,
      success: r.success,
      message: r.message,
    })),
  };
}

async function handleListBackups(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const endpointId = String(args.endpointId || '');
  if (!endpointId) throw new Error('备份端点 ID 不能为空');
  const { getBackupEndpoint } = await import('./backup');
  const endpoint = await getBackupEndpoint(env, username, endpointId);
  if (!endpoint) throw new Error('未找到该备份端点');
  const backups = await listBackupsFromEndpoint(env, username, endpoint);
  return { endpointId, endpointName: endpoint.name, backups };
}

async function handleGetCurrentUser(env: Env, username: string): Promise<unknown> {
  const userService = new UserService(env);
  const user = await userService.findByEmail(username);
  if (!user) throw new Error('用户不存在');
  return { id: user.id, email: user.email, role: user.role, disabled: user.disabled, avatar_url: user.avatar_url };
}

async function handleGetUserSettings(
  env: Env,
  username: string
): Promise<unknown> {
  const userService = new UserService(env);
  const user = await userService.findByEmail(username);
  if (!user) throw new Error('用户不存在');
  return {
    email: user.email,
    role: user.role,
    settings: await userService.getUserSettings(user.id),
    allowedIPs: await userService.getAllowedIPs(user.id),
  };
}

async function handleExportData(
  env: Env,
  username: string
): Promise<unknown> {
  const { exportData } = await import('./backup');
  const data = await exportData(env, username);
  return data;
}

async function handleRevokePush(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const pushService = new PushService(env, username);
  const result = await pushService.revokePush(String(args.id || ''));
  return { success: result };
}

async function handlePreviewTemplate(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const id = String(args.id || '');
  const pushService = new PushService(env, username);
  const template = await pushService['getTemplateById'](id);
  if (!template) throw new Error('模板不存在');
  const variables = args.variables ? JSON.parse(String(args.variables)) : {};
  return {
    id: template.id, name: template.name,
    title: replaceTemplateVariables(template.title, variables),
    content: replaceTemplateVariables(template.content, variables),
  };
}

async function handleGetTemplateVariables(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const id = String(args.id || '');
  const pushService = new PushService(env, username);
  const template = await pushService['getTemplateById'](id);
  if (!template) throw new Error('模板不存在');
  const titleVars = extractVariables(template.title);
  const contentVars = extractVariables(template.content);
  return { variables: [...new Set([...titleVars, ...contentVars])] };
}

async function handleGetOverdueTasks(env: Env, username: string): Promise<unknown> {
  const pushService = new PushService(env, username);
  return await pushService.getOverdueTasks();
}

async function handleBatchSendToGroups(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const title = String(args.title || '');
  const body = args.body ? String(args.body) : '';
  const url = args.url ? String(args.url) : '';
  const groupIds = String(args.groupIds || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!title) throw new Error('推送标题不能为空');
  if (groupIds.length === 0) throw new Error('至少需要一个分组');
  const pushService = new PushService(env, username);
  const allChannels: PushChannel[] = [];
  for (const gid of groupIds) {
    const group = await pushService['getChannelGroupById'](gid);
    if (group) allChannels.push(...group.channels);
  }
  const uniqueChannels = [...new Set(allChannels)];
  if (uniqueChannels.length === 0) throw new Error('未找到有效的渠道');
  return await dispatchPushWithOptions({ title, body, url }, uniqueChannels, username, env);
}

async function handleGetBackupHistory(env: Env, username: string): Promise<unknown> {
  return await getBackupHistory(env, username);
}

async function handleGetWebhookUrl(env: Env, username: string): Promise<unknown> {
  const baseUrl = env.ALLOWED_ORIGINS?.split(',')[0] || '';
  return { webhookUrl: `${baseUrl}/api/webhook/push?token=${username}` };
}

// ==================== 管理员工具处理函数 ====================

async function handleListUsers(env: Env): Promise<unknown> {
  if (!env.DB) return { users: [] };
  const result = await env.DB.prepare(
    "SELECT id, email, role, disabled, disabled_reason, created_at FROM users ORDER BY created_at ASC LIMIT 500"
  ).all();
  return { users: result.results || [] };
}

async function handleGetAuditLogs(env: Env, args: Record<string, unknown>): Promise<unknown> {
  const limit = Math.min(Math.max(parseInt(String(args.limit || '50'), 10) || 50, 1), 200);
  const action = args.action ? String(args.action) : undefined;
  if (!env.DB) return { logs: [] };

  let sql = 'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?';
  const params: (string | number)[] = [limit];
  if (action) {
    sql = 'SELECT * FROM audit_logs WHERE action = ? ORDER BY created_at DESC LIMIT ?';
    params.unshift(action);
  }
  const result = await env.DB.prepare(sql).bind(...params).all();
  return { logs: result.results || [] };
}

async function handleGetSystemSettings(env: Env): Promise<unknown> {
  const systemSettings = new SystemSettingsService(env);
  await systemSettings.ensureTable();
  const settings = await systemSettings.getAllSettings();
  return { settings };
}

async function handleGetSystemHealth(env: Env): Promise<unknown> {
  let healthy = true; const checks: Record<string, unknown> = {};
  try {
    checks.database = env.DB ? 'connected' : 'not configured';
    if (env.DB) await env.DB.prepare('SELECT 1').run();
  } catch { checks.database = 'error'; healthy = false; }
  return { status: healthy ? 'healthy' : 'unhealthy', checks };
}

async function handleGetMetrics(env: Env): Promise<unknown> {
  if (!env.DB) return { metrics: {} };
  const userCount = (await env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>())?.count || 0;
  const pushCount = (await env.DB.prepare('SELECT COUNT(*) as count FROM push_history').first<{ count: number }>())?.count || 0;
  const taskCount = (await env.DB.prepare('SELECT COUNT(*) as count FROM scheduled_pushes').first<{ count: number }>())?.count || 0;
  return { metrics: { users: userCount, totalPushes: pushCount, totalScheduledTasks: taskCount } };
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

/** 统一构造成功响应（2026-07-28 要求 resultType + _meta） */
function ok(id: number | string | undefined, result: Record<string, unknown>): MCPResponse {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    result: {
      resultType: 'complete',
      _meta: { 'io.modelcontextprotocol/serverInfo': SERVER_INFO },
      ...result,
    },
  };
}

/** 统一构造错误响应 */
function fail(id: number | string | undefined, code: number, message: string, data?: unknown): MCPResponse {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

/** 校验请求 `_meta` 中的协议版本（2026-07-28 每请求协商）
 * 缺失时宽松放行（兼容 2024-11-05 等旧客户端，不发 _meta），存在时严格校验 */
function checkProtocolVersion(request: MCPRequest): MCPResponse | null {
  const requested = request._meta?.['io.modelcontextprotocol/protocolVersion'];
  if (!requested) return null;
  if (!SUPPORTED_PROTOCOL_VERSIONS.includes(requested)) {
    return fail(request.id, MCP_ERROR.UNSUPPORTED_PROTOCOL_VERSION, `不支持的协议版本: ${requested}`, {
      supported: SUPPORTED_PROTOCOL_VERSIONS,
      requested,
    });
  }
  return null;
}

export async function handleMCPRequest(
  request: MCPRequest,
  env: Env,
  username: string,
  userRole: string = 'user'
): Promise<MCPResponse | null> {
  const { id, method, params } = request;

  try {
    switch (method) {
      case 'server/discover': {
        return ok(id, {
          supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
          capabilities: {
            tools: { listChanged: false },
          },
          instructions:
            'Bee Swarm 推送通知系统。可用工具：send_push 发送推送，create_scheduled_push 创建定时推送，list_channels 查看渠道。' +
            '所有结果均为 JSON 文本，可通过 isError 判断工具调用是否失败。',
          ttlMs: 3600000,
          cacheScope: 'public',
        });
      }

      // 兼容旧客户端：initialize 仍返回能力信息（响应与 discover 等价）
      case 'initialize': {
        return ok(id, {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: SERVER_INFO,
        });
      }

      // 通知类消息：无响应（返回 null 表示已接收）
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return null;

      case 'ping':
        return ok(id, {});

      case 'tools/list': {
        const versionError = checkProtocolVersion(request);
        if (versionError) return versionError;
        return ok(id, {
          tools: getToolsForRole(userRole),
          ttlMs: 300000,
          cacheScope: 'public',
        });
      }

      case 'tools/call': {
        const versionError = checkProtocolVersion(request);
        if (versionError) return versionError;
        const p = params as { name?: string; arguments?: Record<string, unknown> } | undefined;
        const toolName = p?.name || '';
        const args = p?.arguments || {};

        // 权限检查：管理员工具仅管理员可用
        if (ADMIN_TOOLS.has(toolName) && userRole !== 'admin') {
          return ok(id, {
            content: [{ type: 'text', text: '权限不足，此工具需要管理员权限' }],
            isError: true,
          });
        }

        try {
          let result: unknown;
          switch (toolName) {
            case 'list_channels':
              result = await handleListChannels(env, username);
              break;
            case 'check_all_channels_health':
              result = await handleCheckAllChannelsHealth(env, username);
              break;
            case 'get_channel_groups':
              result = await handleGetChannelGroups(env, username);
              break;
            case 'get_overdue_tasks':
              result = await handleGetOverdueTasks(env, username);
              break;
            case 'run_backup':
              result = await handleRunBackup(env, username);
              break;
            case 'list_backups':
              result = await handleListBackups(env, username, args);
              break;
            case 'list_backup_endpoints':
              result = await handleListBackupEndpoints(env, username);
              break;
            case 'get_backup_history':
              result = await handleGetBackupHistory(env, username);
              break;
            case 'get_current_user':
              result = await handleGetCurrentUser(env, username);
              break;
            case 'get_user_settings':
              result = await handleGetUserSettings(env, username);
              break;
            case 'export_data':
              result = await handleExportData(env, username);
              break;
            case 'get_webhook_url':
              result = await handleGetWebhookUrl(env, username);
              break;
            case 'get_system_status':
              result = await handleGetSystemStatus(env);
              break;
            case 'get_system_health':
              result = await handleGetSystemHealth(env);
              break;
            case 'get_metrics':
              result = await handleGetMetrics(env);
              break;
            case 'list_users':
              result = await handleListUsers(env);
              break;
            case 'get_system_settings':
              result = await handleGetSystemSettings(env);
              break;
            case 'get_templates':
              result = await handleGetTemplates(env, username);
              break;
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
            case 'list_scheduled_pushes':
              result = await handleListScheduledPushes(env, username, args);
              break;
            case 'get_scheduled_push_detail':
              result = await handleGetScheduledPushDetail(env, username, args);
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
            case 'revoke_push':
              result = await handleRevokePush(env, username, args);
              break;
            case 'create_template':
              result = await handleCreateTemplate(env, username, args);
              break;
            case 'update_template':
              result = await handleUpdateTemplate(env, username, args);
              break;
            case 'preview_template':
              result = await handlePreviewTemplate(env, username, args);
              break;
            case 'get_template_variables':
              result = await handleGetTemplateVariables(env, username, args);
              break;
            case 'batch_send_to_groups':
              result = await handleBatchSendToGroups(env, username, args);
              break;
            case 'get_audit_logs':
              result = await handleGetAuditLogs(env, args);
              break;
            default:
              return fail(id, MCP_ERROR.INVALID_PARAMS, `未知工具: ${toolName}`);
          }
          // 2026-07-28：工具结果携带结构化内容 + isError 标记
          const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          return ok(id, {
            content: [{ type: 'text', text }],
            structuredContent: result,
            isError: false,
          });
        } catch (err) {
          // 工具执行错误应在结果内以 isError 呈现，而非 JSON-RPC 错误
          return ok(id, {
            content: [{ type: 'text', text: (err as Error).message || '工具执行失败' }],
            isError: true,
          });
        }
      }

      default:
        return fail(id, MCP_ERROR.METHOD_NOT_FOUND, `未知方法: ${method}`);
    }
  } catch (err) {
    return fail(id, MCP_ERROR.INTERNAL_ERROR, (err as Error).message || 'Internal error');
  }
}