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
}
