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
├── wrangler.toml                 # Workers 配置
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

### 1. 安装依赖

```bash
cd web-push
npm install
```

### 2. 本地开发

```bash
# 终端 1：启动 Workers 后端
npm run dev:worker

# 终端 2：启动 Vite 前端（带 HMR）
npm run dev
```

访问 `http://localhost:5173`

### 3. 部署到 Cloudflare

```bash
# 生成 VAPID 密钥
npm run generate-keys
# 将输出填入 wrangler.toml

# 创建 KV 命名空间
npx wrangler kv:namespace create "SUBSCRIPTIONS"
# 将返回的 id 填入 wrangler.toml

# 修改管理密码
# 编辑 wrangler.toml 中的 ADMIN_PASSWORD

# 配置推送渠道（可选）
# 编辑 wrangler.toml 填写各渠道的 Webhook/Token

# 部署
npm run deploy
```

## 📝 配置说明

编辑 `wrangler.toml`：

```toml
[vars]
ADMIN_PASSWORD = "你的密码"          # 必改！

# Web Push（运行 npm run generate-keys 生成）
VAPID_PUBLIC_KEY = "..."
VAPID_PRIVATE_KEY = "..."

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
