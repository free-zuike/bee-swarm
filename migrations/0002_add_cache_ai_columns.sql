-- ============================================
-- 迁移：添加缓存和AI设置的独立字段
-- ============================================

-- 为 users 表添加缓存 TTL 独立字段
ALTER TABLE users ADD COLUMN cache_ttl_backup INTEGER;
ALTER TABLE users ADD COLUMN cache_ttl_channels INTEGER;
ALTER TABLE users ADD COLUMN cache_ttl_templates INTEGER;
ALTER TABLE users ADD COLUMN cache_ttl_groups INTEGER;
ALTER TABLE users ADD COLUMN cache_ttl_scheduled INTEGER;
ALTER TABLE users ADD COLUMN cache_ttl_stats INTEGER;

-- 为 users 表添加 AI 设置独立字段
ALTER TABLE users ADD COLUMN ai_enabled INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN ai_provider TEXT DEFAULT 'workers-ai';
ALTER TABLE users ADD COLUMN ai_model TEXT DEFAULT 'workers-ai';
ALTER TABLE users ADD COLUMN ai_api_key TEXT;
ALTER TABLE users ADD COLUMN ai_api_url TEXT;
ALTER TABLE users ADD COLUMN ai_model_name TEXT;
