// ============================================
// MCP (Model Context Protocol) 路由
// 支持 AI 模型远程调用推送通知功能
// 使用 SSE 传输（MCP 标准远程协议）
// ============================================

import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';
import { handleMCPRequest, type MCPRequest } from '../services/mcpService';

const mcp = new Hono<{ Bindings: Env }>();

// 所有 MCP 接口需要认证
mcp.use('*', authMiddleware);

/**
 * SSE 端点：建立 MCP 连接
 * 按照 MCP 标准 SSE 传输协议实现
 */
mcp.get('/', async (c) => {
  const baseUrl = new URL(c.req.url);
  const messageEndpoint = `${baseUrl.protocol}//${baseUrl.host}/mcp/message`;

  const responseStream = new ReadableStream({
    start(controller) {
      const endpointEvent = `event: endpoint\ndata: ${messageEndpoint}\n\n`;
      controller.enqueue(new TextEncoder().encode(endpointEvent));
      controller.close();
    },
  });

  return new Response(responseStream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
});

/**
 * Streamable HTTP 端点：处理 JSON-RPC 请求
 * 支持 POST 到根路径（Streamable HTTP 传输）
 */
mcp.post('/', async (c) => {
  const username = c.get('username');
  const userRole = c.get('userRole');
  const body = await c.req.json().catch(() => null) as MCPRequest | null;

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
 * 消息端点：处理 JSON-RPC 请求
 * 客户端通过 POST 发送 JSON-RPC 请求到此端点
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