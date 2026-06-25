-- 推送收藏夹表
CREATE TABLE IF NOT EXISTS push_favorites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  url TEXT,
  channels TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_favorites_user_id ON push_favorites(user_id);

-- 推送历史撤销状态
ALTER TABLE push_history ADD COLUMN revoked_at TEXT;
