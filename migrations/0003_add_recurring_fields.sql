-- 添加定时任务的重复类型和选择的日期字段
ALTER TABLE scheduled_pushes ADD COLUMN IF NOT EXISTS recurring_type TEXT;
ALTER TABLE scheduled_pushes ADD COLUMN IF NOT EXISTS selected_week_days TEXT;
ALTER TABLE scheduled_pushes ADD COLUMN IF NOT EXISTS selected_month_days TEXT;
ALTER TABLE scheduled_pushes ADD COLUMN IF NOT EXISTS selected_months TEXT;
ALTER TABLE scheduled_pushes ADD COLUMN IF NOT EXISTS selected_year_days TEXT;
ALTER TABLE scheduled_pushes ADD COLUMN IF NOT EXISTS interval_hours INTEGER;
ALTER TABLE scheduled_pushes ADD COLUMN IF NOT EXISTS interval_months INTEGER;
ALTER TABLE scheduled_pushes ADD COLUMN IF NOT EXISTS interval_years INTEGER;