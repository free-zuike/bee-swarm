// ============================================
// 共享类型定义
// ============================================

// 推送相关类型
export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  icon?: string;
  imageUrl?: string;
  markdown?: boolean;
}

export type PushChannel =
  | 'wework'
  | 'dingtalk'
  | 'feishu'
  | 'telegram'
  | 'bark'
  | 'ntfy'
  | 'email'
  | 'slack'
  | 'discord'
  | 'webpush';

export interface PushRequest extends PushPayload {
  channels?: PushChannel[];
  scheduledAt?: string;
  templateId?: string;
}

export interface ChannelResult {
  channel: PushChannel;
  success: boolean;
  message: string;
  latencyMs?: number;
  retries?: number;
}

// 用户相关类型
export interface UserToken {
  token: string;
  refreshToken: string;
  expiresAt: number;
}

// 渠道相关类型
export interface ChannelField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url' | 'checkbox';
  placeholder?: string;
  required: boolean;
}

export interface ChannelDefinition {
  id: PushChannel;
  name: string;
  icon: string;
  description?: string;
  fields: ChannelField[];
  supportsMarkdown?: boolean;
  supportsImages?: boolean;
  supportsScheduled?: boolean;
}

export interface ChannelConfig {
  id: PushChannel;
  name: string;
  icon: string;
  enabled: boolean;
  lastTested?: string;
  healthy?: boolean;
}

export type ChannelSettings = Record<string, string>;

// 备份相关类型
export type EndpointType = 's3' | 'webdav';

export interface S3Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  path: string;
  pathStyle?: boolean;
}

export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  path: string;
}

export interface BackupEndpoint {
  id: string;
  name: string;
  type: EndpointType;
  enabled: boolean;
  config: S3Config | WebDAVConfig;
  schedule: {
    enabled: boolean;
    interval: number;
    startTime: string;
    timezone?: string;
    startDay?: number;
  };
  retention: number;
  lastBackup?: {
    time: string;
    status: 'success' | 'failed';
    message?: string;
  };
}

export interface BackupInfo {
  key: string;
  size: number;
  lastModified: string;
}

export interface BackupResult {
  success: boolean;
  message: string;
  endpointId?: string;
  endpointName?: string;
  key?: string;
}

// 模板相关类型
export interface PushTemplate {
  id: string;
  name: string;
  title: string;
  content: string;
  channels?: PushChannel[];
  url?: string;
  imageUrl?: string;
  useMarkdown?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelGroup {
  id: string;
  name: string;
  channels: PushChannel[];
  createdAt: string;
}

export interface ScheduledPush {
  id: string;
  templateId?: string;
  title: string;
  content: string;
  channels: PushChannel[];
  url?: string;
  scheduledAt: string;
  scheduleType?: 'once' | 'recurring';
  recurringType?: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'interval' | 'cron';
  selectedWeekDays?: number[];
  selectedMonthDays?: number[];
  intervalHours?: number;
  cronExpression?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdBy: string;
  createdAt: string;
  completedAt?: string;
  results?: ChannelResult[];
}

// 统计相关类型
export interface PushMetrics {
  total: number;
  success: number;
  failed: number;
  byChannel: Record<string, { success: number; failed: number }>;
  avgLatency: number;
  lastPushAt?: string;
}

export interface DailyMetrics {
  date: string;
  pushes: number;
  success: number;
  failed: number;
  byChannel: Record<string, number>;
}

export interface PushStats {
  session: {
    total: number;
    success: number;
    failed: number;
  };
  trend: {
    rate: number;
    direction: 'up' | 'down' | 'stable';
  };
  recent: Array<{
    date: string;
    pushes: number;
    success: number;
    failed: number;
  }>;
}

export interface ChannelHealth {
  channel: PushChannel;
  healthy: boolean;
  message: string;
}
