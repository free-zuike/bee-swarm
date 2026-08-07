-- ============================================
-- 多 API Key 管理表
-- 支持每个用户创建多个 API Key，分别设置有效期
-- ============================================

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'default',
  key TEXT NOT NULL UNIQUE,
  expires_at INTEGER,
  enabled INTEGER DEFAULT 1,
  last_used_at INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at);