// ============================================
// 类型定义
// ============================================

/** 推送渠道标识 */
export type PushChannel =
  | 'webpush'
  | 'wework'
  | 'dingtalk'
  | 'feishu'
  | 'telegram'
  | 'bark'
  | 'ntfy'
  | 'email';

/** Web Push 订阅对象 */
export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/** 渠道配置 */
export interface ChannelConfig {
  id: PushChannel;
  name: string;
  icon: string;
  enabled: boolean;
}

/** 渠道配置字段定义 */
export interface ChannelField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  placeholder: string;
  required: boolean;
}

/** 渠道定义（包含字段信息） */
export interface ChannelDefinition {
  id: PushChannel;
  name: string;
  icon: string;
  fields: ChannelField[];
}

/** 推送结果 */
export interface PushResult {
  channel: PushChannel;
  success: boolean;
  message: string;
}

/** 渠道设置值 */
export type ChannelSettings = Record<string, string>;
