// ============================================
// 类型定义
// ============================================

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  icon?: string;
}

/** 用户 Token 信息 */
export interface UserToken {
  token: string;         // 访问 token
  refreshToken: string;   // 刷新 token
  expiresAt: number;      // 过期时间戳
}

export type PushChannel =
  | 'wework'
  | 'dingtalk'
  | 'feishu'
  | 'telegram'
  | 'bark'
  | 'ntfy'
  | 'email';

export interface PushRequest extends PushPayload {
  channels?: PushChannel[];
}

export interface ChannelResult {
  channel: PushChannel;
  success: boolean;
  message: string;
}

export interface ChannelField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  placeholder: string;
  required: boolean;
}

export interface ChannelDefinition {
  id: PushChannel;
  name: string;
  icon: string;
  fields: ChannelField[];
}

export interface ChannelConfig {
  id: PushChannel;
  name: string;
  icon: string;
  enabled: boolean;
}

export type ChannelSettings = Record<string, string>;

export interface Env {
  SUBSCRIPTIONS: KVNamespace;
  ASSETS: Fetcher;
}

declare module 'hono' {
  interface ContextVariableMap {
    env: Env;
    username: string;
  }
}
