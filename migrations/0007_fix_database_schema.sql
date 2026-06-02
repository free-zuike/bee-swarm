-- ============================================
-- 修复数据库结构不一致问题
-- 此迁移用于修复已存在的数据库表结构
-- ============================================

-- 首先删除可能存在的临时表
DROP TABLE IF EXISTS d1_migrations_temp;
DROP TABLE IF EXISTS scheduled_pushes_new;
DROP TABLE IF EXISTS users_new;
DROP TABLE IF EXISTS backup_endpoints_new;

-- ============================================
-- 修复 scheduled_pushes 表
-- ============================================

CREATE TABLE IF NOT EXISTS scheduled_pushes_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  template_id TEXT,
  cron TEXT NOT NULL,
  next_run INTEGER NOT NULL DEFAULT 0,
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

-- 复制数据（如果原表存在）
INSERT INTO scheduled_pushes_new (
  id, user_id, template_id, cron, next_run, title, body, url, image_url, 
  markdown, channels, enabled, overdue_reminder_sent, status, created_at, updated_at
) SELECT 
  id, user_id, template_id, cron, COALESCE(next_run, 0), title, body, url, image_url, 
  markdown, channels, COALESCE(enabled, 1), COALESCE(overdue_reminder_sent, 0), 
  COALESCE(status, 'pending'), created_at, updated_at 
FROM scheduled_pushes;

-- 删除旧表并重命名新表
DROP TABLE IF EXISTS scheduled_pushes;
ALTER TABLE scheduled_pushes_new RENAME TO scheduled_pushes;

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_scheduled_pushes_user_id ON scheduled_pushes(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_pushes_next_run ON scheduled_pushes(next_run);

-- ============================================
-- 修复 users 表
-- ============================================

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

INSERT INTO users_new (
  id, email, password, token, token_expires_at, apikey, apikey_expires_at, 
  refresh_token, refresh_token_expires_at, role, disabled, disabled_reason, 
  avatar_url, use_avatar_as_popup, created_at, updated_at
) SELECT 
  id, email, password, token, token_expires_at, apikey, apikey_expires_at, 
  refresh_token, refresh_token_expires_at, COALESCE(role, 'user'), 
  COALESCE(disabled, 0), disabled_reason, avatar_url, 
  COALESCE(use_avatar_as_popup, 0), created_at, updated_at 
FROM users;

DROP TABLE IF EXISTS users;
ALTER TABLE users_new RENAME TO users;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_token ON users(token);
CREATE INDEX IF NOT EXISTS idx_users_apikey ON users(apikey);
CREATE INDEX IF NOT EXISTS idx_users_refresh_token ON users(refresh_token);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_disabled ON users(disabled);

-- ============================================
-- 修复 backup_endpoints 表
-- ============================================

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
) SELECT 
  id, user_id, type, config, COALESCE(enabled, 0), COALESCE(name, '默认备份'), 
  COALESCE(schedule, '{"enabled":false,"interval":24,"startTime":"02:00"}'), 
  COALESCE(retention, 30), last_backup, created_at, updated_at 
FROM backup_endpoints;

DROP TABLE IF EXISTS backup_endpoints;
ALTER TABLE backup_endpoints_new RENAME TO backup_endpoints;

CREATE INDEX IF NOT EXISTS idx_backup_endpoints_user_id ON backup_endpoints(user_id);

-- ============================================
-- 修复 d1_migrations 表（安全地重新创建）
-- ============================================

-- 删除旧表并创建新表（不尝试恢复旧数据，避免列不匹配问题）
DROP TABLE IF EXISTS d1_migrations;
CREATE TABLE IF NOT EXISTS d1_migrations (
  version TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

-- ============================================
-- 标记之前的迁移已应用
-- ============================================

INSERT OR IGNORE INTO d1_migrations (version, created_at) VALUES ('0001_initial_tables.sql', datetime('now'));
INSERT OR IGNORE INTO d1_migrations (version, created_at) VALUES ('0002_add_user_refresh_token_fields.sql', datetime('now'));
INSERT OR IGNORE INTO d1_migrations (version, created_at) VALUES ('0003_add_overdue_reminder_field.sql', datetime('now'));
INSERT OR IGNORE INTO d1_migrations (version, created_at) VALUES ('0004_add_user_role_and_disabled.sql', datetime('now'));
INSERT OR IGNORE INTO d1_migrations (version, created_at) VALUES ('0005_add_backup_endpoints_missing_fields.sql', datetime('now'));
INSERT OR IGNORE INTO d1_migrations (version, created_at) VALUES ('0006_add_avatar_field.sql', datetime('now'));
