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
  /** D1 数据库，用于存储所有业务数据 */
  DB: D1Database;
  /** 静态资源 Fetcher，用于提供前端页面 */
  ASSETS: Fetcher;
  /** R2 存储桶，用于存储备份文件、头像等（可选） */
  BUCKET?: R2Bucket;
  /** 推送任务队列，用于异步发送推送通知（可选） */
  PUSH_QUEUE?: Queue;
  /** 允许的跨域来源，逗号分隔 */
  ALLOWED_ORIGINS?: string;
  /** 日志级别 */
  LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
  /** 管理员邮箱（可选），指定该邮箱注册自动成为管理员 */
  ADMIN_EMAIL?: string;
  /** R2 公共域名，用于头像等公开资源的访问 */
  R2_PUBLIC_DOMAIN?: string;
  /** Turnstile 密钥，用于反爬虫验证（可选） */
  TURNSTILE_SECRET_KEY?: string;
  /** Turnstile 站点密钥，用于前端显示（可选） */
  TURNSTILE_SITE_KEY?: string;
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
    /** 当前认证的用户ID */
    userId: string;
    /** 当前认证的用户角色 */
    userRole: 'admin' | 'user' | 'viewer';
  }
}
