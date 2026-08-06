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
      'list_channels - 列出所有推送渠道',
      'list_scheduled_pushes - 列出定时任务',
      'get_push_history - 获取推送历史',
      ...(isAdmin ? ['get_system_status - 获取系统状态'] : []),
    ],
    userRole,
    permissions: {
      admin: '所有工具可用（含 get_system_status 全局统计）',
      user: '个人工具可用：send_push, list_channels, list_scheduled_pushes, get_push_history',
      viewer: '同 user',
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