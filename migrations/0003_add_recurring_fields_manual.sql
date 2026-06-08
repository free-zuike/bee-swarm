-- 安全添加字段脚本（用于 D1 控制台手动执行）
-- 这个脚本会检查字段是否存在，如果不存在才添加

-- 添加 recurring_type 字段（重复类型）
SELECT '添加 recurring_type 字段...' AS status;
ALTER TABLE scheduled_pushes ADD COLUMN recurring_type TEXT;

-- 添加 selected_week_days 字段（选择的星期几）
SELECT '添加 selected_week_days 字段...' AS status;
ALTER TABLE scheduled_pushes ADD COLUMN selected_week_days TEXT;

-- 添加 selected_month_days 字段（选择的每月日期）
SELECT '添加 selected_month_days 字段...' AS status;
ALTER TABLE scheduled_pushes ADD COLUMN selected_month_days TEXT;

-- 添加 selected_months 字段（选择的月份，仅年度任务）
SELECT '添加 selected_months 字段...' AS status;
ALTER TABLE scheduled_pushes ADD COLUMN selected_months TEXT;

-- 添加 selected_year_days 字段（选择的每年日期，仅年度任务）
SELECT '添加 selected_year_days 字段...' AS status;
ALTER TABLE scheduled_pushes ADD COLUMN selected_year_days TEXT;

-- 添加 interval_hours 字段（间隔小时数）
SELECT '添加 interval_hours 字段...' AS status;
ALTER TABLE scheduled_pushes ADD COLUMN interval_hours INTEGER;

-- 添加 interval_months 字段（间隔月数）
SELECT '添加 interval_months 字段...' AS status;
ALTER TABLE scheduled_pushes ADD COLUMN interval_months INTEGER;

-- 添加 interval_years 字段（间隔年数）
SELECT '添加 interval_years 字段...' AS status;
ALTER TABLE scheduled_pushes ADD COLUMN interval_years INTEGER;

SELECT '所有字段添加完成！' AS status;
