import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserService, type User, type CacheSettings, type AISettings } from '../../src/services/userService';

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

    if (sqlLower.includes('where email = ?')) {
      results = allRows.filter((r) => r.email === this.boundParams[0]);
    } else if (sqlLower.includes('where id = ?')) {
      results = allRows.filter((r) => r.id === this.boundParams[0]);
    } else if (sqlLower.includes('where token = ?')) {
      results = allRows.filter((r) => r.token === this.boundParams[0]);
    } else if (sqlLower.includes('where password_reset_token = ?')) {
      results = allRows.filter((r) => r.password_reset_token === this.boundParams[0]);
    }

    return (results[0] as T) || null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: [] };
  }

  async run(): Promise<{ success: boolean; meta?: { changes: number } }> {
    const sql = this.sql.trim().toUpperCase();
    let changes = 0;

    if (sql.startsWith('INSERT')) {
      this._handleInsert();
      changes = 1;
    } else if (sql.startsWith('UPDATE')) {
      changes = this._handleUpdate();
    } else if (sql.startsWith('DELETE')) {
      changes = this._handleDelete();
    }

    return { success: true, meta: { changes } };
  }

  private _handleInsert(): void {
    const table = this.tables.get('users') || new Map();
    const sqlLower = this.sql.toLowerCase();

    if (sqlLower.includes('insert into users')) {
      const row: Record<string, any> = {
        id: this.boundParams[0],
        email: this.boundParams[1],
        password: this.boundParams[2],
        role: this.boundParams[3],
        created_at: this.boundParams[4],
        updated_at: this.boundParams[5],
        ai_enabled: this.boundParams[6],
        ai_provider: this.boundParams[7],
        ai_model: this.boundParams[8],
        cache_ttl_backup: this.boundParams[9],
        cache_ttl_channels: this.boundParams[10],
        cache_ttl_templates: this.boundParams[11],
        cache_ttl_groups: this.boundParams[12],
        cache_ttl_scheduled: this.boundParams[13],
      };
      table.set(row.id, row);
      this.tables.set('users', table);
    }
  }

  private _handleUpdate(): number {
    const table = this.tables.get('users') || new Map();
    const sqlLower = this.sql.toLowerCase();
    const lastParam = this.boundParams[this.boundParams.length - 1];
    const row = table.get(lastParam);

    if (!row) return 0;

    // Extract field names from SET clause (between SET and WHERE)
    const setMatch = sqlLower.match(/set\s+(.+?)\s+where/);
    if (!setMatch) return 0;

    const setClause = setMatch[1];
    const fieldMatches = setClause.match(/(\w+)\s*=\s*\?/g) || [];
    const fieldNames = fieldMatches.map((m) => m.split('=')[0].trim());

    // Map params to fields (all params except the last one which is WHERE id)
    for (let i = 0; i < fieldNames.length && i < this.boundParams.length - 1; i++) {
      row[fieldNames[i]] = this.boundParams[i];
    }

    table.set(lastParam, row);
    this.tables.set('users', table);
    return 1;
  }

  private _handleDelete(): number {
    const table = this.tables.get('users') || new Map();
    const id = this.boundParams[0];
    if (table.has(id)) {
      table.delete(id);
      this.tables.set('users', table);
      return 1;
    }
    return 0;
  }
}

function createMockEnv(db?: MockD1Database) {
  return {
    DB: db || new MockD1Database(),
  } as any;
}

describe('UserService', () => {
  let mockDb: MockD1Database;
  let env: any;
  let service: UserService;

  beforeEach(() => {
    mockDb = new MockD1Database();
    env = createMockEnv(mockDb);
    service = new UserService(env);
  });

  describe('构造函数', () => {
    it('应该正确创建实例', () => {
      expect(service).toBeInstanceOf(UserService);
    });
  });

  describe('findByEmail', () => {
    it('应该返回找到的用户', async () => {
      const table = mockDb.getTable('users');
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        password: 'hashed',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      });

      const user = await service.findByEmail('test@example.com');
      expect(user).not.toBeNull();
      expect(user?.email).toBe('test@example.com');
    });

    it('应该返回 null 当用户不存在', async () => {
      const user = await service.findByEmail('nonexistent@example.com');
      expect(user).toBeNull();
    });
  });

  describe('findById', () => {
    it('应该返回找到的用户', async () => {
      const table = mockDb.getTable('users');
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        password: 'hashed',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      });

      const user = await service.findById('u1');
      expect(user).not.toBeNull();
      expect(user?.id).toBe('u1');
    });

    it('应该返回 null 当用户不存在', async () => {
      const user = await service.findById('nonexistent');
      expect(user).toBeNull();
    });
  });

  describe('findByToken', () => {
    it('应该通过 token 找到用户', async () => {
      const table = mockDb.getTable('users');
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        password: 'hashed',
        token: 'my-token',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      });

      const user = await service.findByToken('my-token');
      expect(user).not.toBeNull();
      expect(user?.token).toBe('my-token');
    });

    it('应该返回 null 当 token 不存在', async () => {
      const user = await service.findByToken('invalid-token');
      expect(user).toBeNull();
    });
  });

  describe('findByApiKey', () => {
    it('应该通过 apikey 找到用户', async () => {
      const table = mockDb.getTable('users');
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        password: 'hashed',
        apikey: 'my-apikey',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      });

      const user = await service.findByApiKey('my-apikey');
      expect(user).not.toBeNull();
      expect(user?.apikey).toBe('my-apikey');
    });

    it('应该返回 null 当 apikey 不存在', async () => {
      const user = await service.findByApiKey('invalid-key');
      expect(user).toBeNull();
    });
  });

  describe('createUser', () => {
    it('应该创建用户并返回用户对象', async () => {
      const user = await service.createUser('new@example.com', 'hashed-password');
      expect(user).toBeDefined();
      expect(user.email).toBe('new@example.com');
      expect(user.password).toBe('hashed-password');
      expect(user.id).toBeDefined();
      expect(user.role).toBe('user');
    });

    it('应该使用指定的角色创建用户', async () => {
      const user = await service.createUser('admin@example.com', 'hashed', 'admin');
      expect(user.role).toBe('admin');
    });

    it('应该设置默认缓存 TTL', async () => {
      const user = await service.createUser('test@example.com', 'hashed');
      expect(user.cache_ttl_backup).toBe(5 * 60 * 1000);
      expect(user.cache_ttl_channels).toBe(5 * 60 * 1000);
    });
  });

  describe('updateUser', () => {
    it('应该更新用户字段', async () => {
      const table = mockDb.getTable('users');
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        password: 'old-password',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      });

      const updated = await service.updateUser('u1', { password: 'new-password' });
      expect(updated).not.toBeNull();
      expect(updated?.password).toBe('new-password');
    });

    it('应该返回当前用户当没有更新字段时', async () => {
      const table = mockDb.getTable('users');
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        password: 'hashed',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      });

      const result = await service.updateUser('u1', {});
      expect(result).not.toBeNull();
      expect(result?.email).toBe('test@example.com');
    });

    it('应该返回 null 当用户不存在', async () => {
      const result = await service.updateUser('nonexistent', { password: 'new' });
      expect(result).toBeNull();
    });
  });

  describe('deleteUser', () => {
    it('应该成功删除存在的用户', async () => {
      const table = mockDb.getTable('users');
      table.set('u1', { id: 'u1', email: 'test@example.com' });

      const result = await service.deleteUser('u1');
      expect(result).toBe(true);
      expect(table.has('u1')).toBe(false);
    });

    it('应该返回 false 当用户不存在', async () => {
      const result = await service.deleteUser('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('密码重置流程', () => {
    it('应该生成密码重置令牌', async () => {
      const table = mockDb.getTable('users');
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        password: 'hashed',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      });

      const token = await service.generatePasswordResetToken('test@example.com');
      expect(token).not.toBeNull();
      expect(typeof token).toBe('string');
      expect(token!.length).toBeGreaterThan(0);
    });

    it('应该返回 null 当邮箱不存在', async () => {
      const token = await service.generatePasswordResetToken('nonexistent@example.com');
      expect(token).toBeNull();
    });

    it('应该验证有效的密码重置令牌', async () => {
      const table = mockDb.getTable('users');
      const futureExpiry = Date.now() + 24 * 60 * 60 * 1000;
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        password: 'hashed',
        password_reset_token: 'valid-token',
        password_reset_expires_at: futureExpiry,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      });

      const user = await service.verifyPasswordResetToken('valid-token');
      expect(user).not.toBeNull();
      expect(user?.email).toBe('test@example.com');
    });

    it('应该返回 null 当令牌不存在', async () => {
      const user = await service.verifyPasswordResetToken('invalid-token');
      expect(user).toBeNull();
    });

    it('应该返回 null 当令牌过期', async () => {
      const table = mockDb.getTable('users');
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        password: 'hashed',
        password_reset_token: 'expired-token',
        password_reset_expires_at: Date.now() - 1000,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      });

      const user = await service.verifyPasswordResetToken('expired-token');
      expect(user).toBeNull();
    });

    it('应该通过令牌重置密码', async () => {
      const table = mockDb.getTable('users');
      const futureExpiry = Date.now() + 24 * 60 * 60 * 1000;
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        password: 'old-hash',
        password_reset_token: 'valid-token',
        password_reset_expires_at: futureExpiry,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      });

      const result = await service.resetPasswordWithToken('valid-token', 'new-hash');
      expect(result).toBe(true);

      const user = await service.findById('u1');
      expect(user?.password).toBe('new-hash');
      expect(user?.password_reset_token).toBeNull();
      expect(user?.password_reset_expires_at).toBeNull();
    });

    it('应该返回 false 当令牌无效时重置密码', async () => {
      const result = await service.resetPasswordWithToken('invalid-token', 'new-hash');
      expect(result).toBe(false);
    });
  });

  describe('邮箱验证流程', () => {
    it('应该生成验证码', async () => {
      const table = mockDb.getTable('users');
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        password: 'hashed',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      });

      const code = await service.generateVerificationCode('test@example.com');
      expect(code).not.toBeNull();
      expect(code!.length).toBe(6);
      expect(/^\d{6}$/.test(code!)).toBe(true);
    });

    it('应该返回 null 当邮箱不存在时生成验证码', async () => {
      const code = await service.generateVerificationCode('nonexistent@example.com');
      expect(code).toBeNull();
    });

    it('应该验证正确的验证码', async () => {
      const table = mockDb.getTable('users');
      const futureExpiry = Date.now() + 30 * 60 * 1000;
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        password: 'hashed',
        verification_code: '123456',
        verification_expires_at: futureExpiry,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      });

      const result = await service.verifyEmail('test@example.com', '123456');
      expect(result).toBe(true);
    });

    it('应该拒绝错误的验证码', async () => {
      const table = mockDb.getTable('users');
      const futureExpiry = Date.now() + 30 * 60 * 1000;
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        password: 'hashed',
        verification_code: '123456',
        verification_expires_at: futureExpiry,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      });

      const result = await service.verifyEmail('test@example.com', '999999');
      expect(result).toBe(false);
    });

    it('应该拒绝过期的验证码', async () => {
      const table = mockDb.getTable('users');
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        password: 'hashed',
        verification_code: '123456',
        verification_expires_at: Date.now() - 1000,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      });

      const result = await service.verifyEmail('test@example.com', '123456');
      expect(result).toBe(false);
    });

    it('应该检查邮箱验证状态 - 已验证', async () => {
      const table = mockDb.getTable('users');
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        password: 'hashed',
        email_verified: 1,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      });

      const verified = await service.isEmailVerified('test@example.com');
      expect(verified).toBe(true);
    });

    it('应该检查邮箱验证状态 - 老用户无验证码视为已验证', async () => {
      const table = mockDb.getTable('users');
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        password: 'hashed',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      });

      const verified = await service.isEmailVerified('test@example.com');
      expect(verified).toBe(true);
    });

    it('应该检查邮箱验证状态 - 新用户未验证', async () => {
      const table = mockDb.getTable('users');
      table.set('u1', {
        id: 'u1',
        email: 'test@example.com',
        password: 'hashed',
        verification_code: '123456',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      });

      const verified = await service.isEmailVerified('test@example.com');
      expect(verified).toBe(false);
    });

    it('应该返回 false 当邮箱不存在时检查验证状态', async () => {
      const verified = await service.isEmailVerified('nonexistent@example.com');
      expect(verified).toBe(false);
    });
  });

  describe('默认设置', () => {
    it('应该返回正确的默认缓存设置', () => {
      const settings = service.getDefaultCacheSettings();
      expect(settings.cache_ttl_backup).toBe(5 * 60 * 1000);
      expect(settings.cache_ttl_channels).toBe(5 * 60 * 1000);
      expect(settings.cache_ttl_templates).toBe(5 * 60 * 1000);
      expect(settings.cache_ttl_groups).toBe(5 * 60 * 1000);
      expect(settings.cache_ttl_scheduled).toBe(5 * 60 * 1000);
    });

    it('应该返回正确的默认 AI 设置', () => {
      const settings = service.getDefaultAISettings();
      expect(settings.ai_enabled).toBe(true);
      expect(settings.ai_provider).toBe('workers-ai');
      expect(settings.ai_model).toBe('workers-ai');
      expect(settings.custom_ai_providers).toEqual([]);
      expect(settings.ai_provider_configs).toEqual({});
    });

    it('应该返回默认 AI 工具列表', () => {
      const tools = service.getDefaultAITools();
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.map((t) => t.id)).toContain('listTemplates');
      expect(tools.map((t) => t.id)).toContain('createTemplate');
      expect(tools.map((t) => t.id)).toContain('listGroups');
    });

    it('应该合并缓存和 AI 设置', () => {
      const settings = service.getDefaultSettings();
      expect(settings.cache_ttl_backup).toBeDefined();
      expect(settings.ai_enabled).toBeDefined();
    });
  });

  describe('getUserAITools', () => {
    it('应该返回所有启用的默认工具', () => {
      const settings = service.getDefaultAISettings();
      const tools = service.getUserAITools(settings);
      expect(tools.length).toBeGreaterThan(0);
      tools.forEach((t) => expect(t.enabled).toBe(true));
    });

    it('应该过滤掉用户禁用的工具', () => {
      const settings: AISettings = {
        ...service.getDefaultAISettings(),
        ai_tools: [
          {
            id: 'listTemplates',
            name: 'listTemplates',
            description: 'desc',
            parameters: [],
            enabled: false,
          },
        ],
      };
      const tools = service.getUserAITools(settings);
      expect(tools.find((t) => t.id === 'listTemplates')).toBeUndefined();
    });

    it('应该包含用户的自定义工具', () => {
      const settings: AISettings = {
        ...service.getDefaultAISettings(),
        ai_tools: [
          {
            id: 'custom_1',
            name: 'custom_myTool',
            description: 'Custom tool',
            parameters: [],
            enabled: true,
          },
        ],
      };
      const tools = service.getUserAITools(settings);
      expect(tools.find((t) => t.id === 'custom_1')).toBeDefined();
    });
  });
});
