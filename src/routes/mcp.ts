// ============================================
// MCP (Model Context Protocol) 路由
// 支持 AI 模型远程调用推送通知功能
// 实现协议版本: 2026-07-28 (Streamable HTTP)
// ============================================

import { Hono } from 'hono';
import type { Env } from '../types';
import { mcpAuthMiddleware } from '../middleware/mcpAuth';
import { handleMCPRequest, LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS, MCP_ERROR, SERVER_INFO, type MCPRequest } from '../services/mcpService';

const mcp = new Hono<{ Bindings: Env }>();

// 所有 MCP 接口需要认证
mcp.use('*', mcpAuthMiddleware);

/**
 * 校验 MCP-Protocol-Version 请求头（2026-07-28 传输层要求）
 */
function validateProtocolHeader(header: string | undefined): string | null {
  if (!header) return '缺少 MCP-Protocol-Version 请求头';
  if (!SUPPORTED_PROTOCOL_VERSIONS.includes(header)) {
    return `不支持的协议版本: ${header}，支持: ${SUPPORTED_PROTOCOL_VERSIONS.join(', ')}`;
  }
  return null;
}

/**
 * POST —— 处理 JSON-RPC 请求（Streamable HTTP 传输）
 * 支持 application/json 和 text/event-stream 两种响应
 */
mcp.post('/', async (c) => {
  const username = c.get('username');
  const userRole = c.get('userRole');

  // 校验协议版本头
  const protocolVersion = c.req.header('MCP-Protocol-Version');
  const headerError = validateProtocolHeader(protocolVersion);
  if (headerError) {
    return c.json(
      { jsonrpc: '2.0', id: null, error: { code: MCP_ERROR.HEADER_MISMATCH, message: headerError } },
      400,
      { 'MCP-Protocol-Version': LATEST_PROTOCOL_VERSION }
    );
  }

  const body = await c.req.json().catch(() => null) as MCPRequest | null;
  if (!body || body.jsonrpc !== '2.0') {
    return c.json(
      { jsonrpc: '2.0', id: body?.id ?? null, error: { code: MCP_ERROR.INVALID_REQUEST, message: 'Invalid Request' } },
      400,
      { 'MCP-Protocol-Version': LATEST_PROTOCOL_VERSION }
    );
  }

  // subscriptions/listen：打开长连接推送流
  if (body.method === 'subscriptions/listen') {
    const ackNotification = JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/subscriptions/acknowledged',
      params: {
        _meta: {
          'io.modelcontextprotocol/subscriptionId': body.id,
        },
        notifications: {},
      },
    });

    const stream = new ReadableStream({
      start(controller) {
        // 立即发送 acknowledge 通知
        controller.enqueue(new TextEncoder().encode(`data: ${ackNotification}\n\n`));
        // 保持心跳（每 30 秒）
        const keepAlive = setInterval(() => {
          try {
            controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'));
          } catch {
            clearInterval(keepAlive);
          }
        }, 30_000);
        // 清理
        c.req.raw.signal.addEventListener('abort', () => clearInterval(keepAlive));
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'MCP-Protocol-Version': LATEST_PROTOCOL_VERSION,
        'MCP-Version': LATEST_PROTOCOL_VERSION,
      },
    });
  }

  // 普通请求处理
  const response = await handleMCPRequest(body, c.env, username, userRole);

  // 通知类请求（handler 返回 null）→ 202 Accepted
  if (response === null) {
    return c.newResponse(null, 202, {
      'MCP-Protocol-Version': LATEST_PROTOCOL_VERSION,
      'MCP-Version': LATEST_PROTOCOL_VERSION,
    });
  }

  return c.json(response, 200, {
    'MCP-Protocol-Version': LATEST_PROTOCOL_VERSION,
    'MCP-Version': LATEST_PROTOCOL_VERSION,
    'MCP-Server-Info': `${SERVER_INFO.name}/${SERVER_INFO.version}`,
  });
});

/**
 * GET —— 健康检查
 * 2026-07-28 不再使用老式 SSE 端点，health 用于简单存活检测
 */
mcp.get('/', async (c) => {
  return c.json({ status: 'ok', service: 'mcp', protocolVersion: LATEST_PROTOCOL_VERSION });
});

mcp.get('/health', async (c) => {
  return c.json({ status: 'ok', service: 'mcp', protocolVersion: LATEST_PROTOCOL_VERSION });
});

/**
 * POST /message —— 向后兼容端点
 * 旧版 SSE 客户端连接 /mcp 后收到 endpoint 指向 /mcp/message
 */
mcp.post('/message', async (c) => {
  const username = c.get('username');
  const userRole = c.get('userRole');
  const body = (await c.req.json()) as MCPRequest;

  if (!body || body.jsonrpc !== '2.0') {
    return c.json(
      { jsonrpc: '2.0', id: body?.id ?? null, error: { code: MCP_ERROR.INVALID_REQUEST, message: 'Invalid Request' } },
      400,
      { 'MCP-Protocol-Version': LATEST_PROTOCOL_VERSION }
    );
  }

  const response = await handleMCPRequest(body, c.env, username, userRole);
  if (response === null) return c.newResponse(null, 202);
  return c.json(response, 200, { 'MCP-Protocol-Version': LATEST_PROTOCOL_VERSION });
});

export default mcp;