-- ============================================
-- 修复 metrics 表 - 添加缺失的 avg_latency 字段
-- ============================================

-- 备份原表
CREATE TABLE IF NOT EXISTS metrics_backup_20240603 AS SELECT * FROM metrics;

-- 创建新的完整表结构
CREATE TABLE IF NOT EXISTS metrics_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  total INTEGER DEFAULT 0,
  success INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  channel_stats TEXT DEFAULT '{}',
  daily_stats TEXT DEFAULT '{}',
  avg_latency INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 复制数据 - 只复制原表中存在的列
INSERT INTO metrics_new (
  id, user_id, total, success, failed, channel_stats, daily_stats, created_at, updated_at
)
SELECT
  id, user_id, total, success, failed, channel_stats, daily_stats, created_at, updated_at
FROM metrics;

-- 替换原表
DROP TABLE metrics;
ALTER TABLE metrics_new RENAME TO metrics;

-- 删除备份表
DROP TABLE IF EXISTS metrics_backup_20240603;
