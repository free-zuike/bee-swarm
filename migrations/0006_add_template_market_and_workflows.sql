-- 推送模板市场字段
ALTER TABLE push_templates ADD COLUMN is_public INTEGER DEFAULT 0;
ALTER TABLE push_templates ADD COLUMN downloads INTEGER DEFAULT 0;
ALTER TABLE push_templates ADD COLUMN author TEXT;

-- 推送自动化工作流表
CREATE TABLE IF NOT EXISTS push_workflows (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  steps TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER DEFAULT 1,
  trigger_type TEXT DEFAULT 'manual',
  trigger_config TEXT DEFAULT '{}',
  last_run_at TEXT,
  last_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_workflows_user_id ON push_workflows(user_id);
