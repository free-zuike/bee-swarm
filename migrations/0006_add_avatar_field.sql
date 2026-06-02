-- ============================================
-- 添加用户头像字段
-- ============================================

-- 添加头像URL字段
ALTER TABLE users ADD COLUMN avatar_url TEXT;

-- 添加悬浮窗使用头像的设置字段
ALTER TABLE users ADD COLUMN use_avatar_as_popup INTEGER DEFAULT 0;