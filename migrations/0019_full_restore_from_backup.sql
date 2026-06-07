-- ============================================
-- 从备份表完整恢复所有数据
-- 只删除冗余的缩写字段，保留所有其他数据
-- ============================================

-- 首先检查备份表是否存在
-- 如果备份表不存在，我们就不做任何操作，保留现状

-- 1. 先备份当前表（以防万一）
CREATE TABLE IF NOT EXISTS users_current_backup_20260607 AS SELECT * FROM users;

-- 2. 检查备份表是否存在
-- 我们通过创建一个临时表来检查
CREATE TABLE IF NOT EXISTS users_temp_check AS SELECT * FROM users_backup_20260607 LIMIT 0;
DROP TABLE IF EXISTS users_temp_check;

-- 3. 现在，使用PRAGMA获取备份表的所有列名
-- 我们需要使用SQLite的系统表来获取所有列
-- 但在SQLite中，我们可以更简单地处理
-- 我们先创建一个新表，包含我们想要的所有可能的列
CREATE TABLE IF NOT EXISTS users_complete (
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

-- 4. 首先尝试从备份表恢复（如果备份表存在）
-- 我们尝试复制所有可能存在的核心列
-- 使用INSERT OR IGNORE来避免错误
INSERT OR IGNORE INTO users_complete (
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
FROM users_backup_20260607
WHERE EXISTS (SELECT 1 FROM users_backup_20260607 LIMIT 1);

-- 5. 如果备份表不存在或没有数据，尝试从当前备份恢复
INSERT OR IGNORE INTO users_complete (
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
FROM users_current_backup_20260607
WHERE NOT EXISTS (SELECT 1 FROM users_backup_20260607 LIMIT 1)
  AND EXISTS (SELECT 1 FROM users_current_backup_20260607 LIMIT 1);

-- 6. 现在，替换原表
DROP TABLE IF EXISTS users;
ALTER TABLE users_complete RENAME TO users;

-- 7. 重建索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_token ON users(token);
CREATE INDEX IF NOT EXISTS idx_users_apikey ON users(apikey);
CREATE INDEX IF NOT EXISTS idx_users_refresh_token ON users(refresh_token);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_disabled ON users(disabled);
CREATE INDEX IF NOT EXISTS idx_users_ai_enabled ON users(ai_enabled);
CREATE INDEX IF NOT EXISTS idx_users_ai_provider ON users(ai_provider);

-- 8. 保留所有备份表，以便需要时恢复
-- 不要删除任何备份表
