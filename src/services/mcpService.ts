// ============================================
// MCP (Model Context Protocol) 服务
// 提供 AI 模型可调用的推送通知工具
// ============================================

import type { Env, PushChannel, ChannelResult } from '../types';
import { dispatchPushWithOptions } from './dispatcher';
import { PushService } from './push';
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
        channels: {
          type: 'string',
          description: '目标渠道，逗号分隔（如 wework,dingtalk,telegram）。留空则使用所有已启用渠道',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'list_channels',
    description: '列出所有可用的推送渠道及其状态',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_scheduled_pushes',
    description: '列出定时推送任务列表',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: '按状态筛选：pending / processing / completed / failed / overdue',
          enum: ['pending', 'processing', 'completed', 'failed', 'overdue'],
        },
      },
      required: [],
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
    name: 'get_system_status',
    description: '获取系统健康状态和统计信息',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
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
          case 'list_channels':
            result = await handleListChannels(env, username);
            break;
          case 'list_scheduled_pushes':
            result = await handleListScheduledPushes(env, username, args);
            break;
          case 'get_push_history':
            result = await handleGetPushHistory(env, username, args);
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