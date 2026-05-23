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
 * 渠道配置项定义
 * 每个渠道需要填写的配置字段
 */
export interface ChannelField {
  /** 字段名（对应 KV 存储的 key） */
  key: string;
  /** 显示名称 */
  label: string;
  /** 输入类型 */
  type: 'text' | 'password' | 'url';
  /** 占位文本 */
  placeholder: string;
  /** 是否必填 */
  required: boolean;
}

/**
 * 渠道定义
 * 包含渠道元信息和需要配置的字段
 */
export interface ChannelDefinition {
  id: PushChannel;
  name: string;
  icon: string;
  /** 该渠道需要填写的配置字段 */
  fields: ChannelField[];
}

/**
 * 渠道配置信息（前端展示用）
 */
export interface ChannelConfig {
  id: PushChannel;
  name: string;
  icon: string;
  enabled: boolean;
}

/**
 * 所有渠道的设置值（存储到 KV）
 * key: "channel:{channel_id}:{field_key}" → value
 */
export type ChannelSettings = Record<string, string>;

/**
 * Cloudflare Workers 环境变量绑定
 * 只保留 KV 和 VAPID 密钥（通过 Secrets 设置）
 */
export interface Env {
  /** KV 命名空间 - 存储订阅和配置 */
  SUBSCRIPTIONS: KVNamespace;
  /** ASSETS 静态资源绑定 */
  ASSETS: Fetcher;

  // ---- VAPID 密钥（通过 wrangler secret 设置）----
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
}

declare module 'hono' {
  interface ContextVariableMap {
    env: Env;
  }
}
