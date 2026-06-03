-- ============================================
-- 修复 metrics 表 - 添加 avg_latency 字段
-- ============================================

-- 备份原表
CREATE TABLE IF NOT EXISTS metrics_backup_20240603 AS SELECT * FROM metrics;

-- 创建新的表结构
CREATE TABLE IF NOT EXISTS metrics_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  total INTEGER DEFAULT 0,
  success INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  channel_stats TEXT,
  daily_stats TEXT,
  avg_latency INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 复制数据
INSERT INTO metrics_new (
  id, user_id, total, success, failed, channel_stats, daily_stats,
  avg_latency, created_at, updated_at
)
SELECT
  id,
  user_id,
  COALESCE(total, 0),
  COALESCE(success, 0),
  COALESCE(failed, 0),
  channel_stats,
  daily_stats,
  COALESCE(avg_latency, 0),
  created_at,
  updated_at
FROM metrics;

-- 替换原表
DROP TABLE metrics;
ALTER TABLE metrics_new RENAME TO metrics;

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_metrics_user_id ON metrics(user_id);

-- 删除备份表
DROP TABLE IF EXISTS metrics_backup_20240603;