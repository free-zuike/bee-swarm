// ============================================
// 共享类型定义 - 前后端通用
// ============================================

/**
 * 推送消息负载
 * 定义了一条推送消息的基本内容结构
 */
export interface PushPayload {
  /** 推送标题 */
  title: string;
  /** 推送正文内容 */
  body?: string;
  /** 点击推送时跳转的链接 */
  url?: string;
  /** 自定义图标 URL */
  icon?: string;
  /** 附加图片 URL */
  imageUrl?: string;
  /** 是否使用 Markdown 格式渲染内容 */
  markdown?: boolean;
}

/**
 * 支持的推送渠道类型
 * 包含所有可用的第三方推送服务
 */
export type PushChannel =
  | 'wework'
  | 'dingtalk'
  | 'feishu'
  | 'telegram'
  | 'bark'
  | 'ntfy'
  | 'email'
  | 'slack'
  | 'discord';

/**
 * 推送请求
 * 包含推送内容和目标渠道等完整信息
 */
export interface PushRequest extends PushPayload {
  /** 目标推送渠道列表，为空则使用所有已启用渠道 */
  channels?: PushChannel[];
  /** 定时推送时间（ISO 8601 格式） */
  scheduledAt?: string;
  /** 使用的模板 ID */
  templateId?: string;
}

/**
 * 单个渠道推送结果
 */
export interface ChannelResult {
  /** 渠道标识 */
  channel: PushChannel;
  /** 是否推送成功 */
  success: boolean;
  /** 结果消息，成功或失败的详细信息 */
  message: string;
  /** 推送耗时（毫秒） */
  latencyMs?: number;
  /** 重试次数 */
  retries?: number;
}

// ==================== 用户相关类型 ====================

/**
 * 用户认证 Token
 * 用于 API 认证和会话管理
 */
export interface UserToken {
  /** 访问令牌，用于 API 调用 */
  token: string;
  /** 刷新令牌，用于获取新的访问令牌 */
  refreshToken: string;
  /** 过期时间戳（毫秒） */
  expiresAt: number;
}

// ==================== 渠道相关类型 ====================

/**
 * 渠道配置字段定义
 * 描述单个渠道所需的配置项
 */
export interface ChannelField {
  /** 字段键名，用于存储和读取 */
  key: string;
  /** 字段显示标签 */
  label: string;
  /** 字段输入类型 */
  type: 'text' | 'password' | 'url' | 'checkbox';
  /** 输入框占位提示 */
  placeholder?: string;
  /** 是否为必填项 */
  required: boolean;
}

/**
 * 渠道定义
 * 描述一个推送渠道的完整元信息
 */
export interface ChannelDefinition {
  /** 渠道唯一标识 */
  id: PushChannel;
  /** 渠道显示名称 */
  name: string;
  /** 渠道图标（emoji） */
  icon: string;
  /** 渠道详细描述 */
  description?: string;
  /** 所需配置字段列表 */
  fields: ChannelField[];
  /** 是否支持 Markdown 格式 */
  supportsMarkdown?: boolean;
  /** 是否支持图片附件 */
  supportsImages?: boolean;
  /** 是否支持定时推送 */
  supportsScheduled?: boolean;
}

/**
 * 渠道配置状态
 * 用于前端显示渠道的当前状态
 */
export interface ChannelConfig {
  /** 渠道标识 */
  id: PushChannel;
  /** 渠道名称 */
  name: string;
  /** 渠道图标 */
  icon: string;
  /** 是否启用 */
  enabled: boolean;
  /** 最后测试时间 */
  lastTested?: string;
  /** 健康状态 */
  healthy?: boolean;
}

/**
 * 渠道设置存储
 * 键值对形式存储的渠道配置
 */
export type ChannelSettings = Record<string, string>;

// ==================== 备份相关类型 ====================

/**
 * 备份端点类型
 */
export type EndpointType = 's3' | 'webdav';

/**
 * S3 兼容存储配置
 */
export interface S3Config {
  /** S3 服务端点 */
  endpoint: string;
  /** 访问密钥 ID */
  accessKeyId: string;
  /** 秘密访问密钥 */
  secretAccessKey: string;
  /** 存储桶名称 */
  bucket: string;
  /** 区域 */
  region: string;
  /** 存储路径 */
  path: string;
  /** 是否使用路径风格（而非虚拟主机风格） */
  pathStyle?: boolean;
}

/**
 * WebDAV 存储配置
 */
export interface WebDAVConfig {
  /** WebDAV 服务器 URL */
  url: string;
  /** 用户名 */
  username: string;
  /** 密码 */
  password: string;
  /** 存储路径 */
  path: string;
}

/**
 * 备份端点配置
 * 定义一个备份目标的完整配置
 */
export interface BackupEndpoint {
  /** 端点唯一标识 */
  id: string;
  /** 端点显示名称 */
  name: string;
  /** 端点类型 */
  type: EndpointType;
  /** 是否启用 */
  enabled: boolean;
  /** 具体配置（S3 或 WebDAV） */
  config: S3Config | WebDAVConfig;
  /** 自动备份计划 */
  schedule: {
    /** 是否启用自动备份 */
    enabled: boolean;
    /** 备份间隔（小时） */
    interval: number;
    /** 开始时间（HH:MM 格式） */
    startTime: string;
    /** 时区 */
    timezone?: string;
    /** 每周备份的星期几（0-6，0=周日） */
    startDay?: number;
  };
  /** 备份保留天数 */
  retention: number;
  /** 最后一次备份信息 */
  lastBackup?: {
    /** 备份时间 */
    time: string;
    /** 备份状态 */
    status: 'success' | 'failed';
    /** 附加消息 */
    message?: string;
  };
}

/**
 * 备份文件信息
 */
export interface BackupInfo {
  /** 文件键/路径 */
  key: string;
  /** 文件大小（字节） */
  size: number;
  /** 最后修改时间 */
  lastModified: string;
}

/**
 * 备份操作结果
 */
export interface BackupResult {
  /** 是否成功 */
  success: boolean;
  /** 结果消息 */
  message: string;
  /** 端点 ID */
  endpointId?: string;
  /** 端点名称 */
  endpointName?: string;
  /** 备份文件键 */
  key?: string;
}

// ==================== 模板相关类型 ====================

/**
 * 推送模板
 * 预定义的推送内容模板
 */
export interface PushTemplate {
  /** 模板唯一标识 */
  id: string;
  /** 模板名称 */
  name: string;
  /** 推送标题 */
  title: string;
  /** 推送内容 */
  content: string;
  /** 默认推送渠道 */
  channels?: PushChannel[];
  /** 默认链接 */
  url?: string;
  /** 默认图片 URL */
  imageUrl?: string;
  /** 是否使用 Markdown */
  useMarkdown?: boolean;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

/**
 * 渠道分组
 * 将多个渠道组合为一个分组，便于批量推送
 */
export interface ChannelGroup {
  /** 分组唯一标识 */
  id: string;
  /** 分组名称 */
  name: string;
  /** 包含的渠道列表 */
  channels: PushChannel[];
  /** 创建时间 */
  createdAt: string;
}

/**
 * 定时推送任务
 */
export interface ScheduledPush {
  /** 任务唯一标识 */
  id: string;
  /** 使用的模板 ID */
  templateId?: string;
  /** 推送标题 */
  title: string;
  /** 推送内容 */
  content: string;
  /** 目标渠道 */
  channels: PushChannel[];
  /** 推送链接 */
  url?: string;
  /** 计划推送时间 */
  scheduledAt: string;
  /** 调度类型：一次性或重复 */
  scheduleType?: 'once' | 'recurring';
  /** 重复类型 */
  recurringType?: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'interval' | 'cron';
  /** 每周选择的星期几（0-6） */
  selectedWeekDays?: number[];
  /** 每月选择的日期（1-31） */
  selectedMonthDays?: number[];
  /** 间隔小时数（仅 interval 类型） */
  intervalHours?: number;
  /** Cron 表达式（仅 cron 类型） */
  cronExpression?: string;
  /** 任务状态 */
  status: 'pending' | 'processing' | 'completed' | 'failed';
  /** 创建者 */
  createdBy: string;
  /** 创建时间 */
  createdAt: string;
  /** 完成时间 */
  completedAt?: string;
  /** 推送结果 */
  results?: ChannelResult[];
}

// ==================== 统计相关类型 ====================

/**
 * 推送统计指标
 */
export interface PushMetrics {
  /** 总推送次数 */
  total: number;
  /** 成功次数 */
  success: number;
  /** 失败次数 */
  failed: number;
  /** 各渠道统计 */
  byChannel: Record<string, { success: number; failed: number }>;
  /** 平均延迟（毫秒） */
  avgLatency: number;
  /** 最后推送时间 */
  lastPushAt?: string;
}

/**
 * 每日统计数据
 */
export interface DailyMetrics {
  /** 日期（YYYY-MM-DD） */
  date: string;
  /** 推送次数 */
  pushes: number;
  /** 成功次数 */
  success: number;
  /** 失败次数 */
  failed: number;
  /** 各渠道使用次数 */
  byChannel: Record<string, number>;
}

/**
 * 推送统计数据（用于前端展示）
 */
export interface PushStats {
  /** 当前会话统计 */
  session: {
    total: number;
    success: number;
    failed: number;
  };
  /** 趋势信息 */
  trend: {
    /** 变化率 */
    rate: number;
    /** 趋势方向 */
    direction: 'up' | 'down' | 'stable';
  };
  /** 最近数据 */
  recent: Array<{
    date: string;
    pushes: number;
    success: number;
    failed: number;
  }>;
  /** 渠道使用统计 */
  channelUsage?: Record<
    string,
    { count: number; success: number; failed: number; avgLatency: number }
  >;
  /** 最近成功率 */
  recentSuccessRate?: number;
  /** 总记录数 */
  totalRecords?: number;
}

/**
 * 渠道健康状态
 */
export interface ChannelHealth {
  /** 渠道标识 */
  channel: PushChannel;
  /** 是否健康 */
  healthy: boolean;
  /** 状态消息 */
  message: string;
}
