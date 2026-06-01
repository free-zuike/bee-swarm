-- ============================================
-- 用户表
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL, -- PBKDF2 哈希值
  token TEXT, -- 访问 Token
  token_expires_at INTEGER, -- Token 过期时间 (ms)
  apikey TEXT, -- API Key
  apikey_expires_at INTEGER, -- API Key 过期时间 (ms)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_token ON users(token);
CREATE INDEX IF NOT EXISTS idx_users_apikey ON users(apikey);

-- ============================================
-- 渠道配置表
-- ============================================
CREATE TABLE IF NOT EXISTS channel_configs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  config TEXT NOT NULL, -- JSON
  enabled INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_configs_user_id ON channel_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_configs_channel_id ON channel_configs(channel_id);

-- ============================================
-- 推送模板表
-- ============================================
CREATE TABLE IF NOT EXISTS push_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  title TEXT,
  body TEXT,
  url TEXT,
  image_url TEXT,
  markdown TEXT,
  channels TEXT, -- JSON 数组
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_templates_user_id ON push_templates(user_id);

-- ============================================
-- 定时任务表
-- ============================================
CREATE TABLE IF NOT EXISTS scheduled_pushes (
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
  channels TEXT, -- JSON 数组
  enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scheduled_pushes_user_id ON scheduled_pushes(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_pushes_next_run ON scheduled_pushes(next_run);

-- ============================================
-- 频道分组表
-- ============================================
CREATE TABLE IF NOT EXISTS channel_groups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  channels TEXT NOT NULL, -- JSON 数组
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_channel_groups_user_id ON channel_groups(user_id);

-- ============================================
-- 推送历史表
-- ============================================
CREATE TABLE IF NOT EXISTS push_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  channel_type TEXT,
  channel_name TEXT,
  title TEXT,
  content TEXT,
  url TEXT,
  image_url TEXT,
  markdown TEXT,
  success INTEGER NOT NULL,
  error TEXT,
  latency_ms INTEGER,
  timestamp TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_history_user_id ON push_history(user_id);
CREATE INDEX IF NOT EXISTS idx_push_history_timestamp ON push_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_push_history_success ON push_history(success);

-- ============================================
-- 审计日志表
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  data TEXT, -- JSON
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- ============================================
-- 指标统计表
-- ============================================
CREATE TABLE IF NOT EXISTS metrics (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  total INTEGER DEFAULT 0,
  success INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  channel_stats TEXT, -- JSON
  daily_stats TEXT, -- JSON
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_metrics_user_id ON metrics(user_id);

-- ============================================
-- 定时任务锁表
-- ============================================
CREATE TABLE IF NOT EXISTS scheduled_locks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  push_id TEXT NOT NULL,
  executed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, push_id)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_locks_user_id ON scheduled_locks(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_locks_push_id ON scheduled_locks(push_id);

-- ============================================
-- 备份运行记录表
-- ============================================
CREATE TABLE IF NOT EXISTS backup_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint_id TEXT NOT NULL,
  last_run INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, endpoint_id)
);

CREATE INDEX IF NOT EXISTS idx_backup_runs_user_id ON backup_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_backup_runs_endpoint_id ON backup_runs(endpoint_id);

-- ============================================
-- 备份端点配置表
-- ============================================
CREATE TABLE IF NOT EXISTS backup_endpoints (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL, -- s3 或 webdav
  config TEXT NOT NULL, -- JSON
  enabled INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_backup_endpoints_user_id ON backup_endpoints(user_id);
