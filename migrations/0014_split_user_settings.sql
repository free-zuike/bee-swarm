-- ============================================
-- 拆分用户设置为缓存设置和AI设置两个独立字段
-- ============================================

-- 备份原表
CREATE TABLE IF NOT EXISTS users_backup_20240604 AS SELECT * FROM users;

-- 创建新的完整表结构
CREATE TABLE IF NOT EXISTS users_new (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  token TEXT,
  token_expires_at INTEGER,
  refresh_token TEXT,
  refresh_token_expires_at INTEGER,
  apikey TEXT,
  apikey_expires_at INTEGER,
  role TEXT DEFAULT 'user',
  disabled INTEGER DEFAULT 0,
  disabled_reason TEXT,
  avatar_url TEXT,
  use_avatar_as_popup INTEGER DEFAULT 0,
  settings TEXT DEFAULT '{}', -- 保留原字段用于兼容性
  cache_settings TEXT DEFAULT '{}', -- 缓存设置
  ai_settings TEXT DEFAULT '{}', -- AI设置
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 复制数据 - 拆分原 settings 为 cache_settings 和 ai_settings
INSERT INTO users_new (
  id, email, password, token, token_expires_at, refresh_token, refresh_token_expires_at,
  apikey, apikey_expires_at, role, disabled, disabled_reason, avatar_url, use_avatar_as_popup,
  settings, cache_settings, ai_settings, created_at, updated_at
)
SELECT
  id, email, password, token, token_expires_at, refresh_token, refresh_token_expires_at,
  apikey, apikey_expires_at, role, disabled, disabled_reason, avatar_url, use_avatar_as_popup,
  settings,
  -- 拆分 cache_settings
  CASE
    WHEN settings IS NOT NULL AND settings != '' THEN
      json_object(
        'cache_ttl_backup', json_extract(settings, '$.cache_ttl_backup'),
        'cache_ttl_channels', json_extract(settings, '$.cache_ttl_channels'),
        'cache_ttl_templates', json_extract(settings, '$.cache_ttl_templates'),
        'cache_ttl_groups', json_extract(settings, '$.cache_ttl_groups'),
        'cache_ttl_scheduled', json_extract(settings, '$.cache_ttl_scheduled')
      )
    ELSE '{}'
  END AS cache_settings,
  -- 拆分 ai_settings
  CASE
    WHEN settings IS NOT NULL AND settings != '' THEN
      json_object(
        'ai_model', json_extract(settings, '$.ai_model'),
        'ai_enabled', json_extract(settings, '$.ai_enabled'),
        'ai_provider', json_extract(settings, '$.ai_provider'),
        'ai_api_key', json_extract(settings, '$.ai_api_key'),
        'ai_api_url', json_extract(settings, '$.ai_api_url'),
        'ai_model_name', json_extract(settings, '$.ai_model_name'),
        'custom_ai_providers', json_extract(settings, '$.custom_ai_providers'),
        'ai_provider_configs', json_extract(settings, '$.ai_provider_configs')
      )
    ELSE '{}'
  END AS ai_settings,
  created_at, updated_at
FROM users;

-- 替换原表
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- 删除备份表
DROP TABLE IF EXISTS users_backup_20240604;

-- 重建索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
