CREATE TABLE IF NOT EXISTS push_execution_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  push_history_id TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  channels TEXT NOT NULL,
  channel_results TEXT NOT NULL DEFAULT '[]',
  error_message TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_execution_logs_user_id ON push_execution_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_push_execution_logs_push_history_id ON push_execution_logs(push_history_id);
CREATE INDEX IF NOT EXISTS idx_push_execution_logs_created_at ON push_execution_logs(created_at);
