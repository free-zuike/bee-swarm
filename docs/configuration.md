# 蜂群 (Bee Swarm) 配置管理文档

## 目录
- [环境配置](#环境配置)
- [推送渠道配置](#推送渠道配置)
- [备份端点配置](#备份端点配置)
- [安全配置](#安全配置)
- [部署配置](#部署配置)

---

## 环境配置

### 开发环境配置

复制 `.dev.vars.example` 为 `.dev.vars` 并填入相应的值：

```bash
cp .dev.vars.example .dev.vars
```

`.dev.vars` 文件格式：

```env
# 管理员密码（旧版兼容，建议使用用户注册）
ADMIN_PASSWORD=your_secure_password_here

# Web Push VAPID 密钥对（如不需要 Web Push 可忽略）
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=

# 允许的 CORS 来源（可选，逗号分隔）
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# 日志级别（可选）
LOG_LEVEL=info
```

### 生成 VAPID 密钥

如果需要使用 Web Push 功能，需要生成 VAPID 密钥对：

```bash
# 使用项目提供的脚本
npm run generate-keys

# 或使用 openssl 手动生成
openssl ecparam -name prime256v1 -genkey -noout -out vapid_private.pem
openssl ec -in vapid_private.pem -pubout -out vapid_public.pem
# 然后将内容转换为 base64 格式填入配置
```

---

## 推送渠道配置

系统支持以下推送渠道，每个渠道都有独立的配置项：

### 1. 企业微信 (wework)

**配置项**:
- `webhook_url` (必填): 企业微信群机器人 Webhook URL

**获取方式**:
1. 在企业微信群中添加群机器人
2. 复制 Webhook URL

**示例**:
```
https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### 2. 钉钉 (dingtalk)

**配置项**:
- `webhook_url` (必填): 钉钉群机器人 Webhook URL
- `secret` (可选): 加签密钥（安全设置）

**获取方式**:
1. 在钉钉群中添加自定义机器人
2. 复制 Webhook URL
3. （可选）在安全设置中启用加签，复制密钥

**示例**:
```
Webhook URL: https://oapi.dingtalk.com/robot/send?access_token=xxxxxxxxxxxxxxxxxxxxxxxx
Secret: SECxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. 飞书 (feishu)

**配置项**:
- `webhook_url` (必填): 飞书群机器人 Webhook URL

**获取方式**:
1. 在飞书群中添加自定义机器人
2. 复制 Webhook URL

**示例**:
```
https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### 4. Telegram (telegram)

**配置项**:
- `bot_token` (必填): Telegram Bot Token
- `chat_id` (必填): 目标 Chat ID

**获取方式**:
1. 与 @BotFather 对话创建 Bot，获取 Token
2. 将 Bot 添加到目标群组/频道
3. 使用 @userinfobot 获取 Chat ID，或调用 API `https://api.telegram.org/bot<token>/getUpdates`

**示例**:
```
Bot Token: 123456789:ABCdefGhIJKlmNoPQRStuVWxyZ
Chat ID: -1001234567890
```

### 5. Bark (bark)

**配置项**:
- `key` (必填): Bark Key
- `server` (可选): Bark 服务器地址，默认为 `https://api.day.app`

**获取方式**:
1. 在 App Store 安装 Bark App
2. 打开 App 获取 Key
3. （可选）自建 Bark 服务器

**示例**:
```
Key: xxxxxxxxxxxxxxxxxxxxxxxx
Server: https://api.day.app
```

### 6. ntfy (ntfy)

**配置项**:
- `topic` (必填): ntfy 主题名称
- `server` (可选): ntfy 服务器地址，默认为 `https://ntfy.sh`

**获取方式**:
1. 在 ntfy.sh 注册或使用自建服务器
2. 创建主题

**示例**:
```
Topic: my-personal-alerts
Server: https://ntfy.sh
```

### 7. Email (email)

**配置项**:
- `api_key` (必填): Resend API Key
- `from` (必填): 发件人邮箱
- `to` (必填): 收件人邮箱（多个用逗号分隔）

**获取方式**:
1. 注册 [Resend](https://resend.com) 账号
2. 验证域名（可选，推荐）
3. 获取 API Key

**示例**:
```
API Key: re_xxxxxxxxxxxxxxxxxxxxxxxx
From: alerts@example.com
To: user1@example.com,user2@example.com
```

### 8. Slack (slack)

**配置项**:
- `webhook_url` (必填): Slack Incoming Webhook URL

**获取方式**:
1. 创建 Slack App
2. 启用 Incoming Webhooks
3. 添加新 Webhook 到工作区
4. 复制 Webhook URL

**示例**:
```
https://hooks.slack.com/services/[YOUR_TEAM_ID]/[YOUR_BOT_ID]/[YOUR_TOKEN]
```

### 9. Discord (discord)

**配置项**:
- `webhook_url` (必填): Discord Webhook URL
- `username` (可选): 自定义机器人名称
- `avatar_url` (可选): 自定义头像 URL

**获取方式**:
1. 在 Discord 服务器设置中创建 Webhook
2. 复制 Webhook URL

**示例**:
```
Webhook URL: https://discord.com/api/webhooks/1234567890/abcdefghijklmnopqrstuvwxyz
Username: Bee Swarm Alerts
Avatar URL: https://example.com/avatar.png
```

### 10. Web Push (webpush)

**配置项**:
- 需要通过前端页面订阅
- 浏览器会生成订阅信息

---

## 备份端点配置

系统支持多种备份存储类型，可配置多个备份端点。

### S3 兼容存储 (s3)

**配置项**:
- `endpoint` (必填): S3 服务端点
- `access_key_id` (必填): Access Key ID
- `secret_access_key` (必填): Secret Access Key
- `bucket` (必填): 存储桶名称
- `region` (必填): 区域
- `path` (可选): 存储路径前缀，默认为 `bee-swarm-backups/`
- `path_style` (可选): 是否使用路径风格，默认为 `false`

**支持的 S3 兼容服务**:
- AWS S3
- Cloudflare R2
- 阿里云 OSS
- 腾讯云 COS
- 七牛云
- MinIO
- 等等

**Cloudflare R2 示例**:
```
Endpoint: https://<account-id>.r2.cloudflarestorage.com
Access Key ID: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Secret Access Key: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Bucket: bee-swarm-backups
Region: auto
Path: bee-swarm-backups/
Path Style: true
```

**MinIO 示例**:
```
Endpoint: https://minio.example.com
Access Key ID: minioadmin
Secret Access Key: minioadmin
Bucket: bee-swarm
Region: us-east-1
Path: backups/
Path Style: true
```

### WebDAV (webdav)

**配置项**:
- `url` (必填): WebDAV 服务器 URL
- `username` (必填): 用户名
- `password` (必填): 密码
- `path` (可选): 存储路径，默认为 `bee-swarm-backups/`

**支持的 WebDAV 服务**:
- Nextcloud
- ownCloud
- NAS 设备（群晖、威联通等）
- 等等

**Nextcloud 示例**:
```
URL: https://nextcloud.example.com/remote.php/dav/files/username/
Username: your_username
Password: your_password
Path: BeeSwarmBackups/
```

### 备份调度配置

每个备份端点可配置自动备份调度：

- `enabled`: 是否启用自动备份
- `interval`: 备份间隔（小时），支持:
  - 1, 2, 4, 6, 12, 24 (每天)
  - 168 (每周)
  - 720 (每月，30天)
- `start_time`: 开始时间（HH:MM 格式，24小时制）
- `timezone`: 时区，默认为 `Asia/Shanghai`
- `start_day`: 每周备份的星期几（0-6，0=周日，仅适用于周期间隔）

**示例配置**:

每天凌晨 2 点备份:
```
Enabled: true
Interval: 24 小时
Start Time: 02:00
Timezone: Asia/Shanghai
```

每周日凌晨 3 点备份:
```
Enabled: true
Interval: 168 小时 (每周)
Start Time: 03:00
Timezone: Asia/Shanghai
Start Day: 0
```

每 6 小时备份一次:
```
Enabled: true
Interval: 6 小时
Start Time: 00:00
Timezone: Asia/Shanghai
```

### 备份保留策略

配置保留的备份数量，超过数量的旧备份会被自动清理：

- `retention`: 保留备份数量，默认为 10

---

## 安全配置

### 密码安全

- 用户密码使用 PBKDF2 + SHA-256 哈希，100,000 次迭代
- 旧版 SHA-256 密码会在首次登录时自动升级为 PBKDF2

### API Key 安全

- API Key 使用 UUID 生成，无规则可循
- API Key 有独立的索引，支持快速查找
- API Key 可随时刷新，旧 Key 立即失效

### Token 安全

- Access Token 有效期 7 天
- Refresh Token 有效期 30 天
- Token 使用后可刷新，无需重新登录
- 所有 Token 都有过期时间，防止永久泄露

### CORS 配置

通过 `ALLOWED_ORIGINS` 环境变量配置允许的跨域来源：

```env
# 单个来源
ALLOWED_ORIGINS=https://example.com

# 多个来源（逗号分隔）
ALLOWED_ORIGINS=https://app1.example.com,https://app2.example.com

# 子域名通配符
ALLOWED_ORIGINS=https://*.example.com
```

### Webhook URL 验证

系统自动验证 Webhook URL：
- 只允许 `http://` 和 `https://` 协议
- 禁止内网地址（`localhost`, `127.0.0.1`, `10.*`, `192.168.*`, `172.*` 等）
- 防止 SSRF 攻击

---

## 部署配置

### wrangler.toml 配置

主配置文件 `wrangler.toml`：

```toml
name = "bee-swarm"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# KV 命名空间绑定
kv_namespaces = [
  { binding = "SUBSCRIPTIONS", id = "your-kv-namespace-id" }
]

# 环境变量（非敏感）
[vars]
ALLOWED_ORIGINS = "https://your-domain.com"

# 兼容性标志
compatibility_flags = [
  "nodejs_compat"
]

# 前端静态资源
[site]
bucket = "dist"

# Cron 触发器（定时任务）
[triggers]
crons = [
  "*/5 * * * *"  # 每 5 分钟执行一次
]
```

### GitHub Actions 部署配置

项目包含 `.github/workflows/main.yml`，支持自动部署：

**需要配置的 GitHub Secrets**:
- `CLOUDFLARE_API_TOKEN`: Cloudflare API Token（需要 Workers 编辑权限）
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare Account ID

**获取 Cloudflare API Token**:
1. 访问 https://dash.cloudflare.com/profile/api-tokens
2. 创建 Token，选择 `Edit Cloudflare Workers` 模板
3. 授予 Account 资源的 Workers 编辑权限
4. 复制 Token

**获取 Account ID**:
1. 访问 Cloudflare Dashboard
2. 右侧边栏复制 Account ID

### Secrets 配置

敏感信息通过 `wrangler secret` 配置：

```bash
# 登录 wrangler
npx wrangler login

# 设置 Secrets
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
```

或通过 wrangler.toml 中的 [vars] 配置（不推荐用于生产环境的敏感信息）：

```toml
[vars]
# 开发环境可以放在这里，生产环境请使用 secret
# ADMIN_PASSWORD = "dev-only"
```

---

## 完整部署步骤

### 1. 准备环境

```bash
# 克隆仓库
git clone https://github.com/your-repo/bee-swarm.git
cd bee-swarm

# 安装依赖
npm install
```

### 2. 配置 wrangler.toml

编辑 `wrangler.toml`，配置 KV 命名空间等。

### 3. 创建 KV 命名空间

```bash
npx wrangler kv:namespace create "SUBSCRIPTIONS"
```

将输出的 ID 填入 `wrangler.toml`。

### 4. 设置 Secrets

```bash
# 设置管理员密码
npx wrangler secret put ADMIN_PASSWORD

# （可选）设置 VAPID 密钥
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
```

### 5. 部署

```bash
# 构建前端并部署
npm run deploy
```

### 6. 首次使用

1. 访问部署的 Worker 地址
2. 注册新用户（或使用管理员密码登录）
3. 在管理后台配置推送渠道
4. 测试推送功能

---

## 故障排查

### 配置问题

**问题**: 推送失败，提示渠道未配置

**解决**:
1. 检查渠道配置是否正确填写
2. 确认渠道已启用
3. 查看推送历史中的错误详情

**问题**: 备份失败

**解决**:
1. 检查备份端点配置
2. 验证网络连接
3. 确认权限正确

### 部署问题

**问题**: wrangler deploy 失败

**解决**:
1. 确认已正确登录 wrangler
2. 检查 wrangler.toml 配置
3. 查看错误日志

**问题**: KV 操作失败

**解决**:
1. 确认 KV 命名空间已创建
2. 检查 wrangler.toml 中的 KV 绑定
3. 验证 API Token 权限

---

*文档版本: 1.0*  
*最后更新: 2024-05-30*
