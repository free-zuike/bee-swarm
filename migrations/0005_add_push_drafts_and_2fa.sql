-- 推送草稿箱表
CREATE TABLE IF NOT EXISTS push_drafts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT DEFAULT '',
  url TEXT,
  channels TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_drafts_user_id ON push_drafts(user_id);

-- 2FA 字段
ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0;
