-- ============================================
-- 修复 metrics 表 - 添加缺失的 avg_latency 字段
-- 使用 ALTER TABLE ADD COLUMN（如果列已存在会报错但可以忽略）
-- ============================================

-- 添加 avg_latency 列（如果已存在则忽略）
ALTER TABLE metrics ADD COLUMN avg_latency INTEGER DEFAULT 0;