-- 推送回执字段
ALTER TABLE push_history ADD COLUMN delivered_at TEXT;
ALTER TABLE push_history ADD COLUMN read_at TEXT;
ALTER TABLE push_history ADD COLUMN clicked_at TEXT;

-- A/B 测试字段
ALTER TABLE scheduled_pushes ADD COLUMN ab_test_enabled INTEGER DEFAULT 0;
ALTER TABLE scheduled_pushes ADD COLUMN ab_test_variants TEXT;
