-- ============================================
-- 删除冗余的缩写字段，只保留完整的字段名
-- 使用安全的方法：创建新表，复制数据，替换原表
-- ============================================

-- 1. 备份原表
CREATE TABLE IF NOT EXISTS users_backup_20260607 AS SELECT * FROM users;

-- 2. 创建新的 users 表，只包含我们需要的列
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
  cache_settings TEXT DEFAULT '{}',
  ai_settings TEXT DEFAULT '{}',
  cache_ttl_backup INTEGER,
  cache_ttl_channels INTEGER,
  cache_ttl_templates INTEGER,
  cache_ttl_groups INTEGER,
  cache_ttl_stats INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 3. 复制数据到新表（只复制确定存在的核心列）
INSERT INTO users_new (
  id, email, password, token, token_expires_at, apikey, apikey_expires_at,
  refresh_token, refresh_token_expires_at, role, disabled, disabled_reason,
  avatar_url, use_avatar_as_popup, cache_settings, ai_settings,
  created_at, updated_at
)
SELECT
  id, email, password, token, token_expires_at, apikey, apikey_expires_at,
  refresh_token, refresh_token_expires_at, COALESCE(role, 'user'),
  COALESCE(disabled, 0), disabled_reason, avatar_url,
  COALESCE(use_avatar_as_popup, 0),
  COALESCE(cache_settings, '{}'), COALESCE(ai_settings, '{}'),
  created_at, updated_at
FROM users;

-- 4. 替换原表
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- 5. 重新创建索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_token ON users(token);
CREATE INDEX IF NOT EXISTS idx_users_apikey ON users(apikey);
CREATE INDEX IF NOT EXISTS idx_users_refresh_token ON users(refresh_token);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_disabled ON users(disabled);

-- 6. 备份表保留，以便需要时恢复（可以手动删除）
-- DROP TABLE IF EXISTS users_backup_20260607;
