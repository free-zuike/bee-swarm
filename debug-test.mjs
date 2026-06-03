
// 简单的调试脚本
import { PushService } from './src/services/push.js';

// 模拟 D1 数据库
class MockD1Database {
  private tables = new Map();

  constructor() {
    this.tables.set('push_templates', new Map());
    this.tables.set('channel_groups', new Map());
    this.tables.set('scheduled_pushes', new Map());
  }

  prepare(sql) {
    return new MockPreparedStatement(sql, this.tables);
  }
}

class MockPreparedStatement {
  private sql;
  private tables;
  private params = [];

  constructor(sql, tables) {
    this.sql = sql;
    this.tables = tables;
  }

  bind(...params) {
    this.params = params;
    console.log('Bind params:', JSON.stringify(params, null, 2));
    return this;
  }

  async first() {
    console.log('Calling first() on:', this.sql);
    return this._execute('first');
  }

  async all() {
    const result = await this._execute('all');
    console.log('Calling all() on:', this.sql, '->', result);
    return { results: result || [] };
  }

  async run() {
    console.log('Calling run() on:', this.sql);
    if (this.sql.trim().toUpperCase().startsWith('DELETE')) {
      const id = this.params[0];
      const tableName = this.sql.includes('push_templates') ? 'push_templates' 
        : this.sql.includes('channel_groups') ? 'channel_groups' 
        : 'scheduled_pushes';
      const table = this.tables.get(tableName) || new Map();
      const hadRecord = table.has(id);
      if (hadRecord) {
        table.delete(id);
      }
      return { success: true, meta: { changes: hadRecord ? 1 : 0 } };
    }
    if (this.sql.trim().toUpperCase().startsWith('UPDATE')) {
      return { success: true, meta: { changes: 1 } };
    }
    return { success: true };
  }

  async _execute(type) {
    const sql = this.sql.trim().toUpperCase();
    if (sql.startsWith('SELECT')) {
      return this._handleSelect(sql, type);
    }
    if (sql.startsWith('INSERT')) {
      return this._handleInsert(sql);
    }
    if (sql.startsWith('UPDATE')) {
      return this._handleUpdate(sql);
    }
    if (sql.startsWith('DELETE')) {
      return this._handleDelete(sql);
    }
    return type === 'all' ? [] : null;
  }

  _handleSelect(sql, type) {
    const userId = this.params[0];
    console.log('Handle SELECT, userId:', userId);
    
    if (sql.includes('push_templates')) {
      const table = this.tables.get('push_templates') || new Map();
      console.log('Table push_templates:', [...table.entries()]);
      const allResults = Array.from(table.values());
      const filteredResults = allResults.filter(row => row.user_id === userId || row.user_id === 'test-user');
      console.log('Filtered results:', filteredResults);
      return type === 'first' ? filteredResults[0] || null : filteredResults;
    }
    return [];
  }

  _handleInsert(sql) {
    console.log('Handle INSERT:', sql);
    if (sql.includes('push_templates')) {
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
      console.log('Inserting into push_templates:', JSON.stringify(row, null, 2));
      table.set(id, row);
      this.tables.set('push_templates', table);
      console.log('Table now:', [...table.entries()]);
    }
  }
}

// 测试
async function runTest() {
  console.log('=== Starting test ===');
  const mockDb = new MockD1Database();
  const env = { DB: mockDb };
  const pushService = new PushService(env, 'test-user');
  
  console.log('Creating template...');
  const template = await pushService.saveTemplate({
    name: 'Test Template',
    title: 'Test Title',
    content: 'Test Content'
  });
  console.log('Created template:', template);

  console.log('Getting templates...');
  const saved = await pushService.getTemplates();
  console.log('Saved templates:', saved);
}

runTest().catch(console.error);

