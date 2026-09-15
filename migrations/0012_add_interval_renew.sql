-- ============================================
-- 循环间隔字段
-- interval_days: 每几天执行一次
-- interval_hours: 每几小时执行一次
-- interval_months: 每几个月执行一次
-- interval_years: 每几年执行一次
-- 到期提醒自动续期
-- renew_months: 续期周期（月），到期后自动将到期时间 +N 个月，重新开始提醒
-- ============================================

ALTER TABLE scheduled_pushes ADD COLUMN interval_days INTEGER;
ALTER TABLE scheduled_pushes ADD COLUMN interval_hours INTEGER;
ALTER TABLE scheduled_pushes ADD COLUMN interval_months INTEGER;
ALTER TABLE scheduled_pushes ADD COLUMN interval_years INTEGER;
ALTER TABLE scheduled_pushes ADD COLUMN renew_months INTEGER DEFAULT 12;
