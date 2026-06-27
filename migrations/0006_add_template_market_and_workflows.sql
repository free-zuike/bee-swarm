-- 推送模板市场字段
ALTER TABLE push_templates ADD COLUMN is_public INTEGER DEFAULT 0;
ALTER TABLE push_templates ADD COLUMN downloads INTEGER DEFAULT 0;
ALTER TABLE push_templates ADD COLUMN author TEXT;
