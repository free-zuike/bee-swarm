import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PushService } from '../../src/services/push';
import type { PushChannel } from '../../types';

class MockD1Database {
  private tables: Map<string, Map<string, any>> = new Map();

  constructor() {
    this.tables.set('push_templates', new Map());
    this.tables.set('channel_groups', new Map());
    this.tables.set('scheduled_pushes', new Map());
    this.tables.set('push_history', new Map());
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
    const result = await this._execute('first');
    return (result as T) || null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    const result = await this._execute('all');
    return { results: (result as T[]) || [] };
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

  private async _execute(type: string): Promise<any> {
    const sql = this.sql.trim().toUpperCase();
    if (sql.startsWith('SELECT')) return this._handleSelect(type);
    return type === 'all' ? [] : null;
  }

  private _handleSelect(type: string): any {
    const sqlLower = this.sql.toLowerCase();

    if (sqlLower.includes('push_history')) {
      return this._selectPushHistory(sqlLower, type);
    }

    if (sqlLower.includes('scheduled_pushes')) {
      return this._selectScheduledPushes(sqlLower, type);
    }

    return type === 'all' ? [] : null;
  }

  private _selectPushHistory(sqlLower: string, type: string): any {
    const table = this.tables.get('push_history') || new Map();
    const allRows = Array.from(table.values());
    const userId = this.boundParams[0];

    let filtered = allRows.filter((r: any) => r.user_id === userId);

    // Check group by FIRST since those queries also contain count(*)
    if (sqlLower.includes('group by')) {
      const grouped: Record<string, any> = {};
      for (const row of filtered) {
        const date = (row.created_at || '').split('T')[0] || 'unknown';
        if (!grouped[date]) {
          grouped[date] = { date, pushes: 0, success: 0, failed: 0 };
        }
        grouped[date].pushes++;
        if (row.status === 'success') grouped[date].success++;
        else grouped[date].failed++;
      }
      return Object.values(grouped);
    }

    if (sqlLower.includes('count(*)')) {
      if (sqlLower.includes("status != 'success'")) {
        filtered = filtered.filter((r: any) => r.status !== 'success');
      } else if (sqlLower.includes("status = 'success'")) {
        filtered = filtered.filter((r: any) => r.status === 'success');
      }
      return type === 'first' ? { total: filtered.length, count: filtered.length } : [{ total: filtered.length }];
    }

    return type === 'first' ? filtered[0] || null : filtered;
  }

  private _selectScheduledPushes(sqlLower: string, type: string): any {
    const table = this.tables.get('scheduled_pushes') || new Map();
    const allRows = Array.from(table.values());

    // Single record query: WHERE id = ? AND user_id = ?
    const idCondition = sqlLower.includes('where id = ?');
    if (idCondition) {
      const recordId = this.boundParams[0];
      const userId = this.boundParams[1];
      const filtered = allRows.filter((r: any) => r.id === recordId && r.user_id === userId);
      return type === 'first' ? filtered[0] || null : filtered;
    }

    // List query: WHERE user_id = ? (with optional status filter)
    const userId = this.boundParams[0];
    let filtered = allRows.filter((r: any) => r.user_id === userId);

    // status filter
    if (this.boundParams.length >= 2 && typeof this.boundParams[1] === 'string') {
      const status = this.boundParams[1];
      filtered = filtered.filter((r: any) => r.status === status);
    }

    return type === 'first' ? filtered[0] || null : filtered;
  }

  private _handleInsert(): void {
    const sqlLower = this.sql.toLowerCase();

    if (sqlLower.includes('scheduled_pushes')) {
      const table = this.tables.get('scheduled_pushes') || new Map();
      const params = this.boundParams;
      const row: Record<string, any> = {
        id: params[0],
        user_id: params[1],
        template_id: params[2],
        cron: params[3],
        next_run: params[4],
        title: params[5],
        body: params[6],
        url: params[7],
        channels: params[8],
        enabled: params[9],
        recurring_type: params[10],
        selected_week_days: params[11],
        selected_month_days: params[12],
        yearly_dates: params[13],
        timezone: params[14],
        status: 'pending',
        created_at: params.length > 16 ? params[15] : params[params.length - 2],
        updated_at: params.length > 16 ? params[16] : params[params.length - 1],
        overdue_reminder_sent: 0,
      };
      table.set(row.id, row);
      this.tables.set('scheduled_pushes', table);
    }
  }

  private _handleUpdate(): number {
    const sqlLower = this.sql.toLowerCase();
    let changes = 0;

    if (sqlLower.includes('scheduled_pushes')) {
      const table = this.tables.get('scheduled_pushes') || new Map();

      if (sqlLower.includes('in (')) {
        // Batch operation: params are [timestamp, id1, id2, ..., userId]
        const userId = this.boundParams[this.boundParams.length - 1];
        const lastIdIndex = this.boundParams.length - 2;

        for (let i = 1; i <= lastIdIndex; i++) {
          const id = this.boundParams[i];
          const row = table.get(id);
          if (row && row.user_id === userId) {
            let statusMatch = true;
            if (sqlLower.includes("and status = 'pending'") && row.status !== 'pending') statusMatch = false;
            if (sqlLower.includes("and status = 'failed'") && row.status !== 'failed') statusMatch = false;

            if (statusMatch) {
              if (sqlLower.includes("set status = 'failed'")) row.status = 'failed';
              if (sqlLower.includes("set status = 'pending'")) row.status = 'pending';
              row.updated_at = this.boundParams[0];
              table.set(id, row);
              changes++;
            }
          }
        }
        this.tables.set('scheduled_pushes', table);
      } else {
        // Single operation: params are [status, timestamp, id, userId] or similar
        const id = this.boundParams[this.boundParams.length - 2];
        const userId = this.boundParams[this.boundParams.length - 1];
        const row = table.get(id);

        if (row && row.user_id === userId) {
          let statusMatch = true;
          if (sqlLower.includes("and status = 'pending'") && row.status !== 'pending') statusMatch = false;

          if (statusMatch) {
            if (sqlLower.includes("set status = 'failed'")) row.status = 'failed';
            if (sqlLower.includes("set status = 'overdue'")) row.status = 'overdue';
            if (sqlLower.includes("set status = 'pending'")) row.status = 'pending';
            if (sqlLower.includes('status = ?')) row.status = this.boundParams[0];
            if (sqlLower.includes('next_run = ?')) row.next_run = this.boundParams[1];
            if (sqlLower.includes('overdue_reminder_sent = ?')) row.overdue_reminder_sent = this.boundParams[0];
            row.updated_at = this.boundParams[0] || new Date().toISOString();
            table.set(id, row);
            changes = 1;
          }
        }
      }
      this.tables.set('scheduled_pushes', table);
    }

    return changes;
  }

  private _handleDelete(): number {
    const sqlLower = this.sql.toLowerCase();
    let tableName: string | undefined;
    if (sqlLower.includes('scheduled_pushes')) tableName = 'scheduled_pushes';
    else return 0;

    const table = this.tables.get(tableName) || new Map();
    const id = this.boundParams[0];
    const userId = this.boundParams[1];
    const row = table.get(id);
    if (row && row.user_id === userId) {
      table.delete(id);
      this.tables.set(tableName, table);
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

describe('PushService 推送统计', () => {
  let mockDb: MockD1Database;
  let env: any;
  let pushService: PushService;

  beforeEach(() => {
    mockDb = new MockD1Database();
    env = createMockEnv(mockDb);
    pushService = new PushService(env, 'test-user');
  });

  describe('getPushStats', () => {
    it('应该返回零统计数据当没有推送历史', async () => {
      const stats = await pushService.getPushStats(7);
      expect(stats.session.total).toBe(0);
      expect(stats.session.success).toBe(0);
      expect(stats.session.failed).toBe(0);
      expect(stats.trend.rate).toBe(0);
      expect(stats.recent).toEqual([]);
    });

    it('应该正确计算推送统计数据', async () => {
      const table = mockDb.getTable('push_history');
      const now = new Date().toISOString();
      table.set('h1', { id: 'h1', user_id: 'test-user', status: 'success', created_at: now });
      table.set('h2', { id: 'h2', user_id: 'test-user', status: 'success', created_at: now });
      table.set('h3', { id: 'h3', user_id: 'test-user', status: 'failed', created_at: now });

      const stats = await pushService.getPushStats(7);
      expect(stats.session.total).toBe(3);
      expect(stats.session.success).toBe(2);
      expect(stats.session.failed).toBe(1);
    });
  });

  describe('定时推送管理', () => {
    it('应该创建定时推送', async () => {
      const push = await pushService.createScheduledPush({
        title: 'Test Scheduled',
        content: 'Content',
        channels: ['wework'],
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });

      expect(push.id).toBeDefined();
      expect(push.status).toBe('pending');
      expect(push.createdBy).toBe('test-user');
    });

    it('应该获取定时推送列表', async () => {
      await pushService.createScheduledPush({
        title: 'Push 1',
        content: 'Content',
        channels: [],
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });

      const pushes = await pushService.getScheduledPushes();
      expect(pushes.length).toBe(1);
      expect(pushes[0].title).toBe('Push 1');
    });

    it('应该按状态筛选定时推送', async () => {
      await pushService.createScheduledPush({
        title: 'Push 1',
        content: 'Content',
        channels: [],
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });

      const pending = await pushService.getScheduledPushes('pending');
      expect(pending.length).toBe(1);

      const completed = await pushService.getScheduledPushes('completed');
      expect(completed.length).toBe(0);
    });

    it('应该取消定时推送', async () => {
      const push = await pushService.createScheduledPush({
        title: 'To Cancel',
        content: 'Content',
        channels: [],
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });

      const result = await pushService.cancelScheduledPush(push.id);
      expect(result).toBe(true);

      const pushes = await pushService.getScheduledPushes();
      expect(pushes[0].status).toBe('cancelled');
    });

    it('应该批量取消定时推送', async () => {
      const p1 = await pushService.createScheduledPush({
        title: 'P1', content: '', channels: [],
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });
      const p2 = await pushService.createScheduledPush({
        title: 'P2', content: '', channels: [],
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });

      const result = await pushService.batchCancelScheduledPushes([p1.id, p2.id, 'non-existent']);
      expect(result.cancelled).toBe(2);
      expect(result.notFound).toBe(1);
    });

    it('应该批量启用定时推送', async () => {
      const push = await pushService.createScheduledPush({
        title: 'To Enable', content: '', channels: [],
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });

      await pushService.cancelScheduledPush(push.id);

      const result = await pushService.batchEnableScheduledPushes([push.id]);
      expect(result.enabled).toBe(1);
    });

    it('应该删除定时推送', async () => {
      const push = await pushService.createScheduledPush({
        title: 'To Delete', content: '', channels: [],
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });

      const deleted = await pushService.deleteScheduledPush(push.id);
      expect(deleted).toBe(true);

      const pushes = await pushService.getScheduledPushes();
      expect(pushes.length).toBe(0);
    });

    it('应该返回 false 当删除不存在的定时推送', async () => {
      const deleted = await pushService.deleteScheduledPush('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('超时任务检测', () => {
    it('应该检测超时任务', async () => {
      const pastTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      await pushService.createScheduledPush({
        title: 'Overdue Task',
        content: 'Content',
        channels: [],
        scheduledAt: pastTime,
      });

      const overdue = await pushService.detectOverdueTasks(30);
      expect(overdue.length).toBe(1);
      expect(overdue[0].status).toBe('overdue');
    });

    it('应该返回空列表当没有超时任务', async () => {
      const futureTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await pushService.createScheduledPush({
        title: 'Future Task',
        content: 'Content',
        channels: [],
        scheduledAt: futureTime,
      });

      const overdue = await pushService.detectOverdueTasks(30);
      expect(overdue.length).toBe(0);
    });
  });

  describe('标记超时状态', () => {
    it('应该标记任务为超时', async () => {
      const push = await pushService.createScheduledPush({
        title: 'To Mark Overdue', content: '', channels: [],
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });

      await pushService.markPushAsOverdue(push.id);

      const pushes = await pushService.getScheduledPushes();
      expect(pushes[0].status).toBe('overdue');
    });
  });

  describe('重新调度超时任务', () => {
    it('应该重新调度超时任务', async () => {
      const push = await pushService.createScheduledPush({
        title: 'To Reschedule', content: '', channels: [],
        scheduledAt: new Date(Date.now() - 3600000).toISOString(),
      });

      await pushService.markPushAsOverdue(push.id);

      const newTime = new Date(Date.now() + 3600000).toISOString();
      const rescheduled = await pushService.rescheduleOverdueTask(push.id, newTime);

      expect(rescheduled).not.toBeNull();
      expect(rescheduled?.status).toBe('pending');
    });
  });

  describe('hasSentOverdueReminder', () => {
    it('应该返回 false 当提醒未发送', async () => {
      const push = await pushService.createScheduledPush({
        title: 'Task', content: '', channels: [],
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });

      const result = await pushService.hasSentOverdueReminder(push.id);
      expect(result).toBe(false);
    });
  });

  describe('getOverdueTasks', () => {
    it('应该返回超时任务列表', async () => {
      const pastTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const push = await pushService.createScheduledPush({
        title: 'Overdue', content: '', channels: [],
        scheduledAt: pastTime,
      });

      await pushService.markPushAsOverdue(push.id);

      const overdue = await pushService.getOverdueTasks();
      expect(overdue.length).toBe(1);
      expect(overdue[0].status).toBe('overdue');
    });
  });

  describe('updateScheduledPushStatus', () => {
    it('应该更新任务状态', async () => {
      const push = await pushService.createScheduledPush({
        title: 'Status Update', content: '', channels: [],
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });

      await pushService.updateScheduledPushStatus(push.id, 'processing');

      const pushes = await pushService.getScheduledPushes();
      expect(pushes[0].status).toBe('processing');
    });
  });

  describe('updateScheduledPushAndTime', () => {
    it('应该同时更新状态和下次执行时间', async () => {
      const push = await pushService.createScheduledPush({
        title: 'Update Both', content: '', channels: [],
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });

      const newTime = new Date(Date.now() + 7200000).toISOString();
      await pushService.updateScheduledPushAndTime(push.id, 'pending', newTime);

      const pushes = await pushService.getScheduledPushes();
      expect(pushes[0].status).toBe('pending');
    });
  });
});
