export const PUSH_CONFIG = {
  timeout: 10000,
  maxRetries: 2,
  retryBaseDelayMs: 1000,
  historyRetentionDays: 7,
  historyRetentionSeconds: 7 * 24 * 60 * 60,
  rateLimitMaxPerMinute: 100,
  backupRetentionCount: 10,
} as const;

export type PushConfig = typeof PUSH_CONFIG;
