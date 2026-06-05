# Cloudflare 服务使用指南

本文档介绍如何在蜂群系统中使用新增的 Cloudflare 免费服务。

## 目录

- [1. KV 分布式限流](#1-kv-分布式限流)
- [2. Durable Objects](#2-durable-objects)
- [3. Vectorize AI 向量搜索](#3-vectorize-ai-向量搜索)
- [4. Analytics Engine](#4-analytics-engine)
- [5. 安全增强](#5-安全增强)
- [6. 部署说明](#6-部署说明)

---

## 1. KV 分布式限流

### 启用 KV

```bash
# 创建 KV 命名空间
npx wrangler kv:namespace create bee-swarm-rate-limit
```

### 在代码中使用

```typescript
import { createKVLimiter, createGlobalKVLimiter } from './cloudflare-services';

// 按端点限流
app.use('/api/', createKVLimiter({
  windowMs: 60000,  // 1 分钟窗口
  max: 60,          // 60 次请求
}));

// 全局限流
app.use(createGlobalKVLimiter({
  windowMs: 60000,
  max: 100,
}));
```

### 免费额度
- 读取：100,000 次/天
- 写入：1,000 次/天

---

## 2. Durable Objects

### 在代码中使用

```typescript
import { HealthTrackerDO, WebSocketManagerDO, DistributedLockDO } from './cloudflare-services';

// 健康追踪器（通过 HTTP 调用）
const healthTrackerStub = env.HEALTH_TRACKER.get(env.HEALTH_TRACKER.idFromName(`health-${userId}`));
const healthStatus = await fetch(`${healthTrackerStub.url}?action=status&channel=telegram`).then(r => r.json());

// 分布式锁
const lockStub = env.TASK_LOCK.get(env.TASK_LOCK.idFromName('cleanup-task'));
const result = await fetch(lockStub.url, {
  method: 'POST',
  body: JSON.stringify({ action: 'acquire', ownerId: 'worker-1', ttl: 60000 })
}).then(r => r.json());
```

### 免费额度
- 1,000,000 请求/月

---

## 3. Vectorize AI 向量搜索

### 创建 Vectorize 索引

```bash
npx wrangler vectorize create bee-swarm-templates \
  --dimensions=1024 \
  --metric=cosine
```

### 在代码中使用

```typescript
import { VectorizeService, TemplateVectorManager } from './cloudflare-services';

// 搜索模板
const service = new VectorizeService(env);
const results = await service.searchTemplates('服务器告警', userId);

// 智能推荐
const manager = new TemplateVectorManager(env);
const recommendations = await manager.getRecommendations(templateId, userId);
```

### 免费额度
- 30,000,000 向量维度/月

---

## 4. Analytics Engine

### 在代码中使用

```typescript
import { AnalyticsService, D1AnalyticsService, PushStatisticsCollector } from './cloudflare-services';

// 收集推送统计
const collector = new PushStatisticsCollector(env, userId);
await collector.record('telegram', true, 150);

// 查询分析数据
const analytics = new D1AnalyticsService(env);
const summary = await analytics.getUserSummary(userId, 7);
const trend = await analytics.getDailyTrend(userId, 30);
```

### 免费额度
- 10,000,000 数据点/月

---

## 5. 安全增强

### 在代码中使用

```typescript
import {
  bruteForceProtection,
  ipReputationCheck,
  sensitiveOperationProtection,
  enhancedCORSMiddleware,
} from './cloudflare-services';

// 登录保护
app.post('/api/login', bruteForceProtection(), loginHandler);

// IP 信誉检查
app.use(ipReputationCheck());

// 敏感操作保护
app.use(sensitiveOperationProtection());

// 增强 CORS
app.use(enhancedCORSMiddleware({
  allowedOrigins: ['https://your-domain.com'],
}));
```

---

## 6. 部署说明

### 1. 创建必要的 Cloudflare 资源

```bash
# KV 命名空间
npx wrangler kv:namespace create bee-swarm-rate-limit

# Vectorize 索引
npx wrangler vectorize create bee-swarm-templates \
  --dimensions=1024 \
  --metric=cosine

# Durable Objects 会自动创建
```

### 2. 更新配置

编辑 `wrangler.toml`，填入相应的 ID：

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
npm run deploy
```

---

## 注意事项

1. **所有服务都是可选的** - 即使不配置，代码也会优雅降级
2. **免费额度** - 注意各服务的免费额度限制
3. **性能考虑** - 不要过度依赖 KV 写入，优先使用 Cache API
4. **数据持久化** - Durable Objects 数据持久化，但有 CPU 时间限制

---

## 新增文件列表

| 文件 | 说明 |
|------|------|
| `src/middleware/kvRateLimit.ts` | KV 分布式限流中间件 |
| `src/middleware/securityEnhancement.ts` | 安全增强中间件 |
| `src/durable/index.ts` | Durable Objects 定义 |
| `src/services/vectorizeService.ts` | Vectorize 向量搜索服务 |
| `src/services/analyticsService.ts` | Analytics Engine 服务 |
| `src/cloudflare-services.ts` | 统一导出入口 |
| `src/types.ts` | 更新的类型定义 |
