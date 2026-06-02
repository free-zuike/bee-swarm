-- ============================================
-- 添加用户表的 refresh token 字段
-- ============================================

ALTER TABLE users ADD COLUMN refresh_token TEXT;
ALTER TABLE users ADD COLUMN refresh_token_expires_at INTEGER;

-- 为新字段添加索引
CREATE INDEX IF NOT EXISTS idx_users_refresh_token ON users(refresh_token);
