# KV 到 D1 在线迁移指南

## 📋 概述

本指南介绍如何在线迁移 KV 数据到 D1，**无需停止服务**，在系统运行过程中完成数据迁移。

## 🎯 迁移方案

### 在线迁移流程

```
┌─────────────────────────────────────────────────────────┐
│  1. 部署新代码 (D1 + 实时迁移)                          │
│     ↓                                                   │
│  2. 创建 D1 数据库表                                    │
│     ↓                                                   │
│  3. 调用迁移 API 批量迁移历史数据                        │
│     ↓                                                   │
│  4. 新数据自动双写 (KV + D1)                           │
│     ↓                                                   │
│  5. 验证迁移完整性                                       │
│     ↓                                                   │
│  6. 清理 KV 中的旧数据                                  │
└─────────────────────────────────────────────────────────┘
```

## 🚀 详细步骤

### 步骤 1: 部署新代码

确保新代码已部署到 Cloudflare Workers。新代码包括：
- ✅ `src/services/d1DataService.ts` - D1 数据服务
- ✅ `src/services/migrationService.ts` - 迁移服务
- ✅ `src/routes/api.ts` - 迁移 API 接口
- ✅ `src/utils/audit.ts` - 审计日志使用 D1
- ✅ `src/services/metrics.ts` - 指标统计使用 D1
- ✅ `src/index.ts` - 定时任务锁和备份记录使用 D1

### 步骤 2: 创建 D1 数据库表

在 Cloudflare Dashboard 或使用 Wrangler CLI 创建数据库表：

```bash
# 使用 Wrangler 执行迁移脚本
wrangler d1 execute YOUR_DATABASE_NAME --file=./migrations/0001_add_kv_replacement_tables.sql --local
```

或在线执行：

```bash
wrangler d1 execute YOUR_DATABASE_NAME --file=./migrations/0001_add_kv_replacement_tables.sql
```

**验证表是否创建成功**：

```sql
-- 查看所有表
SELECT name FROM sqlite_master WHERE type='table';

-- 应该看到：
-- audit_logs
-- metrics
-- scheduled_locks
-- backup_runs
```

### 步骤 3: 执行数据迁移

部署完成后，调用迁移 API 批量迁移历史数据：

#### 3.1 获取 API Token

首先获取 API Token（参考之前的文档）

#### 3.2 调用迁移 API

**执行迁移**：

```bash
curl -X POST https://your-worker.workers.dev/api/admin/migration/migrate \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**预期响应**：

```json
{
  "success": true,
  "message": "数据迁移完成",
  "audit": {
    "success": true,
    "type": "audit",
    "migrated": 50,
    "failed": 0,
    "errors": []
  },
  "metrics": {
    "success": true,
    "type": "metrics",
    "migrated": 1,
    "failed": 0,
    "errors": []
  },
  "summary": {
    "totalMigrated": 51,
    "totalFailed": 0,
    "errors": []
  }
}
```

### 步骤 4: 验证迁移完整性

迁移完成后，验证数据是否完整迁移：

```bash
curl https://your-worker.workers.dev/api/admin/migration/verify \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**预期响应**：

```json
{
  "success": true,
  "stats": {
    "audit": {
      "kvRecords": 50,
      "d1Records": 50,
      "missing": 0,
      "status": "completed"
    },
    "metrics": {
      "kvRecords": 1,
      "d1Records": 1,
      "missing": 0,
      "status": "completed"
    },
    "scheduledLocks": {
      "kvRecords": 0,
      "d1Records": 0,
      "missing": 0,
      "status": "completed"
    },
    "backupRuns": {
      "kvRecords": 0,
      "d1Records": 0,
      "missing": 0,
      "status": "completed"
    }
  }
}
```

### 步骤 5: 观察系统运行

迁移完成后，系统会自动：
1. **新数据双写**：新产生的审计日志、指标统计会自动写入 D1
2. **读取优先 D1**：读取操作优先从 D1 读取，如果 D1 没有数据则回退到 KV
3. **自动同步**：确保 KV 和 D1 数据一致

### 步骤 6: 清理 KV 数据（可选）

**警告**：只有在确认系统运行正常、D1 数据完整后，才执行清理操作！

```bash
curl -X DELETE https://your-worker.workers.dev/api/admin/migration/cleanup \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**预期响应**：

```json
{
  "success": true,
  "message": "KV 数据清理完成",
  "cleaned": [
    "audit:username:list",
    "metrics:session:username",
    "metrics:username"
  ],
  "errors": []
}
```

## 🔧 API 接口详情

### 1. 执行迁移

```
POST /api/admin/migration/migrate
Authorization: Bearer TOKEN
```

**功能**：
- 从 KV 读取审计日志、指标统计数据
- 写入 D1 数据库
- 返回迁移结果

### 2. 验证迁移

```
GET /api/admin/migration/verify
Authorization: Bearer TOKEN
```

**功能**：
- 对比 KV 和 D1 中的数据
- 返回每个数据类型的迁移状态
- 帮助确认迁移是否完整

### 3. 清理 KV

```
DELETE /api/admin/migration/cleanup
Authorization: Bearer TOKEN
```

**功能**：
- 删除 KV 中的迁移完成的数据
- 仅删除已迁移的数据类型
- 返回清理结果和错误

## ⚠️ 注意事项

### 1. 迁移时机

- **建议时间**：系统低峰期进行迁移，减少对用户的影响
- **备份**：迁移前建议备份 KV 数据（虽然迁移是可逆的）

### 2. 迁移失败处理

如果迁移过程中出现错误：
1. 检查错误信息
2. 查看 Cloudflare Workers 日志
3. 修复问题后重新调用迁移 API

### 3. 回滚方案

如果迁移后出现问题：
1. **数据回滚**：KV 中的数据未删除，可以回滚到旧代码
2. **D1 数据保留**：即使回滚，D1 中的数据也会保留
3. **重新迁移**：修复问题后可以重新执行迁移

### 4. 迁移验证

建议按以下顺序验证：

```
1. 检查审计日志 API 是否正常
   GET /api/admin/audit
   
2. 检查指标统计 API 是否正常
   GET /api/admin/metrics
   
3. 检查定时任务是否正常执行
   - 查看 Workers 日志
   
4. 检查备份任务是否正常执行
   - 查看 Workers 日志
```

## 📊 迁移监控

### 监控指标

1. **API 响应时间**：确保迁移 API 响应正常
2. **Workers 日志**：检查是否有迁移相关错误
3. **D1 查询性能**：确保 D1 查询不影响系统性能

### 常见问题排查

#### 问题 1: 迁移 API 返回 500

**可能原因**：
- D1 数据库未绑定
- 数据库表未创建
- 权限问题

**解决方案**：
```bash
# 检查 wrangler.toml 配置
cat wrangler.toml | grep -A 5 "d1_databases"

# 重新执行迁移脚本
wrangler d1 execute YOUR_DATABASE_NAME --file=./migrations/0001_add_kv_replacement_tables.sql
```

#### 问题 2: 验证显示数据不一致

**可能原因**：
- 迁移过程中有新数据写入
- 部分迁移失败

**解决方案**：
```bash
# 重新执行迁移
curl -X POST https://your-worker.workers.dev/api/admin/migration/migrate \
  -H "Authorization: Bearer YOUR_TOKEN"

# 再次验证
curl https://your-worker.workers.dev/api/admin/migration/verify \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### 问题 3: 审计日志 API 无数据

**可能原因**：
- D1 中没有数据
- 读取逻辑问题

**解决方案**：
1. 检查迁移是否成功
2. 检查 KV 中是否有数据
3. 重新执行迁移

## 🎉 迁移完成

当以下条件满足时，迁移完成：

- ✅ D1 表已创建
- ✅ 历史数据已迁移
- ✅ 验证显示数据完整
- ✅ 新数据正常写入 D1
- ✅ 系统运行正常
- ✅ (可选) KV 数据已清理

恭喜！您的系统已成功迁移到 D1，享受更高的免费配额和更好的性能！

## 📞 技术支持

如果迁移过程中遇到问题：
1. 查看 Cloudflare Workers 日志
2. 检查 API 响应错误信息
3. 验证 D1 数据库配置
4. 联系技术支持

## 🔗 相关资源

- [Cloudflare D1 文档](https://developers.cloudflare.com/d1/)
- [KV 到 D1 迁移说明](../docs/KV_TO_D1_MIGRATION.md)
- [wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)
