# Cloudflare 服务 API 文档

本文档介绍新增的 `/api/cloudflare` 端点，用于使用 Cloudflare 服务功能。

## 认证

所有 Cloudflare API 端点都需要认证，请在请求头中包含有效的 Authorization token。

---

## 健康检查 API

### 记录健康检查结果

**请求：**
```http
POST /api/cloudflare/health/check
Content-Type: application/json

{
  "channel": "telegram",
  "healthy": true,
  "latencyMs": 150,
  "message": "健康检查成功",
  "error": null
}
```

**响应：**
```json
{
  "success": true,
  "message": "健康检查已记录"
}
```

### 获取健康摘要

**请求：**
```http
GET /api/cloudflare/health/summary
```

**响应：**
```json
{
  "success": true,
  "data": {
    "total": 5,
    "healthy": 4,
    "unhealthy": 1,
    "successRate": 0.8
  }
}
```

---

## 模板搜索和推荐 API

### 搜索模板

**请求：**
```http
GET /api/cloudflare/templates/search?q=服务器告警
```

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "id": "template-1",
      "name": "服务器告警模板",
      "category": "monitoring",
      "score": 0.95
    },
    {
      "id": "template-2",
      "name": "系统监控告警",
      "category": "monitoring",
      "score": 0.85
    }
  ]
}
```

### 获取模板推荐

**请求：**
```http
GET /api/cloudflare/templates/recommend/template-1?limit=5
```

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "id": "template-2",
      "name": "系统监控告警",
      "score": 0.92
    },
    {
      "id": "template-3",
      "name": "应用程序错误告警",
      "score": 0.88
    }
  ]
}
```

### 为模板生成向量嵌入

**请求：**
```http
POST /api/cloudflare/templates/embed
Content-Type: application/json

{
  "templateId": "template-1",
  "name": "服务器告警模板",
  "description": "用于服务器健康告警",
  "category": "monitoring",
  "content": "服务器 CPU 使用率过高，请及时处理"
}
```

**响应：**
```json
{
  "success": true,
  "data": {
    "embeddingId": "template-1"
  }
}
```

---

## 分析数据 API

### 获取用户分析摘要

**请求：**
```http
GET /api/cloudflare/analytics/summary?days=7
```

**响应：**
```json
{
  "success": true,
  "data": {
    "totalPushes": 150,
    "successCount": 145,
    "failureCount": 5,
    "successRate": 0.967
  }
}
```

### 获取每日趋势

**请求：**
```http
GET /api/cloudflare/analytics/trend?days=30
```

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "date": "2024-01-01",
      "total": 10,
      "success": 9,
      "failure": 1,
      "successRate": 0.9
    },
    {
      "date": "2024-01-02",
      "total": 12,
      "success": 12,
      "failure": 0,
      "successRate": 1.0
    }
  ]
}
```

### 记录推送统计（测试用）

**请求：**
```http
POST /api/cloudflare/analytics/push
Content-Type: application/json

{
  "channelId": "telegram",
  "success": true,
  "latencyMs": 120,
  "errorMessage": null
}
```

**响应：**
```json
{
  "success": true,
  "message": "推送统计已记录"
}
```

---

## 分布式锁 API（测试用）

### 获取锁

**请求：**
```http
POST /api/cloudflare/lock/acquire
Content-Type: application/json

{
  "lockName": "my-task",
  "ttl": 30000
}
```

**响应：**
```json
{
  "success": true,
  "data": {
    "acquired": true,
    "lockId": "my-task-1704067200000-abc123"
  }
}
```

### 释放锁

**请求：**
```http
POST /api/cloudflare/lock/release
Content-Type: application/json

{
  "lockName": "my-task",
  "lockId": "my-task-1704067200000-abc123"
}
```

**响应：**
```json
{
  "success": true,
  "message": "锁已释放"
}
```

---

## 系统状态 API

### 获取 Cloudflare 服务状态

**请求：**
```http
GET /api/cloudflare/status
```

**响应：**
```json
{
  "success": true,
  "data": {
    "kv": true,
    "healthTracker": true,
    "webSocketManager": true,
    "distributedLock": true,
    "vectorize": true,
    "analyticsEngine": true,
    "workersAi": true
  }
}
```

---

## 错误响应

所有 API 端点在发生错误时会返回以下格式：

```json
{
  "success": false,
  "error": "错误描述"
}
```

常见 HTTP 状态码：
- `200 OK`：成功
- `400 Bad Request`：请求参数错误
- `401 Unauthorized`：未授权
- `500 Internal Server Error`：服务器内部错误
