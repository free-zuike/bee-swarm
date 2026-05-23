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

/** 推送结果 */
export interface PushResult {
  channel: PushChannel;
  success: boolean;
  message: string;
}
