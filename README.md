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

## 📁 项目架构

```
web-push/
├── web/                          # Vue 前端项目
│   ├── index.html                # 入口 HTML
│   └── src/
│       ├── main.ts               # Vue 入口
│       ├── App.vue               # 根组件
│       ├── router.ts             # 路由配置
│       ├── api.ts                # API 封装
│       ├── types.ts              # 前端类型
│       └── views/
│           ├── SubscribePage.vue # 订阅页面
│           └── AdminPage.vue     # 管理后台
│
├── src/                          # Workers 后端
│   ├── index.ts                  # Workers 入口
│   ├── types.ts                  # 后端类型
│   ├── routes/
│   │   └── api.ts                # API 路由
│   └── services/                 # 推送服务（8 个渠道）
│       ├── dispatcher.ts         # 推送调度器
│       ├── webpush.ts            # 浏览器推送
│       ├── wework.ts             # 企业微信
│       ├── dingtalk.ts           # 钉钉
│       ├── feishu.ts             # 飞书
│       ├── telegram.ts           # Telegram
│       ├── bark.ts               # Bark
│       ├── ntfy.ts               # ntfy
│       └── email.ts              # Email
│
├── vite.config.ts                # Vite 配置
├── wrangler.toml                 # Workers 配置（不含敏感信息）
├── .dev.vars.example             # 本地环境变量模板
└── package.json
```

## 📡 支持的推送渠道

| 渠道 | 说明 | 费用 |
|------|------|------|
| 🔔 Web Push | 浏览器推送 | 免费 |
| 💼 企业微信 | 群机器人 | 免费 |
| 💬 钉钉 | 群机器人（支持加签） | 免费 |
| 🪶 飞书 | 群机器人 | 免费 |
| ✈️ Telegram | Bot API | 免费 |
| 🐕 Bark | iOS 推送 | 免费 |
| 📢 ntfy | 开源推送服务 | 免费 |
| 📧 Email | Resend（100封/天） | 免费 |

## 🚀 快速开始

### 方式一：GitHub Actions 自动部署（推荐）

**Fork 者只需 2 步，零配置部署：**

1. **获取 Cloudflare 凭证**
   - 访问 https://dash.cloudflare.com/profile/api-tokens
   - 创建 Token，权限：`Account:Cloudflare Workers:Edit`、`Account:Account:Read`
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
   - ✅ 生成 VAPID 密钥对
   - ✅ 创建 KV 命名空间
   - ✅ 生成随机管理密码
   - ✅ 构建并部署

   **查看部署日志获取管理密码：** Actions → Deploy → 点击最新运行记录

### 方式二：本地开发

```bash
# 1. 安装依赖
npm install

# 2. 配置本地环境
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars 填写密码和 VAPID 密钥

# 3. 本地开发
npm run dev:worker  # 终端 1：Workers 后端
npm run dev         # 终端 2：Vite 前端
```

访问 `http://localhost:5173`

### 方式三：手动部署

```bash
# 1. 登录 Cloudflare
npx wrangler login

# 2. 设置 Secrets
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put KV_NAMESPACE_ID

# 3. 部署
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

# 设置 VAPID 密钥（Web Push 必需）
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
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
