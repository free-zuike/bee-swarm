# 蜂群 (Bee Swarm) 🐝

> 多渠道推送通知系统 | Multi-channel notification system

基于 **Vite + Vue 3 + Hono + Cloudflare Workers** 构建，如蜂群般高效协作，使命必达。

## 🛠 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | Vue 3 + Vite | 开发体验极佳，HMR 热更新 |
| 路由 | Vue Router | SPA 路由 |
| 状态 | Pinia | 全局状态管理 |
| 后端 | Hono | 轻量高性能 Web 框架 |
| 部署 | Cloudflare Workers | 边缘计算，单一部署 |
| 数据库 | Cloudflare D1 | 轻量 SQLite 数据库 |
| **KV 存储** | **Cloudflare KV** | **分布式限流** |
| **向量搜索** | **Cloudflare Vectorize** | **模板智能推荐** |
| **持久化** | **Durable Objects** | **健康追踪、分布式锁** |
| **分析** | **Cloudflare Analytics Engine** | **推送统计分析** |

## 📁 项目架构

```
bee-swarm/
├── web/                          # Vue 前端项目
│   ├── index.html                # 入口 HTML
│   └── src/
│       ├── main.ts               # Vue 入口
│       ├── App.vue               # 根组件
│       ├── router.ts             # 路由配置
│       ├── api.ts                # API 封装
│       ├── types.ts              # 前端类型
│       └── views/
│           └── AdminPage.vue     # 管理后台
│
├── src/                          # Workers 后端
│   ├── index.ts                  # Workers 入口
│   ├── types.ts                  # 后端类型
│   ├── routes/
│   │   └── api.ts                # API 路由
│   └── services/                 # 推送服务（多个渠道）
│       ├── dispatcher.ts         # 推送调度器
│       ├── push.ts               # 推送服务
│       ├── wework.ts             # 企业微信
│       ├── dingtalk.ts           # 钉钉
│       ├── feishu.ts             # 飞书
│       ├── telegram.ts           # Telegram
│       ├── bark.ts               # Bark
│       ├── ntfy.ts               # ntfy
│       ├── email.ts              # Email
│       └── channels/             # 其他渠道
│
├── migrations/                   # D1 数据库迁移
│   ├── 0001_add_kv_replacement_tables.sql
│   ├── 0002_add_user_refresh_token_fields.sql
│   └── 0003_add_overdue_reminder_field.sql
│
├── vite.config.ts                # Vite 配置
├── wrangler.toml                 # Workers 配置（不含敏感信息）
├── .dev.vars.example             # 本地环境变量模板
└── package.json
```

## 📡 支持的推送渠道

| 渠道 | 说明 | 费用 |
|------|------|------|
| 💼 企业微信 | 群机器人 | 免费 |
| 💬 钉钉 | 群机器人（支持加签） | 免费 |
| 🪶 飞书 | 群机器人 | 免费 |
| ✈️ Telegram | Bot API | 免费 |
| 📱 Bark | iOS 推送 | 免费 |
| 📢 ntfy | 开源推送服务 | 免费 |
| 📧 Email | Resend（100封/天） | 免费 |
| 💬 Slack | 群机器人 | 免费 |
| 🎮 Discord | 群机器人 | 免费 |
| 🔔 Server酱 | 微信推送 | 免费 |
| ➕ PushPlus | 微信推送 | 免费 |
| 🔗 通用 Webhook | 自定义 Webhook | 免费 |
| 🔔 Gotify | 自建推送服务 | 免费 |
| 💬 LINE Notify | LINE 推送 | 免费 |
| 🤝 Microsoft Teams | 群机器人 | 免费 |
| 🔔 Pushover | 全平台推送 | 付费（有试用期） |

## 🚀 快速开始

### 方式一：GitHub Actions 自动部署（推荐）

**Fork 者只需 2 步，零配置部署：**

1. **获取 Cloudflare 凭证**
   - 访问 https://dash.cloudflare.com/profile/api-tokens
   - 创建 Token，权限：`Account:Cloudflare Workers:Edit`、`Account:Account:Read`、`Account:D1:Edit`
   - 访问 https://dash.cloudflare.com，复制右侧 **Account ID**

2. **设置 GitHub Secrets**
   - 打开 Fork 的仓库 → Settings → Secrets and variables → Actions
   - 添加 2 个 Secrets：

   | Secret Name | Value |
   |-------------|-------|
   | `CLOUDFLARE_API_TOKEN` | 你的 API Token |
   | `CLOUDFLARE_ACCOUNT_ID` | 你的 Account ID |

3. **推送代码，自动完成部署**
   ```bash
   git push origin main
   ```

   Workflow 会自动：
   - ✅ 创建 D1 数据库
   - ✅ 执行数据库迁移
   - ✅ 构建并部署

   **查看部署日志获取更多信息：** Actions → Deploy → 点击最新运行记录

### 方式二：本地开发

```bash
# 1. 安装依赖
npm install

# 2. 创建本地 D1 数据库
npx wrangler d1 create bee-swarm-db --local

# 3. 执行数据库迁移
npx wrangler d1 migrations apply bee-swarm-db --local

# 4. 配置本地环境
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars 配置环境变量

# 5. 本地开发
npm run dev:worker  # 终端 1：Workers 后端
npm run dev         # 终端 2：Vite 前端
```

访问 `http://localhost:5173`

### 方式三：手动部署

```bash
# 1. 登录 Cloudflare
npx wrangler login

# 2. 创建 D1 数据库
npx wrangler d1 create bee-swarm-db

# 3. 执行数据库迁移
npx wrangler d1 migrations apply bee-swarm-db

# 4. 部署
npm run deploy
```

## 🔐 安全配置

本项目使用 **双重安全策略**：

| 场景 | 方式 | 说明 |
|------|------|------|
| **本地开发** | `.dev.vars` 文件 | 已加入 `.gitignore`，不会提交 |
| **生产部署** | `wrangler secret` | 存储在 Cloudflare 云端，代码中不可见 |
| **推送渠道配置** | `wrangler.toml` [vars] | 非敏感信息（Webhook URL 等） |

**⚠️ 警告**：永远不要将密码、密钥直接写入 `wrangler.toml` 或提交到 Git！

## 📝 配置说明

### 敏感配置（使用 Secrets）

```bash
# 设置管理密码
npx wrangler secret put ADMIN_PASSWORD
```

### 非敏感配置（wrangler.toml）

```toml
[vars]
# 企业微信
WEWORK_WEBHOOK_URL = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx"

# 钉钉
DINGTALK_WEBHOOK_URL = "https://oapi.dingtalk.com/robot/send?access_token=xxx"
DINGTALK_SECRET = "SECxxx"          # 可选

# 飞书
FEISHU_WEBHOOK_URL = "https://open.feishu.cn/open-apis/bot/v2/hook/xxx"

# Telegram
TELEGRAM_BOT_TOKEN = "123456:ABC"
TELEGRAM_CHAT_ID = "你的ChatID"

# Bark (iOS)
BARK_KEY = "你的key"

# ntfy
NTFY_TOPIC = "your-topic"

# Email (Resend)
RESEND_API_KEY = "re_xxx"
EMAIL_FROM = "noreply@yourdomain.com"
EMAIL_TO = "recipient@example.com"
```

## 🔌 API 接口

```bash
# 发送推送
curl -X POST "https://你的域名/api/admin/push?password=密码" \
  -H "Content-Type: application/json" \
  -d '{"title":"告警","body":"CPU 超过 90%","channels":["wework","telegram"]}'
```

## 🎯 开发优势

- **Vite HMR**：前端修改即时生效，无需刷新
- **Vue 3 Composition API**：逻辑复用更简单
- **TypeScript**：前后端类型共享
- **单一部署**：前端构建产物嵌入 Workers，无需单独部署
- **安全设计**：敏感信息使用 Secrets，不会泄露
- **D1 数据库**：使用 SQLite，支持事务和索引，查询性能优秀
- **完善的密码策略**：要求密码包含大小写字母和数字
- **超时任务提醒**：定时任务超时时会自动发送提醒

## 📚 更多文档

- [架构设计](./docs/architecture.md)
- [配置指南](./docs/configuration.md)

## ☁️ Cloudflare 服务增强（可选，完全免费）

我们已集成了多个 Cloudflare 免费服务，进一步增强系统功能：

| 功能 | Cloudflare 服务 | 免费额度 | 说明 |
|------|----------------|---------|------|
| 分布式限流 | KV 存储 | 100,000 读/天，1,000 写/天 | 跨 Workers 实例统一限流 |
| 智能推荐 | Vectorize + Workers AI | 30,000,000 向量维度/月 | 模板语义搜索和智能推荐 |
| 健康追踪 | Durable Objects | 1,000,000 请求/月 | 持久化健康检查数据 |
| 分布式锁 | Durable Objects | 1,000,000 请求/月 | 防重复执行的分布式锁 |
| 数据分析 | Analytics Engine + D1 | 10,000,000 数据点/月 | 推送统计收集和分析 |
| 安全增强 | 定制中间件 | - | 暴力破解防护、IP 信誉检查 |

### 启用步骤

所有服务都是**可选启用**的，默认情况下会优雅降级：

1. 创建所需的 Cloudflare 资源（详见文档）
2. 更新 `wrangler.toml` 配置
3. 部署后即可使用

### 相关文档

- [Cloudflare 服务使用指南](./docs/CLOUDFLARE_SERVICES.md) - 详细说明和配置步骤
- [Cloudflare API 文档](./docs/CLOUDFLARE_API.md) - 新增 API 端点说明
- [集成总结](./docs/CLOUDFLARE_INTEGRATION_SUMMARY.md) - 架构和功能概述
- [完整总结](./docs/CLOUDFLARE_COMPLETE_SUMMARY.md) - 项目完成报告

### 新增 API 端点

所有端点路径以 `/api/cloudflare` 开头，需要认证：

- 健康检查：`POST /health/check`, `GET /health/summary`
- 模板搜索：`GET /templates/search`, `GET /templates/recommend/:id`, `POST /templates/embed`
- 数据分析：`GET /analytics/summary`, `GET /analytics/trend`, `POST /analytics/push`
- 分布式锁：`POST /lock/acquire`, `POST /lock/release`
- 服务状态：`GET /status`

详细文档请查看 [Cloudflare API 文档](./docs/CLOUDFLARE_API.md)。
