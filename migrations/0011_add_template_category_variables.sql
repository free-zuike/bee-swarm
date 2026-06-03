-- ============================================
-- 修复 push_templates 表 - 添加缺失的 category 和 variables 字段
-- ============================================

-- 备份原表
CREATE TABLE IF NOT EXISTS push_templates_backup_20240603 AS SELECT * FROM push_templates;

-- 创建新的表结构
CREATE TABLE IF NOT EXISTS push_templates_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  title TEXT,
  body TEXT,
  url TEXT,
  image_url TEXT,
  markdown INTEGER DEFAULT 0,
  channels TEXT,
  category TEXT,
  variables TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 复制数据（注意：原表没有 category 和 variables 列，会使用 NULL）
INSERT INTO push_templates_new (
  id, user_id, name, title, body, url, image_url, markdown, channels,
  category, variables, created_at, updated_at
)
SELECT
  id,
  user_id,
  name,
  title,
  body,
  url,
  image_url,
  COALESCE(markdown, 0),
  channels,
  NULL as category,
  NULL as variables,
  created_at,
  updated_at
FROM push_templates;

-- 替换原表
DROP TABLE push_templates;
ALTER TABLE push_templates_new RENAME TO push_templates;

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_push_templates_user_id ON push_templates(user_id);

-- 删除备份表
DROP TABLE IF EXISTS push_templates_backup_20240603;