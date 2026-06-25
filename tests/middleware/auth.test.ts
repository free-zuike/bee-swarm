import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authMiddleware } from '../../src/middleware/auth';

class MockD1Database {
  private tables: Map<string, Map<string, any>> = new Map();

  constructor() {
    this.tables.set('users', new Map());
  }

  prepare(sql: string) {
    return new MockPreparedStatement(sql, this.tables);
  }

  getTable(name: string) {
    return this.tables.get(name) || new Map();
  }
}

class MockPreparedStatement {
  private sql: string;
  private tables: Map<string, Map<string, any>>;
  private boundParams: any[] = [];

  constructor(sql: string, tables: Map<string, Map<string, any>>) {
    this.sql = sql;
    this.tables = tables;
  }

  bind(...params: any[]) {
    this.boundParams = params;
    return this;
  }

  async first<T>(): Promise<T | null> {
    const table = this.tables.get('users') || new Map();
    const allRows = Array.from(table.values());
    const sqlLower = this.sql.toLowerCase();

    let results = allRows;
    if (sqlLower.includes('where apikey = ?')) {
      results = allRows.filter((r) => r.apikey === this.boundParams[0]);
    } else if (sqlLower.includes('where token = ?')) {
      results = allRows.filter((r) => r.token === this.boundParams[0]);
    }

    return (results[0] as T) || null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: [] };
  }

  async run(): Promise<{ success: boolean; meta?: { changes: number } }> {
    return { success: true, meta: { changes: 0 } };
  }
}

function createMockContext(options: {
  apiKey?: string;
  token?: string;
  queryApiKey?: string;
  queryToken?: string;
}) {
  const headers: Record<string, string> = {};
  if (options.apiKey) headers['x-api-key'] = options.apiKey;
  if (options.token) headers['x-token'] = options.token;

  const queryParams: Record<string, string> = {};
  if (options.queryApiKey) queryParams['apikey'] = options.queryApiKey;
  if (options.queryToken) queryParams['token'] = options.queryToken;

  return {
    req: {
      header: (name: string) => headers[name.toLowerCase()] || undefined,
      query: (name: string) => queryParams[name],
    },
    set: vi.fn(),
    json: vi.fn().mockReturnValue(new Response(null, { status: 200 })),
    env: {
      DB: new MockD1Database(),
    },
    get: vi.fn(),
  } as any;
}

describe('authMiddleware', () => {
  let mockDb: MockD1Database;

  beforeEach(() => {
    mockDb = new MockD1Database();
  });

  describe('API Key 认证', () => {
    it('应该通过有效的 API Key 认证成功', async () => {
      const table = mockDb.getTable('users');
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        apikey: 'valid-apikey',
        role: 'user',
        disabled: 0,
      });

      const ctx = createMockContext({ apiKey: 'valid-apikey' });
      ctx.env.DB = mockDb;

      const next = vi.fn();
      await authMiddleware(ctx, next);

      expect(next).toHaveBeenCalled();
      expect(ctx.json).not.toHaveBeenCalled();
    });

    it('应该使用 header 中的 X-API-Key', async () => {
      const table = mockDb.getTable('users');
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        apikey: 'header-key',
        role: 'admin',
        disabled: 0,
      });

      const ctx = createMockContext({ apiKey: 'header-key' });
      ctx.env.DB = mockDb;

      const next = vi.fn();
      await authMiddleware(ctx, next);

      expect(next).toHaveBeenCalled();
    });

    it('应该使用查询参数中的 apikey', async () => {
      const table = mockDb.getTable('users');
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        apikey: 'query-key',
        role: 'user',
        disabled: 0,
      });

      const ctx = createMockContext({ queryApiKey: 'query-key' });
      ctx.env.DB = mockDb;

      const next = vi.fn();
      await authMiddleware(ctx, next);

      expect(next).toHaveBeenCalled();
    });

    it('应该返回 401 当 API Key 无效', async () => {
      const ctx = createMockContext({ apiKey: 'invalid-key' });
      ctx.env.DB = mockDb;

      const next = vi.fn();
      await authMiddleware(ctx, next);

      expect(next).not.toHaveBeenCalled();
      expect(ctx.json).toHaveBeenCalledWith({ error: '无效的 API Key' }, 401);
    });

    it('应该返回 403 当用户被禁用', async () => {
      const table = mockDb.getTable('users');
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        apikey: 'disabled-key',
        role: 'user',
        disabled: 1,
      });

      const ctx = createMockContext({ apiKey: 'disabled-key' });
      ctx.env.DB = mockDb;

      const next = vi.fn();
      await authMiddleware(ctx, next);

      expect(next).not.toHaveBeenCalled();
      expect(ctx.json).toHaveBeenCalledWith({ error: '账号已被禁用' }, 403);
    });
  });

  describe('Token 认证', () => {
    it('应该通过有效的 Token 认证成功', async () => {
      const table = mockDb.getTable('users');
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        token: 'valid-token',
        token_expires_at: Date.now() + 3600000,
        role: 'user',
        disabled: 0,
      });

      const ctx = createMockContext({ token: 'valid-token' });
      ctx.env.DB = mockDb;

      const next = vi.fn();
      await authMiddleware(ctx, next);

      expect(next).toHaveBeenCalled();
    });

    it('应该使用 header 中的 X-Token', async () => {
      const table = mockDb.getTable('users');
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        token: 'header-token',
        token_expires_at: Date.now() + 3600000,
        role: 'user',
        disabled: 0,
      });

      const ctx = createMockContext({ token: 'header-token' });
      ctx.env.DB = mockDb;

      const next = vi.fn();
      await authMiddleware(ctx, next);

      expect(next).toHaveBeenCalled();
    });

    it('应该返回 401 当 Token 已过期', async () => {
      const table = mockDb.getTable('users');
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        token: 'expired-token',
        token_expires_at: Date.now() - 1000,
        role: 'user',
        disabled: 0,
      });

      const ctx = createMockContext({ token: 'expired-token' });
      ctx.env.DB = mockDb;

      const next = vi.fn();
      await authMiddleware(ctx, next);

      expect(next).not.toHaveBeenCalled();
      expect(ctx.json).toHaveBeenCalledWith({ error: 'Token 已过期，请重新登录' }, 401);
    });

    it('应该返回 401 当 Token 无效', async () => {
      const ctx = createMockContext({ token: 'invalid-token' });
      ctx.env.DB = mockDb;

      const next = vi.fn();
      await authMiddleware(ctx, next);

      expect(next).not.toHaveBeenCalled();
      expect(ctx.json).toHaveBeenCalledWith({ error: '无效或已过期的 Token' }, 401);
    });

    it('应该返回 403 当 Token 用户被禁用', async () => {
      const table = mockDb.getTable('users');
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        token: 'disabled-token',
        token_expires_at: Date.now() + 3600000,
        role: 'user',
        disabled: 1,
      });

      const ctx = createMockContext({ token: 'disabled-token' });
      ctx.env.DB = mockDb;

      const next = vi.fn();
      await authMiddleware(ctx, next);

      expect(next).not.toHaveBeenCalled();
      expect(ctx.json).toHaveBeenCalledWith({ error: '账号已被禁用' }, 403);
    });
  });

  describe('无认证信息', () => {
    it('应该返回 401 当没有提供任何认证信息', async () => {
      const ctx = createMockContext({});
      ctx.env.DB = mockDb;

      const next = vi.fn();
      await authMiddleware(ctx, next);

      expect(next).not.toHaveBeenCalled();
      expect(ctx.json).toHaveBeenCalledWith({ error: '请提供认证信息' }, 401);
    });
  });

  describe('认证优先级', () => {
    it('应该优先使用 API Key 而不是 Token', async () => {
      const table = mockDb.getTable('users');
      table.set('u1', {
        id: 'u1',
        email: 'apikey-user@example.com',
        apikey: 'the-apikey',
        role: 'user',
        disabled: 0,
      });

      const ctx = createMockContext({ apiKey: 'the-apikey', token: 'some-token' });
      ctx.env.DB = mockDb;

      const next = vi.fn();
      await authMiddleware(ctx, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('上下文变量设置', () => {
    it('应该正确设置 username 变量', async () => {
      const table = mockDb.getTable('users');
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        apikey: 'key',
        role: 'admin',
        disabled: 0,
      });

      const ctx = createMockContext({ apiKey: 'key' });
      ctx.env.DB = mockDb;

      const next = vi.fn();
      await authMiddleware(ctx, next);

      expect(ctx.set).toHaveBeenCalledWith('username', 'test@example.com');
      expect(ctx.set).toHaveBeenCalledWith('userId', 'u1');
      expect(ctx.set).toHaveBeenCalledWith('userRole', 'admin');
    });

    it('应该使用默认角色 user 当用户没有指定角色', async () => {
      const table = mockDb.getTable('users');
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        apikey: 'key',
        disabled: 0,
      });

      const ctx = createMockContext({ apiKey: 'key' });
      ctx.env.DB = mockDb;

      const next = vi.fn();
      await authMiddleware(ctx, next);

      expect(ctx.set).toHaveBeenCalledWith('userRole', 'user');
    });
  });
});
