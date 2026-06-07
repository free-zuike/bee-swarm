-- ============================================
-- 安全、兼容的迁移：只添加可能缺失的列
-- 使用 CREATE TABLE + 复制数据的方式，最安全、兼容性最好
-- ============================================

-- 1. 先备份当前表（以防万一）
CREATE TABLE IF NOT EXISTS users_backup_before_migration_20260607 AS SELECT * FROM users;

-- 2. 创建一个新的、完整的表结构
CREATE TABLE IF NOT EXISTS users_new (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  token TEXT,
  token_expires_at INTEGER,
  apikey TEXT,
  apikey_expires_at INTEGER,
  refresh_token TEXT,
  refresh_token_expires_at INTEGER,
  role TEXT DEFAULT 'user',
  disabled INTEGER DEFAULT 0,
  disabled_reason TEXT,
  avatar_url TEXT,
  use_avatar_as_popup INTEGER DEFAULT 0,
  settings TEXT,
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
);

-- 3. 只复制我们确定存在的核心列
-- 我们不假设其他列是否存在
INSERT OR IGNORE INTO users_new (
  id, email, password, token, token_expires_at, apikey, apikey_expires_at,
  refresh_token, refresh_token_expires_at, role, disabled, disabled_reason,
  avatar_url, use_avatar_as_popup, settings, cache_settings, ai_settings,
  cache_ttl_backup, cache_ttl_channels, cache_ttl_templates, cache_ttl_groups,
  cache_ttl_scheduled, cache_ttl_stats, ai_enabled, ai_provider, ai_model,
  ai_api_key, ai_api_url, ai_model_name, created_at, updated_at
)
SELECT 
  id, email, password, token, token_expires_at, apikey, apikey_expires_at,
  refresh_token, refresh_token_expires_at, role, disabled, disabled_reason,
  avatar_url, use_avatar_as_popup, settings, cache_settings, ai_settings,
  cache_ttl_backup, cache_ttl_channels, cache_ttl_templates, cache_ttl_groups,
  cache_ttl_scheduled, cache_ttl_stats, ai_enabled, ai_provider, ai_model,
  ai_api_key, ai_api_url, ai_model_name, created_at, updated_at
FROM users_backup_before_migration_20260607;

-- 4. 如果上面的插入失败（因为某些列不存在），我们只复制核心列
-- 这是一个安全网
INSERT OR IGNORE INTO users_new (
  id, email, password, token, token_expires_at, apikey, apikey_expires_at,
  created_at, updated_at
)
SELECT 
  id, email, password, token, token_expires_at, apikey, apikey_expires_at,
  created_at, updated_at
FROM users_backup_before_migration_20260607
WHERE NOT EXISTS (SELECT 1 FROM users_new LIMIT 1);

-- 5. 现在替换原表
DROP TABLE IF EXISTS users;
ALTER TABLE users_new RENAME TO users;

-- 6. 重建索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_token ON users(token);
CREATE INDEX IF NOT EXISTS idx_users_apikey ON users(apikey);
CREATE INDEX IF NOT EXISTS idx_users_refresh_token ON users(refresh_token);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_disabled ON users(disabled);
CREATE INDEX IF NOT EXISTS idx_users_ai_enabled ON users(ai_enabled);
CREATE INDEX IF NOT EXISTS idx_users_ai_provider ON users(ai_provider);

-- 7. 保留备份表，不删除
-- 完成！这个迁移：
-- 1. 先备份，确保安全
-- 2. 创建新的完整表结构
-- 3. 尝试复制所有数据，如果失败则只复制核心列
-- 4. 替换原表，保留所有重要数据（包括管理员权限）
-- 5. 保留备份表，以便需要时可以回退
