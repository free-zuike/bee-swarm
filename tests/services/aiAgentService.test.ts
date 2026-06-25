import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIAgentService } from '../../src/services/aiAgentService';

// Mock D1 database
class MockD1Database {
  private tables: Map<string, Map<string, any>> = new Map();

  constructor() {
    this.tables.set('users', new Map());
    this.tables.set('push_templates', new Map());
    this.tables.set('channel_groups', new Map());
    this.tables.set('scheduled_pushes', new Map());
    this.tables.set('push_history', new Map());
    this.tables.set('channel_settings', new Map());
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
    const sqlLower = this.sql.toLowerCase();

    if (sqlLower.includes('users')) {
      const table = this.tables.get('users') || new Map();
      const rows = Array.from(table.values());
      if (sqlLower.includes('where email')) {
        return (rows.find((r: any) => r.email === this.boundParams[0]) as T) || null;
      }
      if (sqlLower.includes('where id')) {
        return (rows.find((r: any) => r.id === this.boundParams[0]) as T) || null;
      }
      return (rows[0] as T) || null;
    }

    if (sqlLower.includes('push_history')) {
      const table = this.tables.get('push_history') || new Map();
      const rows = Array.from(table.values());
      if (sqlLower.includes('count(*)')) {
        const filtered = rows.filter((r: any) => r.user_id === this.boundParams[0]);
        return { total: filtered.length } as T;
      }
      return (rows[0] as T) || null;
    }

    if (sqlLower.includes('channel_settings')) {
      const table = this.tables.get('channel_settings') || new Map();
      const rows = Array.from(table.values());
      return (rows.find((r: any) => r.user_id === this.boundParams[0]) as T) || null;
    }

    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    const sqlLower = this.sql.toLowerCase();

    if (sqlLower.includes('push_history')) {
      const table = this.tables.get('push_history') || new Map();
      const rows = Array.from(table.values());
      const userId = this.boundParams[0];
      return { results: rows.filter((r: any) => r.user_id === userId) as T[] };
    }

    if (sqlLower.includes('scheduled_pushes')) {
      const table = this.tables.get('scheduled_pushes') || new Map();
      const rows = Array.from(table.values());
      const userId = this.boundParams[0];
      return { results: rows.filter((r: any) => r.user_id === userId) as T[] };
    }

    return { results: [] };
  }

  async run(): Promise<{ success: boolean; meta?: { changes: number } }> {
    return { success: true, meta: { changes: 0 } };
  }
}

function createMockEnv(db?: MockD1Database) {
  return {
    DB: db || new MockD1Database(),
  } as any;
}

describe('AIAgentService', () => {
  let mockDb: MockD1Database;
  let env: any;
  let agentService: AIAgentService;

  beforeEach(() => {
    mockDb = new MockD1Database();
    env = createMockEnv(mockDb);
    agentService = new AIAgentService(env);
  });

  describe('execute', () => {
    it('应该处理能力查询请求（本地匹配）', async () => {
      const result = await agentService.execute({
        query: '你能做什么',
        userId: 'user1',
        username: 'test@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.result).toContain('发送消息');
    });

    it('应该处理"有什么功能"请求', async () => {
      const result = await agentService.execute({
        query: '有什么功能',
        userId: 'user1',
        username: 'test@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.result).toContain('发送消息');
    });

    it('应该处理"帮助"请求', async () => {
      const result = await agentService.execute({
        query: '帮助',
        userId: 'user1',
        username: 'test@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);
    });

    it('应该处理渠道查询请求（本地匹配）', async () => {
      const result = await agentService.execute({
        query: '有哪些渠道',
        userId: 'user1',
        username: 'test@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);
    });

    it('应该处理统计查询请求（本地匹配）', async () => {
      const result = await agentService.execute({
        query: '统计推送成功率',
        userId: 'user1',
        username: 'test@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);
    });

    it('应该处理历史查询请求（本地匹配）', async () => {
      const result = await agentService.execute({
        query: '查看最近的推送历史',
        userId: 'user1',
        username: 'test@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);
    });

    it('应该处理定时任务查询（本地匹配）', async () => {
      const result = await agentService.execute({
        query: '查看定时任务',
        userId: 'user1',
        username: 'test@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);
    });

    it('应该处理发送消息请求（本地匹配）', async () => {
      const result = await agentService.execute({
        query: '发送测试消息',
        userId: 'user1',
        username: 'test@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);
    });

    it('应该处理包含渠道名称的发送请求', async () => {
      const result = await agentService.execute({
        query: '发送消息到飞书',
        userId: 'user1',
        username: 'test@example.com',
      });

      expect(result.success).toBe(true);
    });

    it('应该处理企业微信相关请求', async () => {
      const result = await agentService.execute({
        query: '给企业微信发通知',
        userId: 'user1',
        username: 'test@example.com',
      });

      expect(result.success).toBe(true);
    });

    it('应该处理无法理解的请求', async () => {
      const result = await agentService.execute({
        query: 'asdfghjkl',
        userId: 'user1',
        username: 'test@example.com',
      });

      // 本地匹配返回 null，会尝试 AI 调用
      // AI 调用失败会返回 unknown intent
      expect(result).toBeDefined();
      expect(result.steps.length).toBeGreaterThan(0);
    });
  });

  describe('本地模式匹配', () => {
    it('应该匹配多种能力查询表述', async () => {
      const queries = ['你可以做什么', '能做什么', '功能列表'];
      for (const query of queries) {
        const result = await agentService.execute({
          query,
          userId: 'user1',
          username: 'test@example.com',
        });
        expect(result.success).toBe(true);
      }
    });

    it('应该匹配多种渠道查询表述', async () => {
      const queries = ['渠道配置', '启用了哪些渠道', 'channel'];
      for (const query of queries) {
        const result = await agentService.execute({
          query,
          userId: 'user1',
          username: 'test@example.com',
        });
        expect(result.success).toBe(true);
      }
    });

    it('应该匹配多种统计查询表述', async () => {
      const queries = ['统计', '成功率', '数据分析'];
      for (const query of queries) {
        const result = await agentService.execute({
          query,
          userId: 'user1',
          username: 'test@example.com',
        });
        expect(result.success).toBe(true);
      }
    });

    it('应该匹配多种历史查询表述', async () => {
      const queries = ['推送历史', '最近记录', '之前的推送'];
      for (const query of queries) {
        const result = await agentService.execute({
          query,
          userId: 'user1',
          username: 'test@example.com',
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('步骤追踪', () => {
    it('应该记录分析意图步骤', async () => {
      const result = await agentService.execute({
        query: '你能做什么',
        userId: 'user1',
        username: 'test@example.com',
      });

      const analyzeStep = result.steps.find((s) => s.action === 'analyze_intent');
      expect(analyzeStep).toBeDefined();
      expect(analyzeStep?.params).toHaveProperty('query');
    });
  });
});
