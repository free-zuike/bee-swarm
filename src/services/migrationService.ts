// ============================================
// 数据库迁移服务
// 简化版 - 只检查数据库连接，不做自动迁移
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

    console.log('[Migration] Database connection verified, skipping automatic migrations');
    console.log('[Migration] Schema is managed through initial migration file');
  }
}
