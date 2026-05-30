/**
 * 推送系统全局配置常量
 * 定义了推送、限流、数据保留等核心参数
 */
export const PUSH_CONFIG = {
  /** 单个渠道推送请求超时时间（毫秒） */
  timeout: 10000,
  /** 最大重试次数 */
  maxRetries: 2,
  /** 重试基础延迟时间（毫秒），指数退避的基数 */
  retryBaseDelayMs: 1000,
  /** 推送历史保留天数 */
  historyRetentionDays: 7,
  /** 推送历史保留秒数 */
  historyRetentionSeconds: 7 * 24 * 60 * 60,
  /** 每分钟最大请求数（限流） */
  rateLimitMaxPerMinute: 100,
  /** 备份文件保留数量 */
  backupRetentionCount: 10,
} as const;

/** 配置类型定义 */
export type PushConfig = typeof PUSH_CONFIG;
