# KV 到 D1 迁移部署说明

## 概述

本次迁移将所有保留在 KV 中的数据（审计日志、指标统计、定时任务锁、备份运行记录）完全迁移到 D1 数据库。

## 迁移的文件

### 1. 新增文件

- `src/services/d1DataService.ts` - D1 数据操作服务，包含：
  - 审计日志操作
  - 指标统计操作
  - 定时任务锁操作
  - 备份运行记录操作

- `migrations/0001_add_kv_replacement_tables.sql` - 数据库迁移脚本

- `src/types.ts` - 更新了 Env 类型，添加了 DB 字段

### 2. 修改的文件

- `src/utils/audit.ts` - 改为使用 D1 存储审计日志
- `src/services/metrics.ts` - 改为使用 D1 存储指标统计
- `src/index.ts` - 定时任务锁和备份运行记录使用 D1

## 部署步骤

### 1. 执行数据库迁移

在部署之前，需要先在 D1 数据库中创建新的表：

```bash
# 使用 wrangler 执行迁移脚本
wrangler d1 execute YOUR_DATABASE_NAME --file=./migrations/0001_add_kv_replacement_tables.sql --local
```

或者在线执行：

```bash
wrangler d1 execute YOUR_DATABASE_NAME --file=./migrations/0001_add_kv_replacement_tables.sql
```

### 2. 验证迁移脚本

执行以下 SQL 命令验证表是否创建成功：

```sql
-- 查看所有表
SELECT name FROM sqlite_master WHERE type='table';

-- 应该看到以下新表：
-- audit_logs
-- metrics
-- scheduled_locks
-- backup_runs
```

### 3. 部署 Workers

```bash
# 部署到生产环境
wrangler deploy

# 或者部署到预览环境进行测试
wrangler deploy --env preview
```

## 注意事项

### 1. KV 数据保留

原有的 KV 数据不会自动删除，建议在系统稳定运行一段时间后再手动清理：

```bash
# 删除审计日志相关的 KV 键
wrangler kv:key delete "audit:用户名:list" --namespace-id=YOUR_NAMESPACE_ID

# 删除指标统计相关的 KV 键
wrangler kv:key delete "metrics:session:用户名" --namespace-id=YOUR_NAMESPACE_ID
wrangler kv:key delete "metrics:用户名" --namespace-id=YOUR_NAMESPACE_ID

# 删除定时任务锁相关的 KV 键
wrangler kv:key delete "scheduled_exec:用户名:任务ID" --namespace-id=YOUR_NAMESPACE_ID

# 删除备份运行记录相关的 KV 键
wrangler kv:key delete "backup_last_run:用户名:端点ID" --namespace-id=YOUR_NAMESPACE_ID
```

### 2. 备份建议

在执行任何清理操作之前，建议备份 KV 数据：

```bash
# 导出 KV 数据
wrangler kv:bulk get --namespace-id=YOUR_NAMESPACE_ID > kv_backup.json
```

### 3. 回滚方案

如果迁移后出现问题，可以通过以下方式回滚：

1. 恢复代码到迁移前的版本
2. 使用 KV 备份数据恢复

## D1 免费配额

D1 免费层配额：
- **写入**: 100 万次/天
- **读取**: 500 万次/天
- **存储**: 5 GB

相比 KV 免费层（1K 写入/天，100K 读取/天），D1 的配额更加充裕。

## 监控和验证

### 1. 验证审计日志功能

```bash
# 登录后检查审计日志 API
curl -X GET https://your-worker.workers.dev/api/admin/audit \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 2. 验证指标统计功能

```bash
# 检查推送统计 API
curl -X GET https://your-worker.workers.dev/api/admin/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. 验证定时任务

检查定时任务是否正常执行，查看日志：

```bash
wrangler tail --env production
```

### 4. 验证备份功能

确认备份任务按预期执行，检查日志中的 `[Cron Backup]` 记录。

## 技术细节

### 数据表结构

#### audit_logs
- `id` - 日志唯一标识
- `user_id` - 用户标识
- `action` - 操作类型
- `data` - 操作数据（JSON）
- `created_at` - 创建时间

#### metrics
- `id` - 统计唯一标识
- `user_id` - 用户标识
- `total` - 总推送数
- `success` - 成功数
- `failed` - 失败数
- `channel_stats` - 渠道统计（JSON）
- `daily_stats` - 每日统计（JSON）
- `created_at` - 创建时间
- `updated_at` - 更新时间

#### scheduled_locks
- `id` - 锁唯一标识
- `user_id` - 用户标识
- `push_id` - 推送任务标识
- `executed_at` - 执行时间（epoch minute）
- `created_at` - 创建时间

#### backup_runs
- `id` - 运行记录唯一标识
- `user_id` - 用户标识
- `endpoint_id` - 备份端点标识
- `last_run` - 最后运行时间（epoch minute）
- `created_at` - 创建时间
- `updated_at` - 更新时间

## 故障排除

### 问题 1: TypeScript 类型错误

如果遇到类型错误，确保已正确配置 wrangler.toml：

```toml
[[d1_databases]]
binding = "DB"
database_name = "your-database-name"
database_id = "your-database-id"
```

### 问题 2: D1 查询失败

检查 D1 数据库是否正确绑定到 Workers：

```typescript
// 在代码中验证
if (!env.DB) {
  console.error('D1 database not bound');
}
```

### 问题 3: 数据不一致

如果发现数据不一致，可以手动触发数据同步或联系技术支持。

## 总结

本次迁移完全移除了以下 KV 依赖：
- ❌ 审计日志存储
- ❌ 指标统计存储
- ❌ 定时任务锁存储
- ❌ 备份运行记录存储

现在这些功能全部使用 D1 存储，享受更高的免费配额和更好的性能！
