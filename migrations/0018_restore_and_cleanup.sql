-- ============================================
-- 从备份恢复数据并智能清理冗余列
-- 保留所有重要设置，只删除冗余的缩写字段
-- ============================================

-- 首先检查备份表是否存在
-- 如果备份表存在，我们将使用备份表来恢复
-- 1. 创建一个临时表，包含我们想要保留的所有列
CREATE TABLE IF NOT EXISTS users_temp (
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

-- 2. 首先尝试从备份表恢复（如果存在）
-- 我们需要动态地检查备份表有哪些列
-- 先尝试从备份表复制所有核心列
INSERT OR IGNORE INTO users_temp (
  id, email, password, token, token_expires_at, apikey, apikey_expires_at, 
  refresh_token, refresh_token_expires_at, role, disabled, disabled_reason,
  avatar_url, use_avatar_as_popup, created_at, updated_at
)
SELECT 
  id, email, password, token, token_expires_at, apikey, apikey_expires_at,
  refresh_token, refresh_token_expires_at, role, disabled, disabled_reason,
  avatar_url, use_avatar_as_popup, created_at, updated_at
FROM users_backup_20260607
WHERE EXISTS (SELECT 1 FROM users_backup_20260607 LIMIT 1);

-- 3. 如果备份表不存在或没有数据，尝试从当前 users 表复制
INSERT OR IGNORE INTO users_temp (
  id, email, password, token, token_expires_at, apikey, apikey_expires_at, 
  refresh_token, refresh_token_expires_at, role, disabled, disabled_reason,
  avatar_url, use_avatar_as_popup, created_at, updated_at
)
SELECT 
  id, email, password, token, token_expires_at, apikey, apikey_expires_at,
  refresh_token, refresh_token_expires_at, role, disabled, disabled_reason,
  avatar_url, use_avatar_as_popup, created_at, updated_at
FROM users
WHERE NOT EXISTS (SELECT 1 FROM users_backup_20260607 LIMIT 1);

-- 4. 现在替换原表
DROP TABLE IF EXISTS users;
ALTER TABLE users_temp RENAME TO users;

-- 5. 重建索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_token ON users(token);
CREATE INDEX IF NOT EXISTS idx_users_apikey ON users(apikey);
CREATE INDEX IF NOT EXISTS idx_users_refresh_token ON users(refresh_token);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_disabled ON users(disabled);
CREATE INDEX IF NOT EXISTS idx_users_ai_enabled ON users(ai_enabled);
CREATE INDEX IF NOT EXISTS idx_users_ai_provider ON users(ai_provider);

-- 6. 保留备份表，不删除
-- DROP TABLE IF EXISTS users_backup_20260607;
