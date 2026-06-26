# 蜂群 (Bee Swarm) 🐝

> 多渠道推送通知系统 | Multi-channel notification system

基于 **Vite + Vue 3 + Hono + Cloudflare Workers** 构建，如蜂群般高效协作，使命必达。

## 🛠 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | Vue 3 + Vite + TypeScript | Composition API + 类型安全 |
| UI | 自定义组件 + ECharts | 深色/浅色主题，数据可视化 |
| 路由 | Vue Router | SPA 路由 |
| 状态 | Pinia | 全局状态管理 |
| 后端 | Hono | 轻量高性能 Web 框架 |
| 部署 | Cloudflare Workers | 边缘计算，全球 CDN |
| 数据库 | Cloudflare D1 | SQLite 兼容，自动迁移 |
| 存储 | Cloudflare R2 | 文件/头像/备份存储 |
| 队列 | Cloudflare Queues | 异步推送任务 |
| 认证 | 密码 + TOTP 2FA | 双因素认证保护 |
| 定时 | Cloudflare Cron | 每 5 分钟自动执行 |

## 📁 项目架构

```
bee-swarm/
├── web/                              # Vue 3 前端
│   └── src/
│       ├── api.ts                    # API 封装
│       ├── i18n/index.ts             # 国际化（中文/英文）
│       ├── views/AdminPage.vue       # 管理后台主页面
│       └── components/
│           ├── StatsDashboard.vue    # 统计仪表盘
│           ├── GroupManager.vue      # 渠道分组管理
│           ├── ScheduledPushManager  # 定时推送管理
│           ├── TemplateManager.vue   # 推送模板管理
│           ├── WebhookManager.vue    # Webhook 管理
│           └── admin/                # 23 个子组件
│
├── src/                              # Workers 后端
│   ├── index.ts                      # 入口 + Cron 调度
│   ├── routes/api.ts                 # 全部 API 路由
│   ├── middleware/                    # 认证/限流/缓存
│   ├── services/
│   │   ├── dispatcher.ts             # 推送调度器
│   │   ├── push.ts                   # 推送核心服务
│   │   ├── backup.ts                 # 数据备份恢复
│   │   ├── aiAgentService.ts         # AI 助手
│   │   ├── metrics.ts                # 推送指标收集
│   │   └── channels/                 # 16 个推送渠道
│   └── utils/                        # 工具函数
│
├── migrations/                       # D1 数据库迁移（8 个）
└── wrangler.toml                     # Workers 配置
```

## 📡 支持的推送渠道（16 个）

| 渠道 | 说明 | 费用 |
|------|------|------|
| 💼 企业微信 | 群机器人 | 免费 |
| 💬 钉钉 | 群机器人（支持加签） | 免费 |
| 🪶 飞书 | 群机器人 | 免费 |
| ✈️ Telegram | Bot API | 免费 |
| 📱 Bark | iOS 推送 | 免费 |
| 📢 ntfy | 开源推送服务 | 免费 |
| 📧 Email | SMTP 邮件 | 免费 |
| 💬 Slack | 群机器人 | 免费 |
| 🎮 Discord | 群机器人 | 免费 |
| 🔔 Server酱 | 微信推送 | 免费 |
| ➕ PushPlus | 微信推送 | 免费 |
| 🔗 通用 Webhook | 自定义 HTTP | 免费 |
| 🔔 Gotify | 自建推送服务 | 免费 |
| 💬 LINE Notify | LINE 推送 | 免费 |
| 🤝 Microsoft Teams | 群机器人 | 免费 |
| 🔔 Pushover | 全平台推送 | 付费 |

## ✨ 功能特性

### 推送管理
- **即时推送** — 支持 16 个渠道并发送达
- **定时推送** — 支持单次/重复（每小时/天/周/月/年）/Cron 表达式
- **渠道分组** — 将渠道分组，一键发送到整组
- **批量发送** — 选择多个分组同时推送
- **推送模板** — 保存常用推送内容，支持变量替换
- **推送预览** — 发送前按渠道预览消息样式
- **草稿箱** — 未完成的推送可保存为草稿
- **收藏夹** — 收藏常用推送内容快速复用
- **推送撤销** — 撤销已发送的推送记录
- **版本对比** — 对比两条推送记录的差异

### 数据与分析
- **推送统计** — 成功率、趋势图、渠道分布
- **成功率趋势** — 按天统计推送成功率变化
- **渠道延迟** — 各渠道响应时间分布
- **性能指标** — P50/P95/P99 延迟
- **执行日志** — 记录每次推送的详细执行过程

### 安全与管理
- **双因素认证** — TOTP 2FA（Google/Microsoft Authenticator）
- **IP 白名单** — 限制登录 IP，支持 CIDR 格式
- **用户管理** — 多用户支持（admin/user/viewer 角色）
- **审计日志** — 记录所有操作行为
- **登录防护** — 暴力破解检测，5 次失败锁定 15 分钟
- **邮箱验证** — 注册时邮箱验证码验证
- **密码重置** — 通过邮件重置密码

### 系统运维
- **数据备份** — 支持 S3/WebDAV/R2 存储，定时自动备份
- **数据库管理** — 表统计、清理、归档
- **系统健康** — 实时监控数据库/队列/用户/推送状态
- **数据导出** — JSON/CSV 格式导出推送历史
- **AI 助手** — 内置 AI 对话，自然语言查询统计数据

### 国际化
- **中英文切换** — 完整的 i18n 支持
- **深色/浅色主题** — 跟随系统或手动切换

## 🚀 快速开始

### 方式一：GitHub Actions 自动部署（推荐）

**Fork 者只需 2 步：**

1. **获取 Cloudflare 凭证**
   - 访问 https://dash.cloudflare.com/profile/api-tokens
   - 创建 Token，权限：`Account:Cloudflare Workers:Edit`、`Account:D1:Edit`
   - 复制 Account ID

2. **设置 GitHub Secrets**
   - 仓库 → Settings → Secrets → Actions
   - 添加：`CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`

3. **推送代码，自动部署**
   ```bash
   git push origin main
   ```

### 方式二：本地开发

```bash
# 安装依赖
npm install

# 创建本地 D1 数据库
npx wrangler d1 create bee-swarm-db --local

# 执行数据库迁移
npx wrangler d1 migrations apply bee-swarm-db --local

# 配置环境变量
cp .dev.vars.example .dev.vars

# 启动开发
npm run dev:worker  # 终端 1：后端
npm run dev         # 终端 2：前端
```

访问 `http://localhost:5173`

### 方式三：手动部署

```bash
npx wrangler login
npx wrangler d1 create bee-swarm-db
npx wrangler d1 migrations apply bee-swarm-db
npm run deploy
```

## 🔐 安全设计

| 场景 | 方式 | 说明 |
|------|------|------|
| 用户认证 | 邮箱 + 密码 + JWT | 注册即用，密码哈希存储 |
| 双因素认证 | TOTP 2FA | Google/Microsoft Authenticator |
| IP 白名单 | 登录时检查 IP | 支持 CIDR 格式 |
| 暴力破解防护 | 限流 + 锁定 | 5 次失败锁定 15 分钟 |
| 推送渠道 | `wrangler.toml` [vars] | 非敏感配置 |
| SMTP 邮件 | `wrangler secret` | Cloudflare 云端加密存储 |
| 数据安全 | 备份 + 审计日志 | 可追溯可恢复 |

## 🔌 API 接口

```bash
# 发送推送（API Key 认证）
curl -X POST "https://你的域名/api/admin/push" \
  -H "X-Token: 你的API-Key" \
  -H "Content-Type: application/json" \
  -d '{"title":"告警","body":"CPU 超过 90%","channels":["wework","telegram"]}'

# 发送推送（密码认证）
curl -X POST "https://你的域名/api/admin/push?password=密码" \
  -H "Content-Type: application/json" \
  -d '{"title":"告警","body":"CPU 超过 90%","channels":["wework","telegram"]}'
```

## 📊 数据库表

| 表名 | 用途 |
|------|------|
| `users` | 用户账户（密码/2FA/白名单/头像） |
| `push_templates` | 推送模板 |
| `push_history` | 推送历史记录 |
| `push_drafts` | 推送草稿 |
| `push_favorites` | 推送收藏夹 |
| `push_execution_logs` | 推送执行日志 |
| `scheduled_pushes` | 定时推送任务 |
| `channel_groups` | 渠道分组 |
| `scheduled_locks` | 定时任务锁 |
| `audit_logs` | 审计日志 |
| `metrics` | 推送指标 |
| `backup_runs` | 备份记录 |
| `backup_endpoints` | 备份端点配置 |
| `system_settings` | 系统设置 |

## 📝 环境变量

### 可选配置（使用 Secrets）

```bash
# 管理员邮箱（指定该邮箱注册时自动获得管理员角色）
npx wrangler secret put ADMIN_EMAIL

# SMTP 邮件配置（密码重置功能）
npx wrangler secret put SMTP_HOST
npx wrangler secret put SMTP_PORT
npx wrangler secret put SMTP_USERNAME
npx wrangler secret put SMTP_PASSWORD
npx wrangler secret put MAIL_FROM
```

### 非敏感配置（wrangler.toml）

```toml
[vars]
# 企业微信
WEWORK_WEBHOOK_URL = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx"

# 钉钉
DINGTALK_WEBHOOK_URL = "https://oapi.dingtalk.com/robot/send?access_token=xxx"
DINGTALK_SECRET = "SECxxx"

# 飞书
FEISHU_WEBHOOK_URL = "https://open.feishu.cn/open-apis/bot/v2/hook/xxx"

# Telegram
TELEGRAM_BOT_TOKEN = "123456:ABC"
TELEGRAM_CHAT_ID = "你的ChatID"

# Bark (iOS)
BARK_KEY = "你的key"

# ntfy
NTFY_TOPIC = "your-topic"

# Email (SMTP)
SMTP_HOST = "smtp.example.com"
SMTP_PORT = "465"
SMTP_USERNAME = "user@example.com"
SMTP_PASSWORD = "password"
SMTP_FROM = "noreply@yourdomain.com"
```

## 🎯 开发优势

- **单一部署** — 前端构建产物嵌入 Workers，零运维
- **边缘计算** — 全球 CDN 加速，毫秒级响应
- **自动迁移** — 启动时自动检测并执行数据库迁移
- **TypeScript** — 前后端类型共享，减少 bug
- **i18n** — 中英文一键切换
- **深色模式** — 跟随系统或手动切换
- **响应式** — 支持移动端访问
