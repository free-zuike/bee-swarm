// ============================================
// 类型定义 - Workers 运行时专用
// ============================================

/**
 * 从共享类型重新导出
 * 这些类型在前后端之间保持一致，确保数据传输的类型安全
 */
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
  ChannelHealth,
} from '../types';

/**
 * Workers 环境绑定类型
 * 定义了 Cloudflare Workers 运行时可用的所有资源
 */
export interface Env {
  /** KV 命名空间，用于存储临时数据和缓存 */
  SUBSCRIPTIONS: KVNamespace;
  /** D1 数据库，用于存储核心业务数据 */
  DB: D1Database;
  /** 静态资源 Fetcher，用于提供前端页面 */
  ASSETS: Fetcher;
  /** 允许的跨域来源，逗号分隔 */
  ALLOWED_ORIGINS?: string;
  /** 日志级别 */
  LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Hono 上下文变量扩展
 * 为 Hono 的 Context 添加类型安全的自定义变量
 */
declare module 'hono' {
  interface ContextVariableMap {
    env: Env;
    /** 当前认证的用户名 */
    username: string;
  }
}
