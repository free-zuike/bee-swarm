-- ============================================
-- 数据库性能优化索引
-- 添加常用查询场景的联合索引
-- ============================================

-- ============================================
-- 1. 推送历史表索引优化
-- ============================================

-- 联合索引：用户 + 时间（按时间查询推送历史）
CREATE INDEX IF NOT EXISTS idx_push_history_user_timestamp 
ON push_history(user_id, timestamp DESC);

-- 联合索引：用户 + 渠道（统计渠道使用情况）
CREATE INDEX IF NOT EXISTS idx_push_history_user_channel 
ON push_history(user_id, channel_id);

-- 联合索引：用户 + 成功状态（统计成功/失败）
CREATE INDEX IF NOT EXISTS idx_push_history_user_success 
ON push_history(user_id, success);

-- ============================================
-- 2. 审计日志表索引优化
-- ============================================

-- 联合索引：用户 + 操作类型（按类型查询日志）
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action 
ON audit_logs(user_id, action);

-- 联合索引：用户 + 时间 + 操作类型（复杂查询优化）
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created_action 
ON audit_logs(user_id, created_at DESC, action);

-- ============================================
-- 3. 定时任务表索引优化
-- ============================================

-- 联合索引：用户 + 下次执行时间（查询待执行任务）
CREATE INDEX IF NOT EXISTS idx_scheduled_pushes_user_next_run 
ON scheduled_pushes(user_id, next_run);

-- 联合索引：用户 + 状态 + 下次执行时间（查询待执行任务）
CREATE INDEX IF NOT EXISTS idx_scheduled_pushes_user_status_next 
ON scheduled_pushes(user_id, status, next_run);

-- ============================================
-- 4. 推送模板表索引优化
-- ============================================

-- 联合索引：用户 + 创建时间（查询最新模板）
CREATE INDEX IF NOT EXISTS idx_push_templates_user_created 
ON push_templates(user_id, created_at DESC);

-- ============================================
-- 5. 渠道分组表索引优化
-- ============================================

-- 联合索引：用户 + 创建时间（查询最新分组）
CREATE INDEX IF NOT EXISTS idx_channel_groups_user_created 
ON channel_groups(user_id, created_at DESC);

-- ============================================
-- 6. 渠道配置表索引优化
-- ============================================

-- 联合索引：用户 + 启用状态（查询启用的渠道）
CREATE INDEX IF NOT EXISTS idx_channel_configs_user_enabled 
ON channel_configs(user_id, enabled);
