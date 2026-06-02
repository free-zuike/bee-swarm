-- 添加 R2 公共域名字段到备份端点表
ALTER TABLE backup_endpoints ADD COLUMN r2_domain TEXT DEFAULT NULL;