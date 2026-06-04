-- ============================================
-- 删除旧的settings字段（已被cache_settings和ai_settings替代）
-- ============================================

-- 备份当前表
CREATE TABLE IF NOT EXISTS users_backup_20240604_remove AS SELECT * FROM users;

-- 创建新表，不含旧的settings字段
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
  cache_settings TEXT DEFAULT '{}', -- 缓存设置
  ai_settings TEXT DEFAULT '{}', -- AI设置
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 复制数据（跳过旧的settings字段）
INSERT INTO users_new (
  id, email, password, token, token_expires_at, refresh_token, refresh_token_expires_at,
  apikey, apikey_expires_at, role, disabled, disabled_reason, avatar_url, use_avatar_as_popup,
  cache_settings, ai_settings, created_at, updated_at
)
SELECT
  id, email, password, token, token_expires_at, refresh_token, refresh_token_expires_at,
  apikey, apikey_expires_at, role, disabled, disabled_reason, avatar_url, use_avatar_as_popup,
  cache_settings, ai_settings, created_at, updated_at
FROM users;

-- 替换原表
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- 删除备份表
DROP TABLE IF EXISTS users_backup_20240604_remove;

-- 重建索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
