-- ============================================
-- 修复 push_templates 表 - 添加缺失的 category 和 variables 字段
-- 使用 ALTER TABLE ADD COLUMN（如果列已存在会报错但可以忽略）
-- ============================================

-- 添加 category 列（如果已存在则忽略）
ALTER TABLE push_templates ADD COLUMN category TEXT;

-- 添加 variables 列（如果已存在则忽略）
ALTER TABLE push_templates ADD COLUMN variables TEXT;