-- ============================================
-- 到期提醒字段
-- expiry_at: 到期时间(ISO 字符串)
-- remind_days_before: 提前多少天提醒
-- 用于"到期提醒"模式:提醒时间 = 到期时间 - 提前天数
-- ============================================

ALTER TABLE scheduled_pushes ADD COLUMN expiry_at TEXT;
ALTER TABLE scheduled_pushes ADD COLUMN remind_days_before INTEGER DEFAULT 0;
