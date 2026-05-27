// ============================================
// 共享类型定义
// ============================================

// 推送相关类型
export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  icon?: string;
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
}
