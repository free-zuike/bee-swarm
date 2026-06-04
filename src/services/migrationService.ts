// ============================================
// 数据库迁移服务
// 自动检测并执行数据库结构更新
// ============================================
import type { Env } from '../types';

export class MigrationService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  async runMigrations(): Promise<void> {
    if (!this.env.DB) {
      console.warn('[Migration] D1 database not configured, skipping migrations');
      return;
    }

    await this.migrationAddCacheAndAISettings();
  }

  private async migrationAddCacheAndAISettings(): Promise<void> {
    try {
      // 检查 users 表的列
      const result = await this.env.DB.prepare('PRAGMA table_info(users)').all<{
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: string;
        pk: number;
      }>();

      const columns = result.results.map((col) => col.name);

      // 如果已经有 cache_settings 和 ai_settings 列，跳过
      if (columns.includes('cache_settings') && columns.includes('ai_settings')) {
        console.log('[Migration] users table already has cache_settings and ai_settings columns');
        return;
      }

      console.log('[Migration] Adding cache_settings and ai_settings columns to users table');

      // 添加 cache_settings 列
      if (!columns.includes('cache_settings')) {
        await this.env.DB.prepare("ALTER TABLE users ADD COLUMN cache_settings TEXT DEFAULT '{}'").run();
      }

      // 添加 ai_settings 列
      if (!columns.includes('ai_settings')) {
        await this.env.DB.prepare("ALTER TABLE users ADD COLUMN ai_settings TEXT DEFAULT '{}'").run();
      }

      console.log('[Migration] Successfully added cache_settings and ai_settings columns');
    } catch (error) {
      console.error('[Migration] Failed to add cache_settings and ai_settings columns:', error);
    }
  }
}
