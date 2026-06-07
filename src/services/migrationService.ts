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

    await this.migrationSplitAndRemoveSettings();
    await this.migrationRemoveDuplicateCacheColumns();
  }

  private async migrationRemoveDuplicateCacheColumns(): Promise<void> {
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
      const hasAbbrevColumns = 
        columns.includes('cache_ttl_b') || 
        columns.includes('cache_ttl_c') || 
        columns.includes('cache_ttl_t') || 
        columns.includes('cache_ttl_g') || 
        columns.includes('cache_ttl_s');

      if (!hasAbbrevColumns) {
        console.log('[Migration] No duplicate cache columns to remove');
        return;
      }

      console.log('[Migration] Removing duplicate cache columns (abbreviations)');

      // 1. 备份数据
      await this.env.DB.prepare(
        'CREATE TABLE IF NOT EXISTS users_backup_20260607_auto AS SELECT * FROM users'
      ).run();

      // 2. 创建新表结构（不含冗余的缩写字段，包含所有需要的列）
      await this.env.DB.prepare(
        `
        CREATE TABLE IF NOT EXISTS users_new (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          token TEXT,
          token_expires_at INTEGER,
          refresh_token TEXT,
          refresh_token_expires_at INTEGER,
          apikey TEXT,
          apikey_expires_at INTEGER,
          role TEXT DEFAULT 'user',
          disabled INTEGER DEFAULT 0,
          disabled_reason TEXT,
          avatar_url TEXT,
          use_avatar_as_popup INTEGER DEFAULT 0,
          cache_settings TEXT DEFAULT '{}',
          ai_settings TEXT DEFAULT '{}',
          cache_ttl_backup INTEGER,
          cache_ttl_channels INTEGER,
          cache_ttl_templates INTEGER,
          cache_ttl_groups INTEGER,
          cache_ttl_scheduled INTEGER,
          cache_ttl_stats INTEGER,
          ai_enabled INTEGER DEFAULT 1,
          ai_provider TEXT DEFAULT 'workers-ai',
          ai_model TEXT DEFAULT 'workers-ai',
          ai_api_key TEXT,
          ai_api_url TEXT,
          ai_model_name TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
        `
      ).run();

      // 3. 只复制核心列，避免引用不存在的列
      const coreColumns = [
        'id', 'email', 'password', 'token', 'token_expires_at', 'refresh_token', 
        'refresh_token_expires_at', 'apikey', 'apikey_expires_at', 'role', 'disabled', 
        'disabled_reason', 'avatar_url', 'use_avatar_as_popup', 'created_at', 'updated_at'
      ];

      const insertSql = `
        INSERT INTO users_new (${coreColumns.join(', ')})
        SELECT ${coreColumns.join(', ')}
        FROM users
      `;

      await this.env.DB.prepare(insertSql).run();

      // 4. 替换原表
      await this.env.DB.prepare('DROP TABLE users').run();
      await this.env.DB.prepare('ALTER TABLE users_new RENAME TO users').run();

      // 5. 重建索引
      await this.env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)').run();
      await this.env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_users_token ON users(token)').run();
      await this.env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_users_apikey ON users(apikey)').run();
      await this.env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_users_refresh_token ON users(refresh_token)').run();
      await this.env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)').run();
      await this.env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_users_disabled ON users(disabled)').run();
      await this.env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_users_ai_enabled ON users(ai_enabled)').run();
      await this.env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_users_ai_provider ON users(ai_provider)').run();

      // 6. 清理备份表
      await this.env.DB.prepare('DROP TABLE IF EXISTS users_backup_20260607_auto').run();

      console.log('[Migration] Successfully removed duplicate cache columns');
    } catch (error) {
      console.error('[Migration] Failed to remove duplicate cache columns:', error);
    }
  }

  private async migrationSplitAndRemoveSettings(): Promise<void> {
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
      const hasSettingsColumn = columns.includes('settings');
      const hasCacheSettings = columns.includes('cache_settings');
      const hasAiSettings = columns.includes('ai_settings');

      // 如果已经有新字段且没有旧的 settings 字段，跳过
      if (hasCacheSettings && hasAiSettings && !hasSettingsColumn) {
        console.log('[Migration] users table already has correct structure');
        return;
      }

      console.log('[Migration] Migrating users table to remove settings column');

      // 1. 备份数据
      await this.env.DB.prepare(
        'CREATE TABLE IF NOT EXISTS users_backup_20240604_auto AS SELECT * FROM users'
      ).run();

      // 2. 创建新表结构（不含旧的 settings 字段）
      await this.env.DB.prepare(
        `
        CREATE TABLE IF NOT EXISTS users_new (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          token TEXT,
          token_expires_at INTEGER,
          refresh_token TEXT,
          refresh_token_expires_at INTEGER,
          apikey TEXT,
          apikey_expires_at INTEGER,
          role TEXT DEFAULT 'user',
          disabled INTEGER DEFAULT 0,
          disabled_reason TEXT,
          avatar_url TEXT,
          use_avatar_as_popup INTEGER DEFAULT 0,
          cache_settings TEXT DEFAULT '{}',
          ai_settings TEXT DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `
      ).run();

      // 3. 复制数据并拆分 settings
      await this.env.DB.prepare(
        `
        INSERT INTO users_new (
          id, email, password, token, token_expires_at, refresh_token, refresh_token_expires_at,
          apikey, apikey_expires_at, role, disabled, disabled_reason, avatar_url, use_avatar_as_popup,
          cache_settings, ai_settings, created_at, updated_at
        )
        SELECT
          id, email, password, token, token_expires_at, refresh_token, refresh_token_expires_at,
          apikey, apikey_expires_at, role, disabled, disabled_reason, avatar_url, use_avatar_as_popup,
          COALESCE(
            CASE WHEN cache_settings IS NOT NULL AND cache_settings != '' AND cache_settings != '{}' THEN cache_settings END,
            CASE WHEN settings IS NOT NULL AND settings != '' THEN
              json_object(
                'cache_ttl_backup', json_extract(settings, '$.cache_ttl_backup'),
                'cache_ttl_channels', json_extract(settings, '$.cache_ttl_channels'),
                'cache_ttl_templates', json_extract(settings, '$.cache_ttl_templates'),
                'cache_ttl_groups', json_extract(settings, '$.cache_ttl_groups'),
                'cache_ttl_scheduled', json_extract(settings, '$.cache_ttl_scheduled')
              )
            END,
            '{}'
          ),
          COALESCE(
            CASE WHEN ai_settings IS NOT NULL AND ai_settings != '' AND ai_settings != '{}' THEN ai_settings END,
            CASE WHEN settings IS NOT NULL AND settings != '' THEN
              json_object(
                'ai_model', json_extract(settings, '$.ai_model'),
                'ai_enabled', json_extract(settings, '$.ai_enabled'),
                'ai_provider', json_extract(settings, '$.ai_provider'),
                'ai_api_key', json_extract(settings, '$.ai_api_key'),
                'ai_api_url', json_extract(settings, '$.ai_api_url'),
                'ai_model_name', json_extract(settings, '$.ai_model_name'),
                'custom_ai_providers', json_extract(settings, '$.custom_ai_providers'),
                'ai_provider_configs', json_extract(settings, '$.ai_provider_configs')
              )
            END,
            '{}'
          ),
          created_at, updated_at
        FROM users
      `
      ).run();

      // 4. 替换原表
      await this.env.DB.prepare('DROP TABLE users').run();
      await this.env.DB.prepare('ALTER TABLE users_new RENAME TO users').run();

      // 5. 清理备份表
      await this.env.DB.prepare('DROP TABLE IF EXISTS users_backup_20240604_auto').run();

      // 6. 重建索引
      await this.env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)').run();

      console.log('[Migration] Successfully migrated users table and removed settings column');
    } catch (error) {
      console.error('[Migration] Failed to migrate users table:', error);
    }
  }
}
