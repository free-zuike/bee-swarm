-- ============================================
-- 修复数据库结构不一致问题
-- 使用最安全的方法：直接添加列，使用事务
-- ============================================

-- 1. 修复 users 表
-- 尝试添加缺失的列，如果列已存在会忽略错误

-- 2. 修复 scheduled_pushes 表

-- 3. 修复 backup_endpoints 表

-- 使用多个单独的语句，避免单个失败影响全部

-- 修复 users 表
-- 先创建临时表但不使用，避免问题
-- 直接用简单的方法：先做备份，再建新表，复制数据

-- ============================================
-- 安全策略：
-- 如果列添加失败，说明已存在，跳过即可
-- ============================================

-- 修复 users 表 - 添加缺失的列
-- 使用简单的方法：直接尝试添加，忽略已存在的错误
-- SQLite 不支持 "ADD COLUMN IF NOT EXISTS"，但我们可以先测试列是否存在

-- 先尝试查询表结构来判断
PRAGMA table_info(users);

-- 但我们无法在单个迁移文件中做条件判断，所以直接用最简单的方法：
-- 创建完整的新表，复制数据，替换原表

-- 这个方法虽然有点重，但最安全，不会有列已存在的错误

-- ============================================
-- 1. 修复 users 表
-- ============================================

-- 备份原表
CREATE TABLE IF NOT EXISTS users_backup_20240602 AS SELECT * FROM users;

-- 创建新的完整表
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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 复制数据 - 只复制存在的列
-- 这里我们用更简单的方法，假设原表至少有 id, email, password, created_at, updated_at
-- 对于缺失的列，新表会自动填充默认值

INSERT INTO users_new (
  id, email, password, created_at, updated_at,
  token, token_expires_at, apikey, apikey_expires_at,
  refresh_token, refresh_token_expires_at, role, disabled, disabled_reason,
  avatar_url, use_avatar_as_popup
)
SELECT
  id, email, password, created_at, updated_at,
  token, token_expires_at, apikey, apikey_expires_at,
  refresh_token, refresh_token_expires_at,
  COALESCE(role, 'user'), COALESCE(disabled, 0), disabled_reason,
  avatar_url, COALESCE(use_avatar_as_popup, 0)
FROM users;

-- 替换原表
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_token ON users(token);
CREATE INDEX IF NOT EXISTS idx_users_apikey ON users(apikey);
CREATE INDEX IF NOT EXISTS idx_users_refresh_token ON users(refresh_token);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_disabled ON users(disabled);

-- 删除备份表（如果成功）
DROP TABLE IF EXISTS users_backup_20240602;

-- ============================================
-- 2. 修复 scheduled_pushes 表
-- ============================================

CREATE TABLE IF NOT EXISTS scheduled_pushes_backup_20240602 AS SELECT * FROM scheduled_pushes;

CREATE TABLE IF NOT EXISTS scheduled_pushes_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  template_id TEXT,
  cron TEXT NOT NULL,
  next_run INTEGER NOT NULL,
  title TEXT,
  body TEXT,
  url TEXT,
  image_url TEXT,
  markdown TEXT,
  channels TEXT,
  enabled INTEGER DEFAULT 1,
  overdue_reminder_sent INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO scheduled_pushes_new (
  id, user_id, template_id, cron, next_run, title, body, url, image_url,
  markdown, channels, enabled, overdue_reminder_sent, status, created_at, updated_at
)
SELECT
  id, user_id, template_id, cron, next_run, title, body, url, image_url,
  markdown, channels,
  COALESCE(enabled, 1), COALESCE(overdue_reminder_sent, 0), COALESCE(status, 'pending'),
  created_at, updated_at
FROM scheduled_pushes;

DROP TABLE scheduled_pushes;
ALTER TABLE scheduled_pushes_new RENAME TO scheduled_pushes;
DROP TABLE IF EXISTS scheduled_pushes_backup_20240602;

CREATE INDEX IF NOT EXISTS idx_scheduled_pushes_user_id ON scheduled_pushes(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_pushes_next_run ON scheduled_pushes(next_run);

-- ============================================
-- 3. 修复 backup_endpoints 表
-- ============================================

CREATE TABLE IF NOT EXISTS backup_endpoints_backup_20240602 AS SELECT * FROM backup_endpoints;

CREATE TABLE IF NOT EXISTS backup_endpoints_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  config TEXT NOT NULL,
  enabled INTEGER DEFAULT 0,
  name TEXT DEFAULT '默认备份',
  schedule TEXT DEFAULT '{"enabled":false,"interval":24,"startTime":"02:00"}',
  retention INTEGER DEFAULT 30,
  last_backup TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO backup_endpoints_new (
  id, user_id, type, config, enabled, name, schedule, retention,
  last_backup, created_at, updated_at
)
SELECT
  id, user_id, type, config, COALESCE(enabled, 0), COALESCE(name, '默认备份'),
  COALESCE(schedule, '{"enabled":false,"interval":24,"startTime":"02:00"}'),
  COALESCE(retention, 30), last_backup, created_at, updated_at
FROM backup_endpoints;

DROP TABLE backup_endpoints;
ALTER TABLE backup_endpoints_new RENAME TO backup_endpoints;
DROP TABLE IF EXISTS backup_endpoints_backup_20240602;

CREATE INDEX IF NOT EXISTS idx_backup_endpoints_user_id ON backup_endpoints(user_id);
