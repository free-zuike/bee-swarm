# 备份导出/导入审计

## 导出数据（exportUserData）

### 1. channelConfigs（渠道配置）
导出字段：id, channelId, config, enabled, createdAt, updatedAt
导入字段：id, userId, channelId, config, enabled, createdAt, updatedAt
✅ 字段匹配

### 2. pushTemplates（推送模板）
导出字段：id, name, title, body, url, imageUrl, markdown, channels, category, variables, createdAt, updatedAt
导入字段：id, userId, name, title, body, url, imageUrl, markdown, channels, createdAt, updatedAt
⚠️ 缺少 category, variables

### 3. scheduledPushes（定时推送）
导出字段：id, templateId, cron, nextRun, title, body, url, imageUrl, markdown, channels, enabled, status, recurringType, selectedWeekDays, selectedMonthDays, yearlyDates, timezone, abTestEnabled, abTestVariants, overdueReminderSent, createdAt, updatedAt
导入字段：同上
✅ 字段匹配

### 4. channelGroups（渠道分组）
导出字段：id, name, channels, createdAt, updatedAt
导入字段：id, userId, name, channels, createdAt, updatedAt
✅ 字段匹配

### 5. pushHistory（推送历史）
导出字段：id, title, body, url, imageUrl, markdown, channels, results, status, createdAt, deliveredAt, readAt, clickedAt, revokedAt
导入字段：id, userId, title, body, url, imageUrl, markdown, channels, results, status, createdAt, deliveredAt, readAt, clickedAt, revokedAt
✅ 字段匹配

### 6. auditLogs（审计日志）
导出字段：id, action, data, createdAt
导入字段：id, userId, action, data, createdAt
✅ 字段匹配

### 7. metrics（指标统计）
导出字段：total, success, failed, channelStats, dailyStats, createdAt, updatedAt
导入字段：id(新生成), userId, total, success, failed, channelStats, dailyStats, createdAt, updatedAt
✅ 字段匹配

### 8. userSettings（用户设置）
导出字段：avatarUrl, useAvatarAsPopup, cacheSettings, aiSettings, cacheTtl*, aiEnabled, aiProvider, aiModel, aiApiKey, aiApiUrl, aiModelName
导入字段：同上
✅ 字段匹配

### 9. systemSettings（系统设置）
导出字段：turnstile*, cleanup*, cors*, smtp*
导入字段：turnstile*, cleanup*, cors*, smtp*
✅ 字段匹配（已修复）

### 10. backupEndpoints（备份端点）
导出字段：id, name, type, config, enabled, schedule, retention, createdAt, updatedAt
导入字段：id, userId, name, type, config, enabled, schedule, retention, createdAt, updatedAt
✅ 字段匹配

## 缺失的数据

### push_templates 缺少字段
- category（分类）
- variables（变量定义）

### 其他潜在问题
1. D1 复制延迟可能导致某些表的导入失败
2. batch 操作在某个表失败时会跳过，但其他表继续导入
3. 系统设置导入失败时会被静默忽略
