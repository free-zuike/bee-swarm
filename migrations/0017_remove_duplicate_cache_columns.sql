-- ============================================
-- 删除冗余的缩写字段，只保留完整的字段名
-- ============================================
-- 删除冗余的缓存设置缩写字段，保留完整字段名
ALTER TABLE users DROP COLUMN IF EXISTS cache_ttl_b;
ALTER TABLE users DROP COLUMN IF EXISTS cache_ttl_c;
ALTER TABLE users DROP COLUMN IF EXISTS cache_ttl_t;
ALTER TABLE users DROP COLUMN IF EXISTS cache_ttl_g;
ALTER TABLE users DROP COLUMN IF EXISTS cache_ttl_s;
