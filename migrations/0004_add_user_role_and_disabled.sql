-- ============================================
-- 添加用户角色与禁用状态字段
-- 用于实现 RBAC 权限系统
-- ============================================

ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';
ALTER TABLE users ADD COLUMN disabled INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN disabled_reason TEXT;

-- 为角色字段添加索引以加速查询
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_disabled ON users(disabled);
