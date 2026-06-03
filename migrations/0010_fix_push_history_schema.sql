-- ============================================
-- 修复 push_history 表结构
-- 适配新的批量推送记录格式
-- ============================================

-- 备份原表
CREATE TABLE IF NOT EXISTS push_history_backup_20240603 AS SELECT * FROM push_history;

-- 创建新的表结构
CREATE TABLE IF NOT EXISTS push_history_new (
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
  created_at TEXT NOT NULL
);

-- 复制数据（对于旧数据，尝试转换）
-- 旧表字段：id, user_id, channel_id, channel_type, channel_name, title, content, url, image_url, markdown, success, error, latency_ms, timestamp, created_at
-- 新表字段：id, user_id, title, body, url, image_url, markdown, channels, results, status, created_at

INSERT INTO push_history_new (
  id, user_id, title, body, url, image_url, markdown, created_at
)
SELECT
  id,
  user_id,
  title,
  COALESCE(content, ''),
  url,
  image_url,
  CASE WHEN markdown THEN 1 ELSE 0 END,
  created_at
FROM push_history;

-- 替换原表
DROP TABLE push_history;
ALTER TABLE push_history_new RENAME TO push_history;

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_push_history_user_id ON push_history(user_id);
CREATE INDEX IF NOT EXISTS idx_push_history_created_at ON push_history(created_at);

-- 删除备份表
DROP TABLE IF EXISTS push_history_backup_20240603;