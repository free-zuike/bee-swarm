import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/types';

// 简化 D1 模拟：apikey 查询返回一个有效用户，其余返回空
class MockD1Database {
  prepare(sql: string) {
    return {
      bind: (..._params: unknown[]) => ({
        first: async () => {
          if (sql.includes('FROM users WHERE apikey')) {
            return {
              id: 'user-1',
              email: 'test@example.com',
              role: 'admin',
              disabled: 0,
              apikey: 'test-key',
              apikey_expires_at: null,
            };
          }
          return null;
        },
        all: async () => ({ results: [] }),
        run: async () => ({ success: true }),
      }),
    };
  }
}

// 与 src/index.ts 相同的方式挂载 /mcp 子应用
const createApp = async () => {
  const { default: mcp } = await import('../../src/routes/mcp');
  const app = new Hono<{ Bindings: Env }>();
  app.route('/mcp', mcp);
  return app;
};

const createMockEnv = () => ({ DB: new MockD1Database() }) as Env;

describe('MCP SSE 兼容端点', () => {
  it('GET /mcp 带 Accept: text/event-stream 应返回 SSE 流（旧版传输握手，不再 405）', async () => {
    const app = await createApp();
    const controller = new AbortController();

    const res = await app.request(
      '/mcp',
      {
        method: 'GET',
        headers: { Accept: 'text/event-stream', Authorization: 'Bearer test-key' },
        signal: controller.signal,
      },
      createMockEnv()
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');

    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const chunk = new TextDecoder().decode(value);

    expect(chunk).toContain('event: endpoint');
    expect(chunk).toContain('/mcp/message');

    controller.abort();
  });

  it('GET /mcp 不带 text/event-stream 仍返回 405', async () => {
    const app = await createApp();
    const res = await app.request(
      '/mcp',
      {
        method: 'GET',
        headers: { Authorization: 'Bearer test-key' },
      },
      createMockEnv()
    );
    expect(res.status).toBe(405);
  });

  it('GET /mcp 无 API Key 返回 401', async () => {
    const app = await createApp();
    const res = await app.request(
      '/mcp',
      {
        method: 'GET',
        headers: { Accept: 'text/event-stream' },
      },
      createMockEnv()
    );
    expect(res.status).toBe(401);
  });

  it('POST /mcp/message 初始化（initialize）返回 200 结果', async () => {
    const app = await createApp();
    const res = await app.request(
      '/mcp/message',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-key' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {},
        }),
      },
      createMockEnv()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jsonrpc).toBe('2.0');
    expect(body.result?.serverInfo?.name).toBe('bee-swarm-mcp');
  });

  it('POST /mcp/message tools/list 应接受标准 SDK 协议版本（2025-06-18）', async () => {
    const app = await createApp();
    const res = await app.request(
      '/mcp/message',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-key' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          _meta: { 'io.modelcontextprotocol/protocolVersion': '2025-06-18' },
          params: {},
        }),
      },
      createMockEnv()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result?.tools?.length).toBeGreaterThan(0);
  });
});