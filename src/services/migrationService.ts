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

    await this.migration0013AddUserSettings();
  }

  private async migration0013AddUserSettings(): Promise<void> {
    try {
      // 检查 users 表是否已经有 settings 列
      const result = await this.env.DB.prepare(
        "PRAGMA table_info(users)"
      ).all<{ cid: number; name: string; type: string; notnull: number; dflt_value: string; pk: number }>();

      const hasSettingsColumn = result.results.some((col) => col.name === 'settings');

      if (hasSettingsColumn) {
        console.log('[Migration] users table already has settings column');
        return;
      }

      console.log('[Migration] Adding settings column to users table');

      // 添加 settings 列
      await this.env.DB.prepare(
        'ALTER TABLE users ADD COLUMN settings TEXT DEFAULT \'{}\''
      ).run();

      console.log('[Migration] Successfully added settings column');
    } catch (error) {
      console.error('[Migration] Failed to add settings column:', error);
    }
  }
}
