-- 添加 original_next_run 字段存储原始执行时间
-- 用于循环任务在执行后仍能获取原始的小时和分钟

ALTER TABLE scheduled_pushes ADD COLUMN original_next_run INTEGER;
