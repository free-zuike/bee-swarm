-- 添加密码重置相关字段
ALTER TABLE users ADD COLUMN password_reset_token TEXT;
ALTER TABLE users ADD COLUMN password_reset_expires_at INTEGER;
