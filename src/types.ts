// ============================================
// 类型定义 - Workers 运行时专用
// ============================================

/**
 * 从共享类型重新导出
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
 */
export interface Env {
  /** D1 数据库 */
  DB: D1Database;
  /** 静态资源 */
  ASSETS: Fetcher;
  /** R2 存储桶 */
  BUCKET?: R2Bucket;
  /** 推送队列 */
  PUSH_QUEUE?: Queue;
  /** 跨域配置 */
  ALLOWED_ORIGINS?: string;
  /** 日志级别 */
  LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
  /** 管理员邮箱 */
  ADMIN_EMAIL?: string;
  /** R2 公共域名 */
  R2_PUBLIC_DOMAIN?: string;
  /** Turnstile 密钥 */
  TURNSTILE_SECRET_KEY?: string;
  /** Turnstile 站点密钥 */
  TURNSTILE_SITE_KEY?: string;
  /** Workers AI */
  AI?: any;
  /** KV 命名空间（限流） */
  RATE_LIMIT_KV?: KVNamespace;
  /** Vectorize 向量搜索 */
  VECTORIZE_INDEX?: VectorizeIndex;
  /** Analytics Engine */
  ANALYTICS?: AnalyticsEngineDataset;
  /** Durable Objects：健康检查 */
  HEALTH_TRACKER: DurableObjectNamespace;
  /** Durable Objects：WebSocket */
  WS_MANAGER: DurableObjectNamespace;
  /** Durable Objects：分布式锁 */
  TASK_LOCK: DurableObjectNamespace;
}

/**
 * Hono 上下文变量扩展
 */
declare module 'hono' {
  interface ContextVariableMap {
    env: Env;
    username: string;
    userId: string;
    userRole: 'admin' | 'user' | 'viewer';
    requestContext?: {
      requestId: string;
      startTime: number;
      method?: string;
      path?: string;
      ip?: string;
      userAgent?: string;
    };
    ipReputation?: {
      score: number;
      level: 'low' | 'medium' | 'high' | 'unknown';
      factors: string[];
    };
  }
}
