-- ============================================
-- 删除冗余的缩写字段，只保留完整的字段名
-- 使用安全的方法：创建新表，复制核心数据，替换原表
-- 只包含确定存在的核心列
-- ============================================

-- 1. 备份原表
CREATE TABLE IF NOT EXISTS users_backup_20260607 AS SELECT * FROM users;

-- 2. 创建新的 users 表，只包含最初定义的核心列
CREATE TABLE IF NOT EXISTS users_new (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  token TEXT,
  token_expires_at INTEGER,
  apikey TEXT,
  apikey_expires_at INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 3. 只复制绝对存在的核心列
INSERT INTO users_new (
  id, email, password, token, token_expires_at, apikey, apikey_expires_at, created_at, updated_at
)
SELECT
  id, email, password, token, token_expires_at, apikey, apikey_expires_at, created_at, updated_at
FROM users;

-- 4. 替换原表
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- 5. 重新创建核心索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_token ON users(token);
CREATE INDEX IF NOT EXISTS idx_users_apikey ON users(apikey);

-- 6. 备份表保留，以便需要时恢复（可以手动删除）
-- DROP TABLE IF EXISTS users_backup_20260607;
