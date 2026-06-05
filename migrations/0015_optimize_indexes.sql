-- 优化索引以提升查询性能
-- 这些索引能显著减少常用查询的扫描范围

-- 1. 推送历史表索引（最重要，因为数据增长快）
CREATE INDEX IF NOT EXISTS idx_push_history_user_created 
ON push_history(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_push_history_created 
ON push_history(created_at DESC);

-- 2. 审计日志表索引
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action 
ON audit_logs(user_id, action);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created 
ON audit_logs(created_at DESC);

-- 3. 定时推送表索引
CREATE INDEX IF NOT EXISTS idx_scheduled_next_run 
ON scheduled_pushes(next_run_at ASC);

CREATE INDEX IF NOT EXISTS idx_scheduled_status 
ON scheduled_pushes(user_id, enabled);

-- 4. 备份记录表索引
CREATE INDEX IF NOT EXISTS idx_backup_runs_user 
ON backup_runs(user_id, created_at DESC);

-- 5. 备份端点索引
CREATE INDEX IF NOT EXISTS idx_backup_endpoints_user 
ON backup_endpoints(user_id);
