// ============================================
// MCP (Model Context Protocol) 路由
// 支持 AI 模型远程调用推送通知功能
// 使用 Streamable HTTP 传输（JSON-RPC over HTTP）
// ============================================

import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';
import { handleMCPRequest, type MCPRequest } from '../services/mcpService';

const mcp = new Hono<{ Bindings: Env }>();

// 所有 MCP 接口需要认证
mcp.use('*', authMiddleware);

/**
 * 获取 MCP 服务器信息
 * 返回端点地址和协议版本
 */
mcp.get('/', async (c) => {
  const userRole = c.get('userRole');
  const isAdmin = userRole === 'admin';

  return c.json({
    protocol: 'Model Context Protocol',
    version: '2024-11-05',
    serverInfo: {
      name: 'bee-swarm-mcp',
      version: '1.0.0',
    },
    endpoints: {
      message: 'POST /mcp/message',
    },
    tools: [
      'send_push - 发送推送通知',
      'create_scheduled_push - 创建定时推送任务',
      'update_scheduled_push - 更新定时推送任务',
      'cancel_scheduled_push - 取消定时推送任务',
      'reschedule_overdue_task - 重新安排超时任务',
      'list_scheduled_pushes - 列出定时任务',
      'get_scheduled_push_detail - 获取定时任务详情',
      'get_templates - 获取推送模板',
      'get_channel_groups - 获取渠道分组',
      'get_push_history - 获取推送历史',
      'get_push_history_detail - 获取推送历史详情',
      'get_push_stats - 获取推送统计',
      'get_execution_logs - 获取执行日志',
      'test_channel - 测试推送渠道',
      'check_all_channels_health - 检查所有渠道健康',
      'get_drafts - 获取推送草稿',
      'get_favorites - 获取推送收藏',
      'list_channels - 列出所有推送渠道',
      ...(isAdmin ? ['get_system_status - 获取系统状态'] : []),
    ],
    userRole,
    permissions: {
      admin: '全部 19 个工具可用',
      user: '除 get_system_status 外 18 个工具可用',
    },
  });
});

/**
 * 消息端点：处理 JSON-RPC 请求
 * 客户端通过 POST 发送 JSON-RPC 请求
 */
mcp.post('/message', async (c) => {
  const username = c.get('username');
  const userRole = c.get('userRole');
  const body = (await c.req.json()) as MCPRequest;

  if (!body || body.jsonrpc !== '2.0') {
    return c.json(
      { jsonrpc: '2.0', id: body?.id || null, error: { code: -32600, message: 'Invalid Request' } },
      400
    );
  }

  const response = await handleMCPRequest(body, c.env, username, userRole);
  return c.json(response);
});

/**
 * 健康检查
 */
mcp.get('/health', async (c) => {
  return c.json({ status: 'ok', service: 'mcp' });
});

export default mcp;