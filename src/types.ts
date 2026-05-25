// ============================================
// 类型定义
// ============================================

/**
 * 统一推送消息格式
 */
export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  icon?: string;
}

/**
 * 推送渠道标识
 */
export type PushChannel =
  | 'wework'     // 企业微信
  | 'dingtalk'   // 钉钉
  | 'feishu'     // 飞书
  | 'telegram'   // Telegram
  | 'bark'       // Bark (iOS)
  | 'ntfy'       // ntfy
  | 'email';     // 邮件

/**
 * 推送请求体
 */
export interface PushRequest extends PushPayload {
  channels?: PushChannel[];
}

/**
 * 推送结果
 */
export interface ChannelResult {
  channel: PushChannel;
  success: boolean;
  message: string;
}

/**
 * 渠道配置项
 */
export interface ChannelField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  placeholder: string;
  required: boolean;
}

/**
 * 渠道定义
 */
export interface ChannelDefinition {
  id: PushChannel;
  name: string;
  icon: string;
  fields: ChannelField[];
}

/**
 * 渠道配置信息
 */
export interface ChannelConfig {
  id: PushChannel;
  name: string;
  icon: string;
  enabled: boolean;
}

/**
 * 渠道设置值
 */
export type ChannelSettings = Record<string, string>;

/**
 * Cloudflare Workers 环境变量
 */
export interface Env {
  SUBSCRIPTIONS: KVNamespace;
  ASSETS: Fetcher;
}

declare module 'hono' {
  interface ContextVariableMap {
    env: Env;
  }
}
