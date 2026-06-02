-- ============================================
-- 添加备份端缺失的字段
-- ============================================

-- 先检查表是否已存在 name 字段
-- 如果没有则添加
ALTER TABLE backup_endpoints ADD COLUMN name TEXT;
UPDATE backup_endpoints SET name = '默认备份' WHERE name IS NULL;

-- 添加 schedule 字段
ALTER TABLE backup_endpoints ADD COLUMN schedule TEXT;
UPDATE backup_endpoints SET schedule = '{"enabled":false,"interval":24,"startTime":"02:00"}' WHERE schedule IS NULL;

-- 添加 retention 字段
ALTER TABLE backup_endpoints ADD COLUMN retention INTEGER;
UPDATE backup_endpoints SET retention = 30 WHERE retention IS NULL;

-- 添加 last_backup 字段
ALTER TABLE backup_endpoints ADD COLUMN last_backup TEXT;

-- 为新字段添加默认值约束（确保非空）
-- 注意：Cloudflare D1 可能不支持 ALTER TABLE 直接修改 NOT NULL
-- 所以我们在插入/更新时处理默认值
