// ============================================
// 类型定义
// ============================================

// 从共享类型重新导出
export type {
  PushPayload,
  PushChannel,
  PushRequest,
  ChannelResult as PushResult,
  ChannelConfig,
  ChannelField,
  ChannelDefinition,
  ChannelSettings,
  UserToken,
  BackupEndpoint,
  BackupInfo,
  BackupResult,
  EndpointType,
  PushTemplate,
  ChannelGroup,
  ScheduledPush,
  PushStats,
  PushMetrics,
  DailyMetrics,
  ChannelHealth,
} from '../../types';

/** Web Push 订阅对象（仅前端使用） */
export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/** 推送历史记录（前端类型） */
export interface PushHistoryRecord {
  id: string;
  title: string;
  body?: string;
  channels: string[];
  url?: string;
  imageUrl?: string;
  markdown?: boolean;
  status: string;
  results: Array<{ channel: string; success: boolean; message: string }>;
  time?: string;
  createdAt?: string;
}
