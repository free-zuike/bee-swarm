-- 添加定时任务的重复类型和选择的日期字段
-- 注意：D1 SQLite 不支持 IF NOT EXISTS，需要先检查字段是否存在
-- 如果字段已存在，可以跳过或手动添加

-- 添加 recurring_type 字段（重复类型）
ALTER TABLE scheduled_pushes ADD COLUMN recurring_type TEXT;

-- 添加 selected_week_days 字段（选择的星期几）
ALTER TABLE scheduled_pushes ADD COLUMN selected_week_days TEXT;

-- 添加 selected_month_days 字段（选择的每月日期）
ALTER TABLE scheduled_pushes ADD COLUMN selected_month_days TEXT;

-- 添加 selected_months 字段（选择的月份，仅年度任务）
ALTER TABLE scheduled_pushes ADD COLUMN selected_months TEXT;

-- 添加 selected_year_days 字段（选择的每年日期，仅年度任务）
ALTER TABLE scheduled_pushes ADD COLUMN selected_year_days TEXT;

-- 添加 interval_hours 字段（间隔小时数）
ALTER TABLE scheduled_pushes ADD COLUMN interval_hours INTEGER;

-- 添加 interval_months 字段（间隔月数）
ALTER TABLE scheduled_pushes ADD COLUMN interval_months INTEGER;

-- 添加 interval_years 字段（间隔年数）
ALTER TABLE scheduled_pushes ADD COLUMN interval_years INTEGER;
