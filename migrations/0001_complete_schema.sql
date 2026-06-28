-- ============================================
-- 蜂群完整数据库 Schema
-- 整合所有表和列，首次部署时一次性创建
-- ============================================

-- 用户表
CREATE TABLE IF NOT EXISTS users (
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
  cache_ttl_scheduled INTEGER,
  ai_enabled INTEGER DEFAULT 1,
  ai_provider TEXT DEFAULT 'workers-ai',
  ai_model TEXT DEFAULT 'workers-ai',
  ai_api_key TEXT,
  ai_api_url TEXT,
  ai_model_name TEXT,
  password_reset_token TEXT,
  password_reset_expires_at INTEGER,
  email_verified INTEGER DEFAULT 0,
  verification_code TEXT,
  verification_expires_at INTEGER,
  totp_secret TEXT,
  totp_enabled INTEGER DEFAULT 0,
  allowed_ips TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_token ON users(token);
CREATE INDEX IF NOT EXISTS idx_users_apikey ON users(apikey);
CREATE INDEX IF NOT EXISTS idx_users_refresh_token ON users(refresh_token);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_disabled ON users(disabled);
CREATE INDEX IF NOT EXISTS idx_users_ai_enabled ON users(ai_enabled);
CREATE INDEX IF NOT EXISTS idx_users_ai_provider ON users(ai_provider);

-- 渠道配置表
CREATE TABLE IF NOT EXISTS channel_configs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  config TEXT NOT NULL,
  enabled INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, channel_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_configs_user_id ON channel_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_configs_channel_id ON channel_configs(channel_id);

-- 推送模板表
CREATE TABLE IF NOT EXISTS push_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  title TEXT,
  body TEXT,
  url TEXT,
  image_url TEXT,
  markdown TEXT,
  channels TEXT,
  category TEXT,
  variables TEXT,
  is_public INTEGER DEFAULT 0,
  downloads INTEGER DEFAULT 0,
  author TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_templates_user_id ON push_templates(user_id);

-- 定时任务表
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
  channels TEXT,
  enabled INTEGER DEFAULT 1,
  overdue_reminder_sent INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  recurring_type TEXT,
  selected_week_days TEXT,
  selected_month_days TEXT,
  yearly_dates TEXT,
  timezone TEXT DEFAULT 'Asia/Shanghai',
  ab_test_enabled INTEGER DEFAULT 0,
  ab_test_variants TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scheduled_pushes_user_id ON scheduled_pushes(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_pushes_next_run ON scheduled_pushes(next_run);

-- 频道分组表
CREATE TABLE IF NOT EXISTS channel_groups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  channels TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_channel_groups_user_id ON channel_groups(user_id);

-- 推送历史表
CREATE TABLE IF NOT EXISTS push_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  body TEXT,
  url TEXT,
  image_url TEXT,
  markdown INTEGER DEFAULT 0,
  channels TEXT,
  results TEXT,
  status TEXT,
  delivered_at TEXT,
  read_at TEXT,
  clicked_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_history_user_id ON push_history(user_id);
CREATE INDEX IF NOT EXISTS idx_push_history_created_at ON push_history(created_at);
CREATE INDEX IF NOT EXISTS idx_push_history_status ON push_history(status);

-- 审计日志表
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  data TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- 指标统计表
CREATE TABLE IF NOT EXISTS metrics (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  total INTEGER DEFAULT 0,
  success INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  avg_latency INTEGER DEFAULT 0,
  channel_stats TEXT,
  daily_stats TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_metrics_user_id ON metrics(user_id);

-- 定时任务锁表
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

-- 备份运行记录表
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

-- 备份端点配置表
CREATE TABLE IF NOT EXISTS backup_endpoints (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  config TEXT NOT NULL,
  enabled INTEGER DEFAULT 0,
  name TEXT DEFAULT '默认备份',
  schedule TEXT DEFAULT '{"enabled":false,"interval":24,"startTime":"02:00"}',
  retention INTEGER DEFAULT 30,
  last_backup TEXT,
  r2_domain TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_backup_endpoints_user_id ON backup_endpoints(user_id);

-- 推送草稿箱表
CREATE TABLE IF NOT EXISTS push_drafts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  url TEXT,
  channels TEXT DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_drafts_user_id ON push_drafts(user_id);

-- 推送收藏夹表
CREATE TABLE IF NOT EXISTS push_favorites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  url TEXT,
  channels TEXT DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_favorites_user_id ON push_favorites(user_id);

-- 推送执行日志表
CREATE TABLE IF NOT EXISTS push_execution_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  push_history_id TEXT,
  started_at TEXT,
  finished_at TEXT,
  status TEXT DEFAULT 'running',
  channels TEXT,
  channel_results TEXT DEFAULT '[]',
  error_message TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_execution_logs_user_id ON push_execution_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_push_execution_logs_push_history_id ON push_execution_logs(push_history_id);
CREATE INDEX IF NOT EXISTS idx_push_execution_logs_created_at ON push_execution_logs(created_at);
