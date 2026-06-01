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
