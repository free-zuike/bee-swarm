-- 添加定时任务的重复类型和相关字段
ALTER TABLE scheduled_pushes ADD COLUMN recurring_type TEXT;
ALTER TABLE scheduled_pushes ADD COLUMN selected_week_days TEXT;
ALTER TABLE scheduled_pushes ADD COLUMN selected_month_days TEXT;
