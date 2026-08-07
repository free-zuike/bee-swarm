// ============================================
// 数据库迁移服务
// 自动检查并添加缺失的表和列
// ============================================
import type { Env } from '../types';

export class MigrationService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  async runMigrations(): Promise<void> {
    if (!this.env.DB) {
      return;
    }

    try {
      // 确保 system_settings 表存在
      await this.env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS system_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`
      ).run();

      // 检查 users 表是否有需要的列，没有则添加
      await this.addColumnIfNotExists('users', 'password_reset_token', 'TEXT');
      await this.addColumnIfNotExists('users', 'password_reset_expires_at', 'INTEGER');
      await this.addColumnIfNotExists('users', 'email_verified', 'INTEGER DEFAULT 0');
      await this.addColumnIfNotExists('users', 'verification_code', 'TEXT');
      await this.addColumnIfNotExists('users', 'verification_expires_at', 'INTEGER');

      // 检查 scheduled_pushes 表是否有需要的列
      await this.addColumnIfNotExists('scheduled_pushes', 'yearly_dates', 'TEXT');
      await this.addColumnIfNotExists(
        'scheduled_pushes',
        'timezone',
        "TEXT DEFAULT 'Asia/Shanghai'"
      );
      await this.addColumnIfNotExists(
        'scheduled_pushes',
        'overdue_reminder_sent',
        'INTEGER DEFAULT 0'
      );

      // 检查 push_history 表是否有需要的列
      await this.addColumnIfNotExists('push_history', 'channels', 'TEXT');
      await this.addColumnIfNotExists('push_history', 'results', 'TEXT');
      await this.addColumnIfNotExists('push_history', 'status', 'TEXT');
      await this.addColumnIfNotExists('push_history', 'delivered_at', 'TEXT');
      await this.addColumnIfNotExists('push_history', 'read_at', 'TEXT');
      await this.addColumnIfNotExists('push_history', 'clicked_at', 'TEXT');

      // 检查 scheduled_pushes 表是否有 A/B 测试列
      await this.addColumnIfNotExists('scheduled_pushes', 'ab_test_enabled', 'INTEGER DEFAULT 0');
      await this.addColumnIfNotExists('scheduled_pushes', 'ab_test_variants', 'TEXT');

      // 检查 users 表是否有 IP 白名单列
      await this.addColumnIfNotExists('users', 'allowed_ips', 'TEXT');

      // 检查 scheduled_locks 表是否存在
      await this.env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS scheduled_locks (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          push_id TEXT NOT NULL,
          executed_at TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`
      ).run();

      // 检查 backup_runs 表是否存在
      await this.env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS backup_runs (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          endpoint_id TEXT NOT NULL,
          last_run INTEGER NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`
      ).run();

      // 检查 api_keys 表是否存在
      await this.env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS api_keys (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL DEFAULT 'default',
          key TEXT NOT NULL UNIQUE,
          expires_at INTEGER,
          enabled INTEGER DEFAULT 1,
          last_used_at INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`
      ).run();
      await this.addIndexIfNotExists('api_keys', 'idx_api_keys_user_id', 'user_id');
      await this.addIndexIfNotExists('api_keys', 'idx_api_keys_key', 'key');
    } catch (err) {
      console.error('[Migration] Error:', (err as Error).message);
    }
  }

  private async addColumnIfNotExists(table: string, column: string, type: string): Promise<void> {
    try {
      const result = await this.env.DB.prepare(`PRAGMA table_info(${table})`).all<any>();
      const columns = (result.results || []).map((c: any) => c.name);
      if (!columns.includes(column)) {
        await this.env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
      }
    } catch {
      // 表不存在或列已存在，忽略
    }
  }

  private async addIndexIfNotExists(table: string, indexName: string, column: string): Promise<void> {
    try {
      await this.env.DB.prepare(
        `CREATE INDEX IF NOT EXISTS ${indexName} ON ${table}(${column})`
      ).run();
    } catch {
      // 表不存在或索引已存在，忽略
    }
  }
}
