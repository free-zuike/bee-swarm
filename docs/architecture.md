# 蜂群 (Bee Swarm) 架构设计文档

## 目录
- [概述](#概述)
- [系统架构](#系统架构)
- [目录结构](#目录结构)
- [核心模块说明](#核心模块说明)
- [数据存储](#数据存储)
- [安全设计](#安全设计)
- [API 设计](#api-设计)
- [部署架构](#部署架构)

---

## 概述

蜂群是一个基于 Cloudflare Workers 构建的多渠道推送通知系统。它采用现代化的技术栈，提供高性能、易扩展的推送服务。

### 核心特性
- 支持 9 种推送渠道（企业微信、钉钉、飞书、Telegram、Bark、ntfy、Email、Slack、Discord）
- 用户注册、登录、认证系统
- 推送模板管理
- 渠道分组
- 定时推送（支持 Cron 表达式）
- 多端点数据备份（S3/WebDAV）
- 推送历史记录
- 统计仪表盘
- Webhook 触发

### 技术栈
- **后端**: Cloudflare Workers + Hono
- **前端**: Vue 3 + Vite + Vue Router + Pinia
- **存储**: Cloudflare KV
- **类型**: TypeScript（前后端共享）
- **测试**: Vitest

---

## 系统架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                         客户端层                              │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │   Web 浏览器     │         │   API 客户端     │         │
│  └────────┬─────────┘         └────────┬─────────┘         │
└───────────┼────────────────────────────┼────────────────────┘
            │                            │
            ▼                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Cloudflare CDN                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   Hono Web 服务                       │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐           │  │
│  │  │  中间件  │  │   路由   │  │  服务层  │           │  │
│  │  └──────────┘  └──────────┘  └──────────┘           │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   KV Storage  │   │   静态资源    │   │  Cron 触发器  │
│  (数据存储)   │   │  (前端页面)   │   │  (定时任务)   │
└───────────────┘   └───────────────┘   └───────────────┘
```

### 分层架构

系统采用清晰的分层设计：

```
┌──────────────────────────────────────────────┐
│         前端层 (Vue 3 SPA)                    │
│  ┌────────────────────────────────────────┐ │
│  │  组件层 (Components)                   │ │
│  │  - 表单组件                            │ │
│  │  - 管理组件                            │ │
│  │  - 展示组件                            │ │
│  └────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────┐ │
│  │  组合式函数 (Composables)              │ │
│  │  - useAuth                             │ │
│  │  - useToast                            │ │
│  └────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────┐ │
│  │  状态管理 (Stores)                     │ │
│  └────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
                      │
         HTTP/HTTPS API
                      │
┌──────────────────────────────────────────────┐
│         后端层 (Hono + Workers)              │
│  ┌────────────────────────────────────────┐ │
│  │  路由层 (Routes)                       │ │
│  │  - api.ts (公共路由)                   │ │
│  │  - admin/* (管理路由)                  │ │
│  └────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────┐ │
│  │  中间件层 (Middleware)                 │ │
│  │  - auth.ts (认证)                      │ │
│  │  - rateLimit.ts (限流)                 │ │
│  │  - validation.ts (验证)                │ │
│  └────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────┐ │
│  │  服务层 (Services)                     │ │
│  │  - dispatcher.ts (推送调度)            │ │
│  │  - push.ts (推送管理)                  │ │
│  │  - backup.ts (备份管理)                │ │
│  │  - 各渠道服务 (wework, dingtalk 等)    │ │
│  └────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────┐ │
│  │  工具层 (Utils)                        │ │
│  └────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
                      │
┌──────────────────────────────────────────────┐
│         数据层 (KV Storage)                   │
└──────────────────────────────────────────────┘
```

---

## 目录结构

```
bee-swarm/
├── src/                          # 后端源码
│   ├── index.ts                  # Workers 入口
│   ├── types.ts                  # Workers 特有类型
│   ├── middleware/               # 中间件
│   │   ├── auth.ts               # 认证中间件
│   │   ├── rateLimit.ts          # 限流中间件
│   │   ├── securityHeaders.ts    # 安全头中间件
│   │   └── validation.ts         # 请求验证中间件
│   ├── routes/                   # 路由
│   │   ├── api.ts                # 主 API 路由
│   │   └── admin/                # 管理路由
│   │       └── backup.ts         # 备份相关路由
│   ├── services/                 # 业务逻辑
│   │   ├── dispatcher.ts         # 推送调度器
│   │   ├── push.ts               # 推送服务
│   │   ├── backup.ts             # 备份服务
│   │   ├── metrics.ts            # 指标收集
│   │   ├── i18n.ts               # 国际化
│   │   ├── channels/             # 渠道实现
│   │   │   ├── base.ts           # 渠道基类
│   │   │   ├── slack.ts
│   │   │   ├── discord.ts
│   │   │   └── index.ts
│   │   ├── wework.ts
│   │   ├── dingtalk.ts
│   │   ├── feishu.ts
│   │   ├── telegram.ts
│   │   ├── bark.ts
│   │   ├── ntfy.ts
│   │   └── email.ts
│   └── utils/                    # 工具函数
│       ├── config.ts
│       ├── constants.ts
│       ├── errors.ts
│       ├── logger.ts
│       ├── password.ts
│       └── timezone.ts
├── types/                        # 共享类型定义
│   └── index.ts                  # 前后端通用类型
├── web/                          # 前端源码
│   ├── src/
│   │   ├── main.ts               # Vue 入口
│   │   ├── App.vue               # 根组件
│   │   ├── router.ts             # 路由配置
│   │   ├── api.ts                # API 客户端
│   │   ├── types.ts              # 前端类型
│   │   ├── views/                # 页面组件
│   │   │   ├── AdminPage.vue     # 管理后台主页面
│   │   │   └── ApiDocs.vue       # API 文档页面
│   │   ├── components/           # 可复用组件
│   │   │   ├── admin/            # 管理组件
│   │   │   ├── TemplateManager.vue
│   │   │   ├── GroupManager.vue
│   │   │   ├── ScheduledPushManager.vue
│   │   │   ├── StatsDashboard.vue
│   │   │   └── ...
│   │   ├── composables/          # 组合式函数
│   │   │   ├── useAuth.ts
│   │   │   └── useToast.ts
│   │   ├── stores/               # Pinia 状态管理
│   │   │   ├── loading.ts
│   │   │   └── theme.ts
│   │   └── i18n/                 # 国际化
│   │       └── index.ts
│   ├── public/                   # 静态资源
│   │   └── swagger-ui/           # Swagger UI
│   └── index.html
├── tests/                        # 测试
│   ├── middleware/
│   ├── utils/
│   └── types/
├── .github/workflows/            # GitHub Actions
├── public/openapi.json           # OpenAPI 规范
└── 配置文件
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── vitest.config.ts
    ├── wrangler.toml
    └── eslint.config.js
```

---

## 核心模块说明

### 1. 推送调度器 (dispatcher.ts)

**职责**:
- 管理渠道配置
- 调度推送任务
- 记录推送历史
- 管理渠道健康状态

**核心功能**:
- `loadUserChannelSettings()`: 加载用户渠道配置
- `saveUserChannelSetting()`: 保存渠道配置
- `dispatchPush()`: 执行推送
- `dispatchPushWithOptions()`: 带选项的推送（支持重试、超时）
- `getPushHistory()`: 获取推送历史
- `healthCheckChannel()`: 渠道健康检查

### 2. 推送服务 (push.ts)

**职责**:
- 管理推送模板
- 管理渠道分组
- 管理定时推送任务
- 收集推送统计

**核心功能**:
- `getTemplates()`, `saveTemplate()`: 模板 CRUD
- `getChannelGroups()`, `saveChannelGroup()`: 分组 CRUD
- `getScheduledPushes()`, `createScheduledPush()`: 定时任务管理
- `getPushStats()`: 获取统计数据

### 3. 备份服务 (backup.ts)

**职责**:
- 管理备份端点
- 执行备份和恢复
- 自动清理过期备份

**核心功能**:
- `getBackupEndpoints()`: 获取备份端点列表
- `saveBackupEndpoint()`: 保存备份端点
- `uploadBackupToEndpoint()`: 上传备份
- `restoreBackupFromEndpoint()`: 恢复备份
- `cleanupOldBackups()`: 清理旧备份

### 4. 中间件层

#### 认证中间件 (auth.ts)
- 支持两种认证方式:
  - API Key（用于机器调用）
  - Token（用于 Web 界面）
- 使用索引快速查找用户

#### 限流中间件 (rateLimit.ts)
- 基于 IP 的请求限流
- 默认 100 次/分钟

#### 验证中间件 (validation.ts)
- 使用 Zod 进行请求验证
- 验证请求体、查询参数等

### 5. 渠道实现

每个推送渠道都有独立的实现文件，遵循统一的模式：

```typescript
export async function sendXxx(
  payload: PushPayload,
  config: Record<string, string>
): Promise<ChannelResult> {
  // 1. 验证必需配置
  // 2. 构建请求
  // 3. 发送请求
  // 4. 处理响应
  // 5. 返回结果
}
```

---

## 数据存储

### KV 键命名规范

系统使用 Cloudflare KV 存储所有数据，键名遵循以下规范：

```
user:{email}                    # 用户基本信息
user:{email}:ch:{channel}:{key} # 渠道配置
user:{email}:push:{timestamp}   # 推送历史
user:{email}:template:{id}      # 推送模板
user:{email}:group:{id}         # 渠道分组
user:{email}:scheduled:{id}     # 定时推送任务
user:{email}:backup:{id}        # 备份端点配置
token_index:{token}             # Token -> 邮箱 索引
apikey_index:{apikey}           # API Key -> 邮箱 索引
backup_last_run:{email}:{id}    # 备份最后执行时间
scheduled_exec:{email}:{id}     # 定时任务执行标记
```

### 用户数据结构

```typescript
// user:{email}
{
  password: string;        // 哈希后的密码
  token?: string;          // 当前访问令牌
  refreshToken?: string;   // 刷新令牌
  expiresAt?: number;      // 过期时间戳
  apikey?: string;         // API Key
}
```

### 推送历史结构

```typescript
// user:{email}:push:{timestamp}
{
  id: string;
  time: string;
  title: string;
  body?: string;
  url?: string;
  imageUrl?: string;
  markdown?: boolean;
  channels: PushChannel[];
  results: ChannelResult[];
  status: 'success' | 'partial' | 'failed';
}
```

---

## 安全设计

### 1. 认证机制

**用户认证**:
- 密码使用 PBKDF2 + SHA-256 哈希，100,000 次迭代
- Token 基于 UUID 生成，有效期 7 天
- 支持 Refresh Token 机制

**API 认证**:
- 支持 API Key 方式
- API Key 使用索引快速查找
- 支持 Token 刷新

### 2. 数据保护

**敏感字段过滤**:
- 在返回用户配置前自动过滤敏感字段
- 敏感字段列表: secretAccessKey, password, secret, token, apiKey, privateKey, bot_token, chat_id, webhook_url, access_token

**Webhook URL 验证**:
- 只允许 http/https 协议
- 禁止内网地址（localhost, 127.0.0.1, 10.*, 192.168.* 等）
- 防止 SSRF 攻击

### 3. 安全头

系统自动添加以下安全 HTTP 头：
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Content-Security-Policy` (根据环境配置)

### 4. CORS 策略

- 开发环境允许 localhost
- 生产环境可通过 `ALLOWED_ORIGINS` 环境变量配置
- 支持通配符子域名（如 `*.example.com`）

---

## API 设计

### 认证流程

```
1. 注册 (POST /api/register)
   └─> 邮箱 + 密码

2. 登录 (POST /api/login)
   └─> 验证用户

3. 获取 Token (POST /api/token)
   └─> 返回 access_token + refresh_token

4. 使用 Token 访问管理 API
   └─> Header: X-Token: {token}
   或  └─> Query: ?token={token}

5. 刷新 Token (POST /api/refresh)
   └─> 使用 refresh_token 获取新 token
```

### 主要 API 端点

#### 公共端点
- `POST /api/register` - 用户注册
- `POST /api/login` - 用户登录
- `POST /api/token` - 获取访问令牌
- `POST /api/refresh` - 刷新令牌
- `GET /api/apikey` - 获取 API Key
- `POST /api/apikey` - 生成 API Key

#### 管理端点（需要认证）
- `GET /api/admin/channels` - 获取渠道配置
- `PUT /api/admin/channels/:id` - 保存渠道配置
- `POST /api/admin/push` - 发送推送
- `GET /api/admin/history` - 获取推送历史
- `DELETE /api/admin/history` - 清空推送历史
- `GET /api/admin/templates` - 模板管理
- `GET /api/admin/groups` - 分组管理
- `GET /api/admin/scheduled` - 定时任务管理
- `GET /api/admin/stats` - 统计数据
- `GET /api/admin/channels/health` - 渠道健康检查
- `POST /api/admin/webhook/push` - Webhook 触发推送
- `GET /api/admin/webhook/url` - 获取 Webhook URL
- `GET /api/admin/backup/*` - 备份管理

### API 文档

完整的 OpenAPI 规范位于 `/public/openapi.json`，可通过 `/api-docs` 访问 Swagger UI。

---

## 部署架构

### Cloudflare Workers 部署

系统完全运行在 Cloudflare Workers 上，具有以下优势：
- 全球边缘节点，低延迟
- 自动扩容
- 无需管理服务器
- 与 Cloudflare 生态系统深度集成

### 部署架构图

```
                    ┌─────────────────────────┐
                    │   GitHub Repository     │
                    └───────────┬─────────────┘
                                │
                                │ Push
                                ▼
                    ┌─────────────────────────┐
                    │  GitHub Actions CI/CD   │
                    │  - 运行测试             │
                    │  - 构建前端             │
                    │  - 部署到 Workers       │
                    └───────────┬─────────────┘
                                │
                                │ Deploy
                                ▼
                    ┌─────────────────────────┐
                    │  Cloudflare Workers     │
                    │  ┌───────────────────┐  │
                    │  │   Worker 脚本     │  │
                    │  └───────────────────┘  │
                    │  ┌───────────────────┐  │
                    │  │   KV Namespace    │  │
                    │  └───────────────────┘  │
                    └───────────┬─────────────┘
                                │
                    ┌───────────┴─────────────┐
                    │                         │
                    ▼                         ▼
            ┌───────────────┐       ┌───────────────┐
            │  用户访问      │       │  Cron 触发器  │
            │  (Web/API)    │       │  (定时任务)   │
            └───────────────┘       └───────────────┘
```

### 环境变量

**Secrets** (通过 wrangler secret 配置):
- `ADMIN_PASSWORD` - 旧版管理员密码（兼容）

**Vars** (通过 wrangler.toml 配置):
- `ALLOWED_ORIGINS` - 允许的 CORS 来源

---

## 扩展指南

### 添加新的推送渠道

1. 在 `src/services/` 创建新文件 `{channel}.ts`
2. 实现发送函数:
   ```typescript
   export async function sendXxx(
     payload: PushPayload,
     config: Record<string, string>
   ): Promise<ChannelResult> {
     // 实现
   }
   ```
3. 在 `src/services/dispatcher.ts` 中:
   - 添加到 `CHANNEL_DEFINITIONS`
   - 添加到 `sendToChannel()` 函数
4. 在前端添加相应的 UI 组件

### 自定义限流策略

修改 `src/middleware/rateLimit.ts` 中的配置或实现自定义的限流逻辑。

### 添加新的备份存储类型

1. 在 `types/index.ts` 中扩展 `EndpointType` 和相关接口
2. 在 `src/services/backup.ts` 中添加新的实现
3. 在前端添加相应的配置界面

---

## 性能优化建议

1. **KV 读取优化**
   - 使用批量读取减少请求次数
   - 考虑使用 Cache API 缓存热点数据

2. **推送优化**
   - 渠道推送并行执行
   - 合理设置超时和重试策略

3. **前端优化**
   - 使用 Vue 的虚拟滚动处理大量历史记录
   - 实现数据懒加载
   - 添加前端缓存

4. **监控和告警**
   - 添加推送失败告警
   - 监控渠道健康状态
   - 记录性能指标

---

## 故障排查

### 常见问题

1. **推送失败**
   - 检查渠道配置是否正确
   - 查看推送历史中的错误信息
   - 验证网络连接

2. **定时任务不执行**
   - 确认 Cron 触发器配置正确
   - 检查任务状态是否为 pending
   - 查看 Workers 日志

3. **认证失败**
   - 确认 Token 未过期
   - 检查密码是否正确
   - 查看 KV 中的用户数据

---

*文档版本: 1.0*  
*最后更新: 2024-05-30*
