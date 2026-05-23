// ============================================
// 类型定义
// 所有接口和类型的集中定义
// ============================================

/**
 * Web Push 订阅对象
 * 由浏览器 Push API 生成，包含端点和加密密钥
 */
export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * 统一推送消息格式
 * 所有推送渠道共用此结构
 */
export interface PushPayload {
  /** 消息标题（必填） */
  title: string;
  /** 消息正文 */
  body?: string;
  /** 点击跳转链接 */
  url?: string;
  /** 图标 URL */
  icon?: string;
}

/**
 * 推送渠道标识
 * 用于指定消息通过哪些渠道发送
 */
export type PushChannel =
  | 'webpush'    // 浏览器推送
  | 'wework'     // 企业微信
  | 'dingtalk'   // 钉钉
  | 'feishu'     // 飞书
  | 'telegram'   // Telegram
  | 'bark'       // Bark (iOS)
  | 'ntfy'       // ntfy
  | 'email';     // 邮件

/**
 * 推送请求体
 * 管理后台发送推送时的请求格式
 */
export interface PushRequest extends PushPayload {
  /** 指定推送渠道（不填则推送到所有已配置的渠道） */
  channels?: PushChannel[];
}

/**
 * 推送结果
 * 每个渠道的推送执行结果
 */
export interface ChannelResult {
  /** 渠道名称 */
  channel: PushChannel;
  /** 是否成功 */
  success: boolean;
  /** 结果描述 */
  message: string;
}

/**
 * Cloudflare Workers 环境变量绑定
 * 对应 wrangler.toml 中的配置
 */
export interface Env {
  /** KV 命名空间 - 存储 Web Push 订阅 */
  SUBSCRIPTIONS: KVNamespace;

  // ---- 管理配置 ----
  ADMIN_PASSWORD: string;

  // ---- Web Push 配置 ----
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;

  // ---- 企业微信 ----
  WEWORK_WEBHOOK_URL: string;

  // ---- 钉钉 ----
  DINGTALK_WEBHOOK_URL: string;
  DINGTALK_SECRET: string;

  // ---- 飞书 ----
  FEISHU_WEBHOOK_URL: string;

  // ---- Telegram ----
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;

  // ---- Bark ----
  BARK_KEY: string;
  BARK_SERVER: string;

  // ---- ntfy ----
  NTFY_TOPIC: string;
  NTFY_SERVER: string;

  // ---- Email (Resend) ----
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  EMAIL_TO: string;
}

/**
 * 推送渠道配置信息
 * 用于前端展示哪些渠道已启用
 */
export interface ChannelConfig {
  /** 渠道标识 */
  id: PushChannel;
  /** 渠道显示名称 */
  name: string;
  /** 渠道图标 */
  icon: string;
  /** 是否已配置（启用） */
  enabled: boolean;
}

declare module 'hono' {
  interface ContextVariableMap {
    env: Env;
  }
}
