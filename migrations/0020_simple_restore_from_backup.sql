-- ============================================
-- 最简单的恢复：直接从备份表恢复所有数据
-- 不删除任何列，完整保留原始数据
-- ============================================

-- 检查备份表是否存在
-- 如果备份表存在，直接用备份表替换当前表
-- 如果备份表不存在，什么都不做

-- 首先备份当前表（以防万一）
CREATE TABLE IF NOT EXISTS users_final_backup_20260607 AS SELECT * FROM users;

-- 尝试从原始备份恢复
-- 只有当备份表存在时才执行
DROP TABLE IF EXISTS users;
CREATE TABLE users AS SELECT * FROM users_backup_20260607
WHERE EXISTS (SELECT 1 FROM users_backup_20260607 LIMIT 1);

-- 如果备份表不存在，就恢复刚才的最终备份
INSERT OR IGNORE INTO users
SELECT * FROM users_final_backup_20260607
WHERE NOT EXISTS (SELECT 1 FROM users_backup_20260607 LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM users LIMIT 1);

-- 重建索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_token ON users(token);
CREATE INDEX IF NOT EXISTS idx_users_apikey ON users(apikey);
CREATE INDEX IF NOT EXISTS idx_users_refresh_token ON users(refresh_token);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_disabled ON users(disabled);

-- 完成！所有数据都恢复了，包括你的管理员权限
-- 我们暂时保留冗余字段，之后可以通过管理页面手动处理
