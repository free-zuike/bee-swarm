import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  replaceTemplateVariables,
  extractVariables,
  PushService,
  type PushTemplate,
  type ChannelGroup,
  type ScheduledPush
} from '../../src/services/push';
import type { PushChannel, ChannelConfig } from '../../types';

// 模拟 D1 数据库
class MockD1Database {
  private tables: Map<string, Map<string, any>> = new Map();
  
  constructor() {
    // 初始化需要的表
    this.tables.set('push_templates', new Map());
    this.tables.set('channel_groups', new Map());
    this.tables.set('scheduled_pushes', new Map());
    this.tables.set('push_history', new Map());
  }

  prepare(sql: string) {
    return new MockPreparedStatement(sql, this.tables);
  }
}

class MockPreparedStatement {
  private sql: string;
  private tables: Map<string, Map<string, any>>;
  private params: any[] = [];

  constructor(sql: string, tables: Map<string, Map<string, any>>) {
    this.sql = sql;
    this.tables = tables;
  }

  bind(...params: any[]) {
    this.params = params;
    return this;
  }

  async first(): Promise<any> {
    return this._execute('first');
  }

  async all(): Promise<{ results: any[] }> {
    const result = await this._execute('all');
    return { results: result as any[] || [] };
  }

  async run(): Promise<{ success: boolean, meta?: { changes: number } }> {
    const sql = this.sql.trim().toUpperCase();
    let changes = 0;

    if (sql.startsWith('INSERT')) {
      this._handleInsert(sql);
      changes = 1;
    } else if (sql.startsWith('UPDATE')) {
      changes = this._handleUpdate(sql);
    } else if (sql.startsWith('DELETE')) {
      changes = this._handleDelete(sql);
    }

    return { success: true, meta: { changes } };
  }

  private async _execute(type: string): Promise<any> {
    const sql = this.sql.trim().toUpperCase();
    
    // 处理 SELECT 查询
    if (sql.startsWith('SELECT')) {
      return this._handleSelect(sql, type);
    }

    // 处理 INSERT
    if (sql.startsWith('INSERT')) {
      return this._handleInsert(sql);
    }

    // 处理 UPDATE
    if (sql.startsWith('UPDATE')) {
      return this._handleUpdate(sql);
    }

    // 处理 DELETE
    if (sql.startsWith('DELETE')) {
      return this._handleDelete(sql);
    }

    return type === 'all' ? [] : null;
  }

  private _handleSelect(sql: string, type: string): any {
    const sqlLower = sql.toLowerCase();
    
    // 检查是否是单个记录查询（WHERE id = ? AND user_id = ?）
    const idCondition = sqlLower.includes('where') && sqlLower.match(/where\s+id\s*=\s*\?/);
    
    // 处理 push_templates
    if (sqlLower.includes('push_templates')) {
      const table = this.tables.get('push_templates') || new Map();
      const allResults = Array.from(table.values());
      
      let filteredResults;
      
      if (idCondition) {
        // 单个记录查询：WHERE id = ? AND user_id = ?
        const recordId = this.params[0];
        const userId = this.params[1];
        filteredResults = allResults.filter(row => 
          row.id === recordId && row.user_id === userId
        );
      } else {
        // 列表查询：WHERE user_id = ?
        const userId = this.params[0];
        filteredResults = allResults.filter(row => 
          row.user_id === userId
        );
      }
      
      return type === 'first' ? filteredResults[0] || null : filteredResults;
    }

    // 处理 channel_groups
    if (sqlLower.includes('channel_groups')) {
      const table = this.tables.get('channel_groups') || new Map();
      const allResults = Array.from(table.values());
      
      let filteredResults;
      
      if (idCondition) {
        // 单个记录查询
        const recordId = this.params[0];
        const userId = this.params[1];
        filteredResults = allResults.filter(row => 
          row.id === recordId && row.user_id === userId
        );
      } else {
        // 列表查询
        const userId = this.params[0];
        filteredResults = allResults.filter(row => 
          row.user_id === userId
        );
      }
      
      return type === 'first' ? filteredResults[0] || null : filteredResults;
    }

    // 处理 scheduled_pushes
    if (sqlLower.includes('scheduled_pushes')) {
      const table = this.tables.get('scheduled_pushes') || new Map();
      const allResults = Array.from(table.values());
      
      let filteredResults;
      
      if (idCondition) {
        // 单个记录查询
        const recordId = this.params[0];
        const userId = this.params[1];
        filteredResults = allResults.filter(row => 
          row.id === recordId && row.user_id === userId
        );
      } else {
        // 列表查询
        const userId = this.params[0];
        filteredResults = allResults.filter(row => 
          row.user_id === userId
        );
        
        // 如果有 status 参数
        if (this.params.length >= 2) {
          const status = this.params[1];
          if (typeof status === 'string') {
            filteredResults = filteredResults.filter(row => 
              row.status === status
            );
          }
        }
      }
      
      return type === 'first' ? filteredResults[0] || null : filteredResults;
    }

    return type === 'all' ? [] : null;
  }

  private _handleInsert(sql: string): void {
    const sqlLower = sql.toLowerCase();

    if (sqlLower.includes('push_templates')) {
      const table = this.tables.get('push_templates') || new Map();
      const id = this.params[0];
      const row = {
        id: this.params[0],
        user_id: this.params[1],
        name: this.params[2],
        title: this.params[3],
        body: this.params[4],
        channels: this.params[5],
        url: this.params[6],
        image_url: this.params[7],
        markdown: this.params[8],
        created_at: this.params[9],
        updated_at: this.params[10],
      };
      table.set(id, row);
      this.tables.set('push_templates', table);
    }

    if (sqlLower.includes('channel_groups')) {
      const table = this.tables.get('channel_groups') || new Map();
      const id = this.params[0];
      const row = {
        id: this.params[0],
        user_id: this.params[1],
        name: this.params[2],
        channels: this.params[3],
        created_at: this.params[4],
        updated_at: this.params[5],
      };
      table.set(id, row);
      this.tables.set('channel_groups', table);
    }

    if (sqlLower.includes('scheduled_pushes')) {
      const table = this.tables.get('scheduled_pushes') || new Map();
      const id = this.params[0];

      // 根据参数数量判断结构
      // 新结构：20个参数（包含 original_next_run, ab_test_enabled, ab_test_variants）
      // 旧结构：16个参数
      const isNewStructure = this.params.length >= 20;

      let row: Record<string, any>;
      if (isNewStructure) {
        // 新结构：包含 original_next_run
        row = {
          id: this.params[0],
          user_id: this.params[1],
          template_id: this.params[2],
          cron: this.params[3],
          next_run: this.params[4],
          original_next_run: this.params[5],
          title: this.params[6],
          body: this.params[7],
          url: this.params[8],
          channels: this.params[9],
          enabled: this.params[10],
          recurring_type: this.params[11],
          selected_week_days: this.params[12],
          selected_month_days: this.params[13],
          yearly_dates: this.params[14],
          timezone: this.params[15],
          status: 'pending',
          created_at: this.params[18],
          updated_at: this.params[19],
        };
      } else {
        // 旧结构：不包含 original_next_run
        row = {
          id: this.params[0],
          user_id: this.params[1],
          template_id: this.params[2],
          cron: this.params[3],
          next_run: this.params[4],
          title: this.params[5],
          body: this.params[6],
          url: this.params[7],
          channels: this.params[8],
          enabled: this.params[9],
          status: 'pending',
          created_at: this.params[10],
          updated_at: this.params[11],
        };
      }

      table.set(id, row);
      this.tables.set('scheduled_pushes', table);
    }
  }

  private _handleUpdate(sql: string): number {
    const sqlLower = sql.toLowerCase();
    let changes = 0;

    if (sqlLower.includes('push_templates')) {
      const table = this.tables.get('push_templates') || new Map();
      const id = this.params[this.params.length - 2];
      const userId = this.params[this.params.length - 1];
      const row = table.get(id);
      if (row && row.user_id === userId) {
        let paramIdx = 0;
        row.updated_at = this.params[paramIdx++];
        
        if (sqlLower.includes('name = ?')) {
          row.name = this.params[paramIdx++];
        }
        if (sqlLower.includes('title = ?')) {
          row.title = this.params[paramIdx++];
        }
        if (sqlLower.includes('body = ?')) {
          row.body = this.params[paramIdx++];
        }
        if (sqlLower.includes('channels = ?')) {
          row.channels = this.params[paramIdx++];
        }
        if (sqlLower.includes('url = ?')) {
          row.url = this.params[paramIdx++];
        }
        if (sqlLower.includes('image_url = ?')) {
          row.image_url = this.params[paramIdx++];
        }
        if (sqlLower.includes('markdown = ?')) {
          row.markdown = this.params[paramIdx++];
        }
        
        table.set(id, row);
        this.tables.set('push_templates', table);
        changes = 1;
      }
    }

    if (sqlLower.includes('channel_groups')) {
      const table = this.tables.get('channel_groups') || new Map();
      const id = this.params[this.params.length - 2];
      const userId = this.params[this.params.length - 1];
      const row = table.get(id);
      if (row && row.user_id === userId) {
        let paramIdx = 0;
        row.updated_at = this.params[paramIdx++];
        
        if (sqlLower.includes('name = ?')) {
          row.name = this.params[paramIdx++];
        }
        if (sqlLower.includes('channels = ?')) {
          row.channels = this.params[paramIdx++];
        }
        
        table.set(id, row);
        this.tables.set('channel_groups', table);
        changes = 1;
      }
    }

    if (sqlLower.includes('scheduled_pushes')) {
      const table = this.tables.get('scheduled_pushes') || new Map();
      
      if (sql.includes('IN (')) { // 批量操作
        const userId = this.params[this.params.length - 1];
        const lastIdParamIndex = this.params.length - 2;
        
        for (let i = 1; i <= lastIdParamIndex; i++) {
          const id = this.params[i];
          const row = table.get(id);
          if (row && row.user_id === userId) {
            // 检查 status 条件
            let statusMatch = true;
            if (sqlLower.includes('and status = \'pending\'')) {
              if (row.status !== 'pending') statusMatch = false;
            }
            if (sqlLower.includes('and status = \'failed\'')) {
              if (row.status !== 'failed') statusMatch = false;
            }
            if (sqlLower.includes('and status in (\'failed\', \'cancelled\')')) {
              if (row.status !== 'failed' && row.status !== 'cancelled') statusMatch = false;
            }

            if (statusMatch) {
              if (sqlLower.includes('set status = ')) {
                // cancel 或者 enable 操作
                if (sqlLower.includes('set status = \'failed\'')) {
                  row.status = 'failed';
                } else if (sqlLower.includes('set status = \'cancelled\'')) {
                  row.status = 'cancelled';
                } else if (sqlLower.includes('set status = \'pending\'')) {
                  row.status = 'pending';
                }
                row.updated_at = this.params[0];
              }
              if (sqlLower.includes('enabled = ?')) {
                row.enabled = this.params[0];
                row.updated_at = new Date().toISOString();
              }
              table.set(id, row);
              changes++;
            }
          }
        }
        this.tables.set('scheduled_pushes', table);
      } else { // 单个操作
        const id = this.params[this.params.length - 2];
        const userId = this.params[this.params.length - 1];
        const row = table.get(id);
        if (row && row.user_id === userId) {
          // 检查 status 条件
          let statusMatch = true;
          if (sqlLower.includes('and status = \'pending\'')) {
            if (row.status !== 'pending') statusMatch = false;
          }

          if (statusMatch) {
            if (sqlLower.includes('set status = \'failed\'')) {
              row.status = 'failed';
              row.updated_at = this.params[0];
            } else if (sqlLower.includes('set status = \'cancelled\'')) {
              row.status = 'cancelled';
              row.updated_at = this.params[0];
            } else if (sqlLower.includes('status = ?')) {
              row.status = this.params[0];
              row.updated_at = sqlLower.includes('next_run') ? this.params[2] : this.params[1];
            }
            if (sqlLower.includes('overdue_reminder_sent = ?')) {
              row.overdue_reminder_sent = this.params[0];
              row.updated_at = this.params[1];
            }
            if (sqlLower.includes('enabled = ?')) {
              row.enabled = this.params[0];
              row.updated_at = this.params[1];
            }
            if (sqlLower.includes('next_run = ?')) {
              row.next_run = this.params[1];
              row.updated_at = this.params[2];
            }
            table.set(id, row);
            this.tables.set('scheduled_pushes', table);
            changes = 1;
          }
        }
      }
    }

    return changes;
  }

  private _handleDelete(sql: string): number {
    const sqlLower = sql.toLowerCase();
    let tableName;
    if (sqlLower.includes('push_templates')) tableName = 'push_templates';
    else if (sqlLower.includes('channel_groups')) tableName = 'channel_groups';
    else if (sqlLower.includes('scheduled_pushes')) tableName = 'scheduled_pushes';
    else return 0;

    const table = this.tables.get(tableName) || new Map();
    const id = this.params[0];
    const userId = this.params[1];
    const row = table.get(id);
    if (row && row.user_id === userId) {
      table.delete(id);
      this.tables.set(tableName, table);
      return 1;
    }
    return 0;
  }
}

describe('PushService 模板工具', () => {
  describe('replaceTemplateVariables', () => {
    it('应该正确替换简单变量', () => {
      const result = replaceTemplateVariables('Hello {{name}}!', { name: 'World' });
      expect(result).toBe('Hello World!');
    });

    it('应该保留未找到的变量', () => {
      const result = replaceTemplateVariables('Hello {{name}}, {{missing}}!', { name: 'World' });
      expect(result).toBe('Hello World, {{missing}}!');
    });

    it('应该正确处理多个变量', () => {
      const result = replaceTemplateVariables(
        '{{greeting}} {{name}}!',
        { greeting: 'Hello', name: 'World' }
      );
      expect(result).toBe('Hello World!');
    });

    it('应该在启用自动变量时自动添加日期时间变量', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-30T12:00:00Z'));
      
      const result = replaceTemplateVariables('Date: {{date}}', {}, true);
      expect(result).toContain('Date:');
      
      vi.useRealTimers();
    });

    it('应该在禁用自动变量时不添加额外变量', () => {
      const result = replaceTemplateVariables('{{date}}', {}, false);
      expect(result).toBe('{{date}}');
    });
  });

  describe('extractVariables', () => {
    it('应该正确提取变量名', () => {
      const variables = extractVariables('Hello {{name}}, how are {{you}}?');
      expect(variables).toEqual(['name', 'you']);
    });

    it('应该去重重复的变量', () => {
      const variables = extractVariables('{{name}} and {{name}}');
      expect(variables).toEqual(['name']);
    });

    it('应该对空文本返回空数组', () => {
      expect(extractVariables('')).toEqual([]);
      expect(extractVariables('  ')).toEqual([]);
    });

    it('应该正确处理没有变量的文本', () => {
      expect(extractVariables('Hello World')).toEqual([]);
    });
  });
});

describe('PushService', () => {
  let env: any;
  let pushService: PushService;
  let mockDb: MockD1Database;

  beforeEach(() => {
    mockDb = new MockD1Database();
    env = {
      DB: mockDb,
    };
    pushService = new PushService(env, 'test-user');
  });

  describe('模板管理', () => {
    it('应该初始返回空模板列表', async () => {
      const templates = await pushService.getTemplates();
      expect(templates).toEqual([]);
    });

    it('应该正确创建和保存新模板', async () => {
      const templateData = {
        name: 'Test Template',
        title: 'Test Title',
        content: 'Test Content',
        channels: ['wework'] as PushChannel[],
      };

      const template = await pushService.saveTemplate(templateData);

      expect(template.id).toBeDefined();
      expect(template.name).toBe(templateData.name);
      expect(template.createdAt).toBeDefined();
      expect(template.updatedAt).toBeDefined();

      const savedTemplates = await pushService.getTemplates();
      expect(savedTemplates.length).toBe(1);
      expect(savedTemplates[0].id).toBe(template.id);
    });

    it('应该正确更新现有模板', async () => {
      const template = await pushService.saveTemplate({
        name: 'Original',
        title: 'Original Title',
        content: 'Original Content',
      });

      const updated = await pushService.updateTemplate(template.id, { name: 'Updated' });

      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('Updated');
      expect(updated?.title).toBe('Original Title');
    });

    it('应该返回 null 当更新不存在的模板', async () => {
      const updated = await pushService.updateTemplate('non-existent-id', { name: 'Test' });
      expect(updated).toBeNull();
    });

    it('应该正确删除模板', async () => {
      const template = await pushService.saveTemplate({
        name: 'To Delete',
        title: 'Test',
        content: 'Test',
      });

      const deleted = await pushService.deleteTemplate(template.id);
      expect(deleted).toBe(true);

      const templates = await pushService.getTemplates();
      expect(templates.length).toBe(0);
    });

    it('应该返回 false 当删除不存在的模板', async () => {
      const deleted = await pushService.deleteTemplate('non-existent-id');
      expect(deleted).toBe(false);
    });
  });

  describe('渠道组管理', () => {
    it('应该正确创建渠道组', async () => {
      const group = await pushService.saveChannelGroup({
        name: 'Test Group',
        channels: ['wework', 'dingtalk'] as PushChannel[],
      });

      expect(group.id).toBeDefined();
      expect(group.name).toBe('Test Group');
      expect(group.channels).toEqual(['wework', 'dingtalk']);

      const groups = await pushService.getChannelGroups();
      expect(groups.length).toBe(1);
    });

    it('应该正确更新渠道组', async () => {
      const group = await pushService.saveChannelGroup({
        name: 'Original',
        channels: ['wework'] as PushChannel[],
      });

      const updated = await pushService.updateChannelGroup(group.id, {
        name: 'Updated',
        channels: ['dingtalk'],
      });

      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('Updated');
      expect(updated?.channels).toEqual(['dingtalk']);
    });

    it('应该正确删除渠道组', async () => {
      const group = await pushService.saveChannelGroup({
        name: 'To Delete',
        channels: [],
      });

      const deleted = await pushService.deleteChannelGroup(group.id);
      expect(deleted).toBe(true);

      const groups = await pushService.getChannelGroups();
      expect(groups.length).toBe(0);
    });
  });

  describe('定时推送管理', () => {
    it('应该正确创建定时推送', async () => {
      const push = await pushService.createScheduledPush({
        title: 'Test Scheduled Push',
        content: 'Test Content',
        channels: ['wework'] as PushChannel[],
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });

      expect(push.id).toBeDefined();
      expect(push.status).toBe('pending');
      expect(push.createdBy).toBe('test-user');
    });

    it('应该正确取消定时推送', async () => {
      const push = await pushService.createScheduledPush({
        title: 'Test',
        content: 'Test',
        channels: [],
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });

      const cancelled = await pushService.cancelScheduledPush(push.id);
      expect(cancelled).toBe(true);

      const pushes = await pushService.getScheduledPushes();
      expect(pushes[0].status).toBe('cancelled');
    });

    it('应该正确批量取消定时推送', async () => {
      const push1 = await pushService.createScheduledPush({
        title: 'Test 1',
        content: 'Test',
        channels: [],
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });

      const push2 = await pushService.createScheduledPush({
        title: 'Test 2',
        content: 'Test',
        channels: [],
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });

      const result = await pushService.batchCancelScheduledPushes([push1.id, push2.id, 'non-existent']);
      
      expect(result.cancelled).toBe(2);
      expect(result.notFound).toBe(1);
    });

    it('应该正确批量启用定时推送', async () => {
      const push = await pushService.createScheduledPush({
        title: 'Test',
        content: 'Test',
        channels: [],
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });

      await pushService.cancelScheduledPush(push.id);
      
      const result = await pushService.batchEnableScheduledPushes([push.id]);
      expect(result.enabled).toBe(1);

      const pushes = await pushService.getScheduledPushes();
      expect(pushes[0].status).toBe('pending');
    });
  });

  describe('推送并发功能', () => {
    it('应该正确处理空渠道列表', async () => {
      const sendFn = vi.fn().mockResolvedValue({
        channel: 'wework',
        success: true,
        message: 'OK',
      });

      const result = await pushService.pushConcurrent(
        [],
        {},
        { title: 'Test' },
        sendFn
      );

      expect(result.metrics.total).toBe(0);
      expect(sendFn).not.toHaveBeenCalled();
    });

    it('应该正确过滤禁用的渠道', async () => {
      const sendFn = vi.fn().mockResolvedValue({
        channel: 'wework',
        success: true,
        message: 'OK',
      });

      const settings: Record<string, ChannelConfig> = {
        wework: { enabled: true, config: {} },
        dingtalk: { enabled: false, config: {} },
      };

      await pushService.pushConcurrent(
        ['wework', 'dingtalk'] as PushChannel[],
        settings,
        { title: 'Test' },
        sendFn
      );

      expect(sendFn).toHaveBeenCalledTimes(1);
    });
  });
});
