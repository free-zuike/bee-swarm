-- ============================================
-- 添加超时提醒字段到定时任务表
-- ============================================
ALTER TABLE scheduled_pushes ADD COLUMN overdue_reminder_sent INTEGER DEFAULT 0;
ALTER TABLE scheduled_pushes ADD COLUMN status TEXT DEFAULT 'pending';
