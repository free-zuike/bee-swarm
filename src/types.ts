// ============================================
// 类型定义
// ============================================

// 从共享类型重新导出
export type {
  PushPayload,
  PushChannel,
  PushRequest,
  ChannelResult,
  ChannelConfig,
  ChannelField,
  ChannelDefinition,
  ChannelSettings,
  UserToken,
  BackupEndpoint,
  BackupInfo,
  BackupResult,
  EndpointType,
  S3Config,
  WebDAVConfig,
} from '../types';

// Workers 特有类型
export interface Env {
  SUBSCRIPTIONS: KVNamespace;
  ASSETS: Fetcher;
  ALLOWED_ORIGINS?: string;
}

declare module 'hono' {
  interface ContextVariableMap {
    env: Env;
    username: string;
  }
}
