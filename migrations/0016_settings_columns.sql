-- 将用户设置从 JSON 提取为独立列，提升查询性能
-- 此迁移向后兼容，不会影响现有功能

-- 1. 添加 AI 设置列
ALTER TABLE users ADD COLUMN ai_enabled INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN ai_provider TEXT DEFAULT 'workers-ai';
ALTER TABLE users ADD COLUMN ai_model TEXT DEFAULT 'workers-ai';
ALTER TABLE users ADD COLUMN ai_api_key TEXT;
ALTER TABLE users ADD COLUMN ai_api_url TEXT;
ALTER TABLE users ADD COLUMN ai_model_name TEXT;

-- 2. 添加缓存设置列
ALTER TABLE users ADD COLUMN cache_ttl_backup INTEGER DEFAULT 300000;
ALTER TABLE users ADD COLUMN cache_ttl_channels INTEGER DEFAULT 300000;
ALTER TABLE users ADD COLUMN cache_ttl_templates INTEGER DEFAULT 300000;
ALTER TABLE users ADD COLUMN cache_ttl_groups INTEGER DEFAULT 300000;
ALTER TABLE users ADD COLUMN cache_ttl_scheduled INTEGER DEFAULT 300000;

-- 3. 为常用查询字段创建索引
CREATE INDEX IF NOT EXISTS idx_users_ai_enabled ON users(ai_enabled);
CREATE INDEX IF NOT EXISTS idx_users_ai_provider ON users(ai_provider);

-- 4. 迁移现有数据到新列
-- 这部分需要在应用层处理，因为 SQLite 不支持 JSON 函数的复杂操作
-- 应用启动时会自动迁移数据