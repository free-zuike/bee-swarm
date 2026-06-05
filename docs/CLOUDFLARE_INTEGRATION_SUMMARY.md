# 蜂群 - Cloudflare 服务集成总结

## 🚀 新增功能概述

本项目已成功集成了多个 Cloudflare 免费服务，大大增强了系统的功能和性能。

### ✨ 服务列表

| 服务 | 状态 | 免费额度 |
|------|------|----------|
| KV 分布式限流 | ✅ 已集成 | 100,000 读/天，1,000 写/天 |
| Durable Objects | ✅ 已集成 | 100 万请求/月 |
| Vectorize 向量搜索 | ✅ 已集成 | 3000 万向量维度/月 |
| Analytics Engine | ✅ 已集成 | 1 亿数据点/月 |
| Cache API | ✅ 已集成 | 无限（但有限制） |
| 安全增强中间件 | ✅ 已集成 | - |

---

## 📁 文件结构

```
src/
├── middleware/
│   ├── kvRateLimit.ts        # KV 分布式限流
│   └── securityEnhancement.ts # 安全增强中间件
├── durable/
│   └── index.ts              # Durable Objects 定义
├── services/
│   ├── vectorizeService.ts   # Vectorize 向量搜索
│   ├── analyticsService.ts   # Analytics Engine 集成
│   └── cloudflareIntegration.ts # 集成辅助函数
└── cloudflare-services.ts    # 统一服务导出
```

---

## 📖 详细使用指南

### 1. KV 分布式限流

#### 配置 wrangler.toml

```toml
[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "your-kv-namespace-id"
```

#### 代码使用

```typescript
import { createKVLimiter } from './cloudflare-services';

app.use('/api/*', createKVLimiter({
  windowMs: 60 * 1000, // 1 分钟
  max: 100, // 最多 100 次请求
  keyGenerator: (c) => c.req.header('cf-connecting-ip') || 'unknown',
}));
```

#### 特性

- 滑动窗口限流算法
- 分布式限流（跨多个 Workers 实例）
- KV 不可用时回退到内存限流
- 优雅降级

---

### 2. Durable Objects

包含三个 Durable Objects：

#### 健康追踪器 (HealthTrackerDO)

```typescript
import { recordHealthCheck, getHealthSummary } from './services/cloudflareIntegration';

// 记录健康检查结果
await recordHealthCheck(env, 'user1', 'telegram', true, 150, 'Success');

// 获取健康摘要
const summary = await getHealthSummary(env, 'user1');
```

#### 分布式锁 (DistributedLockDO)

```typescript
import { DistributedLockHelper } from './services/cloudflareIntegration';

const lock = new DistributedLockHelper(env, 'my-task-lock');
const { acquired, lockId } = await lock.acquire(30000); // 获取锁，30 秒过期

if (acquired) {
  try {
    // 执行任务
  } finally {
    await lock.release(lockId!); // 释放锁
  }
}
```

#### WebSocket 管理器 (WebSocketManagerDO)

用于实时推送通知和健康告警。

---

### 3. Vectorize 向量搜索

用于智能模板推荐和语义搜索。

```typescript
import { searchTemplates, getTemplateRecommendations } from './services/cloudflareIntegration';

// 搜索模板
const results = await searchTemplates(env, '服务器监控告警', 'user1');

// 获取模板推荐
const recommendations = await getTemplateRecommendations(env, 'template1', 'user1', 5);
```

---

### 4. Analytics Engine

用于推送统计收集和分析。

```typescript
import { logPushStatistics, getUserAnalyticsSummary, getUserDailyTrend } from './services/cloudflareIntegration';

// 记录推送统计
await logPushStatistics(env, 'user1', 'telegram', true, 150);

// 获取用户摘要
const summary = await getUserAnalyticsSummary(env, 'user1', 7);

// 获取每日趋势
const trend = await getUserDailyTrend(env, 'user1', 30);
```

---

### 5. 安全增强中间件

```typescript
import {
  bruteForceProtection,
  ipReputationCheck,
  sensitiveOperationProtection,
  enhancedCORSMiddleware,
} from './cloudflare-services';

app.use('/api/login', bruteForceProtection());
app.use('/api/*', ipReputationCheck());
app.use('/api/admin/*', sensitiveOperationProtection());
app.use(enhancedCORSMiddleware({
  allowedOrigins: ['https://yourdomain.com'],
}));
```

---

## 🚀 部署步骤

### 1. 创建必要的 Cloudflare 资源

```bash
# 创建 KV 命名空间
npx wrangler kv:namespace create bee-swarm-rate-limit

# 创建 Vectorize 索引
npx wrangler vectorize create bee-swarm-templates --dimensions=1024 --metric=cosine
```

### 2. 更新配置

编辑 `wrangler.toml`，填入资源 ID：

```toml
[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "your-kv-id"

[[vectorize]]
binding = "VECTORIZE_INDEX"
index_name = "bee-swarm-templates"
```

### 3. 部署

```bash
npm run build
npm run deploy
```

---

## 📊 架构图

```
┌─────────────────────────────────────────────────────┐
│                    用户请求                          │
└────────────────────┬────────────────────────────────┘
                     │
         ┌───────────▼───────────┐
         │   安全增强中间件      │
         │  - 暴力破解防护       │
         │  - IP 信誉检查        │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │  KV 分布式限流        │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │   Cache API (缓存)    │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │   API 路由处理        │
         └───────────┬───────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
┌────────▼────────┐     ┌───────▼─────────┐
│  Durable Objects│     │  Analytics Engine│
│  - 健康追踪器   │     │  - 推送统计      │
│  - 分布式锁     │     │  - 数据分析      │
│  - WebSocket    │     └─────────────────┘
└─────────────────┘
         │
┌────────▼────────┐
│  Vectorize      │
│  向量搜索       │
└─────────────────┘
```

---

## 💡 最佳实践

### 1. 性能优化

- 优先使用 Cache API 缓存热点数据
- KV 写入操作尽量合并
- 批量 Vectorize 查询以降低开销

### 2. 成本控制

- 监控免费配额使用情况
- 设置合理的缓存过期时间
- 使用 KV 批量写入

### 3. 错误处理

- 所有服务都实现了优雅降级
- KV 不可用时使用内存限流
- Vectorize 不可用时返回空结果

---

## 📝 配置建议

### KV 配置

- 窗口大小建议 1-5 分钟
- 阈值根据业务需求调整

### Durable Objects

- 每个用户使用独立的健康追踪器实例
- 锁 TTL 建议设置为 30-60 秒

### Vectorize

- 维度选择 1024（Workers AI 默认）
- 使用余弦相似度（cosine）

---

## 🎯 总结

本次集成成功将多个 Cloudflare 免费服务引入项目，大大提升了系统的：

1. **性能** - 分布式限流 + 缓存
2. **可靠性** - 健康追踪 + 分布式锁
3. **智能化** - 向量搜索 + 模板推荐
4. **可观测性** - 分析引擎 + 统计数据
5. **安全性** - 暴力破解防护 + IP 信誉检查

所有服务都完全基于 Cloudflare 免费层，无需额外成本！
