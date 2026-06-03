-- ============================================
-- 添加用户设置字段
-- ============================================

-- 备份原表
CREATE TABLE IF NOT EXISTS users_backup_20240603 AS SELECT * FROM users;

-- 创建新的完整表结构
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
  settings TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 复制数据 - 只复制原表中存在的列
INSERT INTO users_new (
  id, email, password, token, token_expires_at, refresh_token, refresh_token_expires_at,
  apikey, apikey_expires_at, role, disabled, disabled_reason, avatar_url, use_avatar_as_popup,
  created_at, updated_at
)
SELECT
  id, email, password, token, token_expires_at, refresh_token, refresh_token_expires_at,
  apikey, apikey_expires_at, role, disabled, disabled_reason, avatar_url, use_avatar_as_popup,
  created_at, updated_at
FROM users;

-- 替换原表
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- 删除备份表
DROP TABLE IF EXISTS users_backup_20240603;

-- 重建索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);