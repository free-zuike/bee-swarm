// ============================================
// MCP (Model Context Protocol) 服务
// 提供 AI 模型可调用的推送通知工具
// ============================================

import type { Env, PushChannel, ChannelResult } from '../types';
import { dispatchPushWithOptions, saveUserChannelSetting, getPushHistory, deletePushHistory, batchDeletePushHistory, batchDeletePushHistoryByFilter, getChannelConfigs } from './dispatcher';
import { PushService, type ScheduledPush } from './push';
import { CHANNEL_DEFINITIONS } from './dispatcher';
import { getBackupEndpoints, executeAllBackups, listBackupsFromEndpoint, saveBackupEndpoint, deleteBackupEndpoint, testBackupEndpoint, deleteBackupFromEndpoint, restoreFromEndpoint, importData, validateBackup, getBackupHistory, deleteBackupRecordItem } from './backup';
import { UserService } from './userService';
import { SystemSettingsService } from './systemSettingsService';
import { createAuditLogger } from '../utils/audit';
import { getDatabaseStats, cleanupExpiredData, deleteTable, cleanupOrphanTablesForce, getAllTables } from './cleanupService';
import { archivePushHistory, listArchives, restoreArchivedData } from './archiveService';
import { generateTOTPSecret, verifyTOTP, generateQRCodeDataURL } from '../utils/totp';
import { replaceTemplateVariables, extractVariables } from './push';

// ==================== MCP 类型定义 ====================

export interface MCPRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

// ==================== 工具定义 ====================

/** 需要管理员权限的工具 */
const ADMIN_TOOLS = new Set([
  'get_system_status',
  'list_users',
  'create_user',
  'update_user_role',
  'disable_user',
  'enable_user',
  'delete_user',
  'get_audit_logs',
  'clear_audit_logs',
  'get_system_settings',
  'update_system_settings',
  'get_database_stats',
  'cleanup_database',
  'archive_push_history',
  'list_archives',
  'restore_archive',
  'get_database_tables',
  'delete_database_table',
  'cleanup_orphan_tables',
  'get_system_health',
  'get_analytics_activity',
  'get_metrics',
]);

/** 根据角色返回可见的工具列表 */
export function getToolsForRole(role: string): MCPTool[] {
  if (role === 'admin') return tools;
  return tools.filter((t) => !ADMIN_TOOLS.has(t.name));
}

const tools: MCPTool[] = [
  {
    name: 'send_push',
    description: '发送推送通知到指定渠道',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '推送标题' },
        body: { type: 'string', description: '推送内容' },
        url: { type: 'string', description: '点击跳转链接' },
        channels: { type: 'string', description: '目标渠道，逗号分隔（如 wework,dingtalk,telegram）。留空则使用所有已启用渠道' },
      },
      required: ['title'],
    },
  },
  {
    name: 'create_scheduled_push',
    description: '创建定时推送任务（一次性或循环）',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '推送标题' },
        body: { type: 'string', description: '推送内容' },
        channels: { type: 'string', description: '目标渠道，逗号分隔' },
        scheduledAt: { type: 'string', description: '首次执行时间（ISO 8601 格式，如 2025-01-01T10:00:00+08:00）' },
        scheduleType: { type: 'string', description: '调度类型：once（一次性）或 recurring（循环）', enum: ['once', 'recurring'] },
        recurringType: { type: 'string', description: '循环类型：daily / weekly / monthly / hourly / cron', enum: ['daily', 'weekly', 'monthly', 'hourly', 'cron'] },
        selectedWeekDays: { type: 'string', description: '每周执行日（仅 weekly 类型，0-6 逗号分隔，如 1,3,5 表示周一三五）' },
        cronExpression: { type: 'string', description: 'Cron 表达式（仅 cron 类型，5 字段格式）' },
        timezone: { type: 'string', description: '时区，默认 Asia/Shanghai' },
        url: { type: 'string', description: '点击跳转链接' },
      },
      required: ['title', 'channels', 'scheduledAt'],
    },
  },
  {
    name: 'update_scheduled_push',
    description: '更新定时推送任务（仅 pending 状态可编辑）',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '定时任务 ID' },
        title: { type: 'string', description: '推送标题' },
        body: { type: 'string', description: '推送内容' },
        channels: { type: 'string', description: '目标渠道，逗号分隔' },
        scheduledAt: { type: 'string', description: '执行时间（ISO 8601）' },
        scheduleType: { type: 'string', description: '调度类型', enum: ['once', 'recurring'] },
        recurringType: { type: 'string', description: '循环类型', enum: ['daily', 'weekly', 'monthly', 'hourly', 'cron'] },
        selectedWeekDays: { type: 'string', description: '每周执行日，逗号分隔' },
        cronExpression: { type: 'string', description: 'Cron 表达式' },
        timezone: { type: 'string', description: '时区' },
        url: { type: 'string', description: '点击跳转链接' },
      },
      required: ['id'],
    },
  },
  {
    name: 'cancel_scheduled_push',
    description: '取消定时推送任务',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '定时任务 ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'reschedule_overdue_task',
    description: '重新安排已超时的定时任务',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '超时任务 ID' },
        scheduledAt: { type: 'string', description: '新的执行时间（ISO 8601）' },
      },
      required: ['id', 'scheduledAt'],
    },
  },
  {
    name: 'list_scheduled_pushes',
    description: '列出定时推送任务列表',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: '按状态筛选：pending / processing / completed / failed / overdue', enum: ['pending', 'processing', 'completed', 'failed', 'overdue'] },
      },
      required: [],
    },
  },
  {
    name: 'get_scheduled_push_detail',
    description: '获取单个定时推送任务的详细信息',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '定时任务 ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_templates',
    description: '获取推送模板列表',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'get_channel_groups',
    description: '获取渠道分组列表',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'get_push_history',
    description: '获取最近的推送历史记录',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'string', description: '返回条数，默认 10' },
      },
      required: [],
    },
  },
  {
    name: 'get_push_history_detail',
    description: '获取单条推送历史的详细信息（含渠道结果）',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '推送历史 ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_push_stats',
    description: '获取推送统计信息（成功率、趋势等）',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'string', description: '统计天数，默认 7' },
      },
      required: [],
    },
  },
  {
    name: 'get_execution_logs',
    description: '获取推送执行日志',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'string', description: '返回条数，默认 10' },
      },
      required: [],
    },
  },
  {
    name: 'test_channel',
    description: '测试单个推送渠道（发送真实测试消息）',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: '渠道标识，如 wework / dingtalk / telegram / bark / ntfy / email / slack / discord / serverchan / pushplus / webhook / gotify / line / teams / pushover' },
      },
      required: ['channel'],
    },
  },
  {
    name: 'check_all_channels_health',
    description: '检查所有已配置渠道的健康状态',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'get_drafts',
    description: '获取推送草稿列表',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'get_favorites',
    description: '获取推送收藏列表',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'list_channels',
    description: '列出所有可用的推送渠道及其状态',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'save_channel_config',
    description: '保存/更新推送渠道的配置',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: '渠道标识' },
        enabled: { type: 'string', description: '是否启用：true / false' },
        webhook_url: { type: 'string', description: 'Webhook URL（如适用）' },
        secret: { type: 'string', description: '加签密钥（如钉钉）' },
        bot_token: { type: 'string', description: 'Bot Token（如 Telegram）' },
        chat_id: { type: 'string', description: 'Chat ID（如 Telegram）' },
        topic: { type: 'string', description: 'Topic（如 ntfy）' },
      },
      required: ['channel', 'enabled'],
    },
  },
  {
    name: 'create_template',
    description: '创建推送模板',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '模板名称' },
        title: { type: 'string', description: '推送标题' },
        body: { type: 'string', description: '推送内容' },
        channels: { type: 'string', description: '默认渠道，逗号分隔' },
        url: { type: 'string', description: '跳转链接' },
        category: { type: 'string', description: '分类' },
      },
      required: ['name', 'title'],
    },
  },
  {
    name: 'update_template',
    description: '更新推送模板',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '模板 ID' },
        name: { type: 'string', description: '模板名称' },
        title: { type: 'string', description: '推送标题' },
        body: { type: 'string', description: '推送内容' },
        channels: { type: 'string', description: '默认渠道，逗号分隔' },
        url: { type: 'string', description: '跳转链接' },
        category: { type: 'string', description: '分类' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_template',
    description: '删除推送模板',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '模板 ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_channel_group',
    description: '创建渠道分组',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '分组名称' },
        channels: { type: 'string', description: '渠道列表，逗号分隔' },
      },
      required: ['name', 'channels'],
    },
  },
  {
    name: 'update_channel_group',
    description: '更新渠道分组',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '分组 ID' },
        name: { type: 'string', description: '分组名称' },
        channels: { type: 'string', description: '渠道列表，逗号分隔' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_channel_group',
    description: '删除渠道分组',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '分组 ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_draft',
    description: '创建推送草稿',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '推送标题' },
        body: { type: 'string', description: '推送内容' },
        channels: { type: 'string', description: '渠道，逗号分隔' },
        url: { type: 'string', description: '跳转链接' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_draft',
    description: '更新推送草稿',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '草稿 ID' },
        title: { type: 'string', description: '推送标题' },
        body: { type: 'string', description: '推送内容' },
        channels: { type: 'string', description: '渠道，逗号分隔' },
        url: { type: 'string', description: '跳转链接' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_draft',
    description: '删除推送草稿',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '草稿 ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_favorite',
    description: '创建推送收藏',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '推送标题' },
        body: { type: 'string', description: '推送内容' },
        channels: { type: 'string', description: '渠道，逗号分隔' },
        url: { type: 'string', description: '跳转链接' },
      },
      required: ['title', 'channels'],
    },
  },
  {
    name: 'delete_favorite',
    description: '删除推送收藏',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '收藏 ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_push_history',
    description: '删除推送历史记录',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'string', description: '要删除的历史 ID，逗号分隔。留空则删除全部' },
      },
      required: [],
    },
  },
  {
    name: 'list_backup_endpoints',
    description: '列出备份端点配置',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'run_backup',
    description: '立即执行备份到所有已启用的端点',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'list_backups',
    description: '列出备份端点的备份文件',
    inputSchema: {
      type: 'object',
      properties: {
        endpointId: { type: 'string', description: '备份端点 ID' },
      },
      required: ['endpointId'],
    },
  },
  {
    name: 'get_user_settings',
    description: '获取当前用户的设置',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'get_allowed_ips',
    description: '获取 IP 白名单',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'export_data',
    description: '导出用户数据为 JSON',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'get_current_user',
    description: '获取当前登录用户的信息',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'update_avatar',
    description: '更新用户头像',
    inputSchema: {
      type: 'object',
      properties: {
        avatar_url: { type: 'string', description: '头像 URL' },
        use_avatar_as_popup: { type: 'string', description: '是否在弹窗中使用头像：1 / 0' },
      },
      required: [],
    },
  },
  {
    name: 'update_cache_settings',
    description: '更新缓存 TTL 设置',
    inputSchema: {
      type: 'object',
      properties: {
        cache_ttl_backup: { type: 'string', description: '备份缓存 TTL (ms)' },
        cache_ttl_channels: { type: 'string', description: '渠道缓存 TTL (ms)' },
        cache_ttl_templates: { type: 'string', description: '模板缓存 TTL (ms)' },
        cache_ttl_groups: { type: 'string', description: '分组缓存 TTL (ms)' },
        cache_ttl_scheduled: { type: 'string', description: '定时任务缓存 TTL (ms)' },
      },
      required: [],
    },
  },
  {
    name: 'update_ai_settings',
    description: '更新 AI 设置',
    inputSchema: {
      type: 'object',
      properties: {
        ai_enabled: { type: 'string', description: '是否启用 AI：true / false' },
        ai_provider: { type: 'string', description: 'AI 提供商：workers-ai / openai / anthropic / custom' },
        ai_api_key: { type: 'string', description: 'API 密钥' },
        ai_api_url: { type: 'string', description: 'API 地址' },
        ai_model_name: { type: 'string', description: '模型名称' },
      },
      required: [],
    },
  },
  {
    name: 'get_ai_tools',
    description: '获取 AI 工具列表',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_execution_log_detail',
    description: '获取单条推送执行日志的详细信息',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '执行日志 ID' } },
      required: ['id'],
    },
  },
  {
    name: 'get_push_history_filtered',
    description: '按条件筛选推送历史记录',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'string', description: '页码，默认 1' },
        pageSize: { type: 'string', description: '每页条数，默认 20' },
        channel: { type: 'string', description: '按渠道筛选' },
        status: { type: 'string', description: '按状态筛选' },
        keyword: { type: 'string', description: '关键词搜索标题/内容' },
      },
      required: [],
    },
  },
  {
    name: 'batch_delete_push_history_by_filter',
    description: '按条件批量删除推送历史',
    inputSchema: {
      type: 'object',
      properties: {
        olderThan: { type: 'string', description: '删除早于此日期的记录（ISO 8601）' },
        channel: { type: 'string', description: '按渠道筛选' },
        status: { type: 'string', description: '按状态筛选' },
      },
      required: [],
    },
  },
  {
    name: 'mark_push_delivered',
    description: '标记推送为已送达',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '推送历史 ID' } },
      required: ['id'],
    },
  },
  {
    name: 'mark_push_read',
    description: '标记推送为已读',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '推送历史 ID' } },
      required: ['id'],
    },
  },
  {
    name: 'mark_push_clicked',
    description: '标记推送为已点击',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '推送历史 ID' } },
      required: ['id'],
    },
  },
  {
    name: 'revoke_push',
    description: '撤销一条推送',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '推送历史 ID' } },
      required: ['id'],
    },
  },
  {
    name: 'preview_template',
    description: '预览推送模板（渲染变量）',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '模板 ID' },
        variables: { type: 'string', description: '变量键值对 JSON，如 {"name":"张三"}' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_template_variables',
    description: '获取模板中的变量列表',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '模板 ID' } },
      required: ['id'],
    },
  },
  {
    name: 'delete_scheduled_push',
    description: '删除定时推送任务',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '定时任务 ID' } },
      required: ['id'],
    },
  },
  {
    name: 'batch_cancel_scheduled',
    description: '批量取消定时推送任务',
    inputSchema: {
      type: 'object',
      properties: { ids: { type: 'string', description: '定时任务 ID 列表，逗号分隔' } },
      required: ['ids'],
    },
  },
  {
    name: 'batch_enable_scheduled',
    description: '批量启用已取消/失败的定时任务',
    inputSchema: {
      type: 'object',
      properties: { ids: { type: 'string', description: '定时任务 ID 列表，逗号分隔' } },
      required: ['ids'],
    },
  },
  {
    name: 'batch_delete_scheduled',
    description: '批量删除定时推送任务',
    inputSchema: {
      type: 'object',
      properties: { ids: { type: 'string', description: '定时任务 ID 列表，逗号分隔' } },
      required: ['ids'],
    },
  },
  {
    name: 'get_overdue_tasks',
    description: '获取所有超时的定时任务',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'batch_delete_groups',
    description: '批量删除渠道分组',
    inputSchema: {
      type: 'object',
      properties: { ids: { type: 'string', description: '分组 ID 列表，逗号分隔' } },
      required: ['ids'],
    },
  },
  {
    name: 'batch_send_to_groups',
    description: '向指定渠道分组发送推送',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '推送标题' },
        body: { type: 'string', description: '推送内容' },
        groupIds: { type: 'string', description: '分组 ID 列表，逗号分隔' },
        url: { type: 'string', description: '跳转链接' },
      },
      required: ['title', 'groupIds'],
    },
  },
  {
    name: 'get_2fa_status',
    description: '获取当前用户的 2FA 状态',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'setup_2fa',
    description: '设置双因素认证，返回密钥和二维码',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'verify_2fa_setup',
    description: '验证 2FA 验证码并启用',
    inputSchema: {
      type: 'object',
      properties: { code: { type: 'string', description: '认证器 App 显示的 6 位验证码' } },
      required: ['code'],
    },
  },
  {
    name: 'disable_2fa',
    description: '禁用双因素认证',
    inputSchema: {
      type: 'object',
      properties: { code: { type: 'string', description: '当前 6 位验证码' } },
      required: ['code'],
    },
  },
  {
    name: 'save_backup_endpoint',
    description: '添加或更新备份端点配置',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '端点 ID（更新时必填）' },
        name: { type: 'string', description: '端点名称' },
        type: { type: 'string', description: '类型：s3 / webdav / r2', enum: ['s3', 'webdav', 'r2'] },
        enabled: { type: 'string', description: '是否启用：true / false' },
        endpoint: { type: 'string', description: 'S3 端点 URL' },
        accessKeyId: { type: 'string', description: 'S3 访问密钥' },
        secretAccessKey: { type: 'string', description: 'S3 秘密密钥' },
        bucket: { type: 'string', description: 'S3 存储桶' },
        region: { type: 'string', description: 'S3 区域' },
        url: { type: 'string', description: 'WebDAV URL' },
        username: { type: 'string', description: 'WebDAV 用户名' },
        password: { type: 'string', description: 'WebDAV 密码' },
        path: { type: 'string', description: '存储路径' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'delete_backup_endpoint',
    description: '删除备份端点配置',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '端点 ID' } },
      required: ['id'],
    },
  },
  {
    name: 'test_backup_endpoint',
    description: '测试备份端点的连通性',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '端点 ID' } },
      required: ['id'],
    },
  },
  {
    name: 'delete_backup',
    description: '删除备份文件',
    inputSchema: {
      type: 'object',
      properties: {
        endpointId: { type: 'string', description: '端点 ID' },
        key: { type: 'string', description: '备份文件 key' },
      },
      required: ['endpointId', 'key'],
    },
  },
  {
    name: 'restore_backup',
    description: '从备份端点恢复数据',
    inputSchema: {
      type: 'object',
      properties: {
        endpointId: { type: 'string', description: '端点 ID' },
        key: { type: 'string', description: '备份文件 key' },
      },
      required: ['endpointId', 'key'],
    },
  },
  {
    name: 'import_data',
    description: '导入备份数据',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'JSON 格式的备份数据字符串' },
        mergeMode: { type: 'string', description: '导入模式：overwrite / merge', enum: ['overwrite', 'merge'] },
      },
      required: ['data'],
    },
  },
  {
    name: 'validate_backup_data',
    description: '验证备份数据格式',
    inputSchema: {
      type: 'object',
      properties: { data: { type: 'string', description: 'JSON 格式的备份数据字符串' } },
      required: ['data'],
    },
  },
  {
    name: 'get_backup_history',
    description: '获取备份历史记录',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'delete_backup_record',
    description: '删除备份历史记录',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '备份记录 ID' } },
      required: ['id'],
    },
  },
  {
    name: 'get_webhook_url',
    description: '获取 Webhook 推送 URL',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_avatar_status',
    description: '检查头像存储服务状态',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'test_bark_key',
    description: '测试 Bark Key 是否有效',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Bark Key' },
        server: { type: 'string', description: 'Bark 服务器地址，默认 https://api.day.app' },
      },
      required: ['key'],
    },
  },
  {
    name: 'get_push_version_detail',
    description: '获取推送版本详情',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '推送历史 ID' } },
      required: ['id'],
    },
  },
  {
    name: 'compare_push_versions',
    description: '对比两个推送版本的差异',
    inputSchema: {
      type: 'object',
      properties: {
        id1: { type: 'string', description: '第一个推送 ID' },
        id2: { type: 'string', description: '第二个推送 ID' },
      },
      required: ['id1', 'id2'],
    },
  },
  {
    name: 'run_backup_single',
    description: '备份到指定端点',
    inputSchema: {
      type: 'object',
      properties: { endpointId: { type: 'string', description: '备份端点 ID' } },
      required: ['endpointId'],
    },
  },
  // ==================== 管理员工具 ====================
  {
    name: 'get_system_status',
    description: '获取系统健康状态和统计信息（仅管理员）',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'list_users',
    description: '获取所有用户列表（仅管理员）',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'create_user',
    description: '创建新用户（仅管理员）',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: '用户邮箱' },
        password: { type: 'string', description: '密码（至少 8 位）' },
        role: { type: 'string', description: '角色：admin / user / viewer', enum: ['admin', 'user', 'viewer'] },
      },
      required: ['email', 'password'],
    },
  },
  {
    name: 'update_user_role',
    description: '修改用户角色（仅管理员）',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: '用户 ID' },
        role: { type: 'string', description: '新角色：admin / user / viewer', enum: ['admin', 'user', 'viewer'] },
      },
      required: ['userId', 'role'],
    },
  },
  {
    name: 'disable_user',
    description: '禁用用户账号（仅管理员）',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: '用户 ID' },
        reason: { type: 'string', description: '禁用原因' },
      },
      required: ['userId'],
    },
  },
  {
    name: 'enable_user',
    description: '启用用户账号（仅管理员）',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: '用户 ID' },
      },
      required: ['userId'],
    },
  },
  {
    name: 'delete_user',
    description: '删除用户账号（仅管理员）',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: '用户 ID' },
      },
      required: ['userId'],
    },
  },
  {
    name: 'get_audit_logs',
    description: '获取审计日志列表（仅管理员）',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'string', description: '返回条数，默认 50' },
        action: { type: 'string', description: '按操作类型筛选' },
      },
      required: [],
    },
  },
  {
    name: 'clear_audit_logs',
    description: '清除所有审计日志（仅管理员）',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'get_system_settings',
    description: '获取系统设置（仅管理员）',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'update_system_settings',
    description: '更新系统设置（仅管理员）',
    inputSchema: {
      type: 'object',
      properties: {
        turnstile_enabled: { type: 'string', description: '是否启用 Turnstile：true / false' },
        turnstile_site_key: { type: 'string', description: 'Turnstile 站点密钥' },
        turnstile_secret_key: { type: 'string', description: 'Turnstile 密钥' },
        allowed_origins: { type: 'string', description: '允许的跨域来源，逗号分隔' },
        cleanup_push_history_days: { type: 'string', description: '推送历史保留天数' },
        cleanup_audit_log_days: { type: 'string', description: '审计日志保留天数' },
      },
      required: [],
    },
  },
  {
    name: 'get_database_stats',
    description: '获取数据库统计信息（仅管理员）',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'cleanup_database',
    description: '清理过期数据（仅管理员）',
    inputSchema: {
      type: 'object',
      properties: {
        pushHistoryDays: { type: 'string', description: '推送历史保留天数，默认 30' },
        auditLogDays: { type: 'string', description: '审计日志保留天数，默认 90' },
      },
      required: [],
    },
  },
  {
    name: 'archive_push_history',
    description: '归档推送历史（仅管理员）',
    inputSchema: {
      type: 'object',
      properties: {
        archiveAfterDays: { type: 'string', description: '归档 N 天前的数据，默认 30' },
      },
      required: [],
    },
  },
  {
    name: 'list_archives',
    description: '列出归档记录（仅管理员）',
    inputSchema: {
      type: 'object', properties: {}, required: [],
    },
  },
  {
    name: 'restore_archive',
    description: '从归档恢复数据（仅管理员）',
    inputSchema: {
      type: 'object',
      properties: {
        archiveKey: { type: 'string', description: '归档文件的 key' },
      },
      required: ['archiveKey'],
    },
  },
  {
    name: 'get_database_tables',
    description: '获取所有数据库表列表（仅管理员）',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'delete_database_table',
    description: '删除数据库表（仅管理员）',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: '表名' } },
      required: ['name'],
    },
  },
  {
    name: 'cleanup_orphan_tables',
    description: '清理孤立的数据库表（仅管理员）',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_system_health',
    description: '获取系统健康检查报告（仅管理员）',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_analytics_activity',
    description: '获取用户活动分析数据（仅管理员）',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'string', description: '统计天数，默认 7' } },
      required: [],
    },
  },
  {
    name: 'get_metrics',
    description: '获取系统指标统计（仅管理员）',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

// ==================== 工具处理函数 ====================

async function handleSendPush(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const title = String(args.title || '');
  const body = args.body ? String(args.body) : '';
  const url = args.url ? String(args.url) : '';
  const channels = args.channels
    ? String(args.channels)
        .split(',')
        .map((c) => c.trim() as PushChannel)
        .filter(Boolean)
    : undefined;

  if (!title) {
    throw new Error('推送标题不能为空');
  }

  const results = await dispatchPushWithOptions(
    { title, body, url },
    channels,
    username,
    env,
    { concurrent: true }
  );

  const allSuccess = results.every((r) => r.success);
  return {
    success: allSuccess,
    summary: allSuccess
      ? `推送成功，已发送到 ${results.length} 个渠道`
      : `部分渠道推送失败（${results.filter((r) => !r.success).length}/${results.length}）`,
    results: results.map((r: ChannelResult) => ({
      channel: r.channel,
      success: r.success,
      message: r.message,
    })),
  };
}

async function handleListChannels(
  env: Env,
  username: string
): Promise<unknown> {
  const settings = await loadUserChannelSettings(username, env);

  return CHANNEL_DEFINITIONS.map((ch) => {
    const enabled = settings[`channel:${ch.id}:enabled`];
    return {
      id: ch.id,
      name: ch.name,
      icon: ch.icon,
      enabled: enabled !== 'false',
      supportsMarkdown: ch.supportsMarkdown,
    };
  });
}

async function handleCreateScheduledPush(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const title = String(args.title || '');
  const body = args.body ? String(args.body) : '';
  const channels = String(args.channels || '')
    .split(',')
    .map((c) => c.trim() as PushChannel)
    .filter(Boolean);
  const scheduledAt = String(args.scheduledAt || '');
  const scheduleType = (args.scheduleType as string) || 'once';
  const recurringType = args.recurringType as string | undefined;
  const timezone = String(args.timezone || 'Asia/Shanghai');
  const url = args.url ? String(args.url) : '';

  if (!title) throw new Error('推送标题不能为空');
  if (!scheduledAt) throw new Error('执行时间不能为空');
  if (channels.length === 0) throw new Error('至少需要一个推送渠道');

  let selectedWeekDays: number[] | undefined;
  if (args.selectedWeekDays) {
    selectedWeekDays = String(args.selectedWeekDays)
      .split(',')
      .map((d) => parseInt(d.trim(), 10))
      .filter((d) => !isNaN(d) && d >= 0 && d <= 6);
  }

  const pushService = new PushService(env, username);
  const push = await pushService.createScheduledPush({
    title,
    content: body,
    channels,
    url: url || undefined,
    scheduledAt,
    scheduleType: scheduleType as 'once' | 'recurring',
    recurringType: recurringType as ScheduledPush['recurringType'],
    selectedWeekDays,
    cronExpression: args.cronExpression ? String(args.cronExpression) : undefined,
    timezone,
  });

  return {
    id: push.id,
    title: push.title,
    content: push.content,
    channels: push.channels,
    scheduledAt: push.scheduledAt,
    scheduleType: push.scheduleType,
    recurringType: push.recurringType,
    selectedWeekDays: push.selectedWeekDays,
    status: push.status,
    timezone: push.timezone,
  };
}

async function handleCancelScheduledPush(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const id = String(args.id || '');
  if (!id) throw new Error('定时任务 ID 不能为空');

  const pushService = new PushService(env, username);
  const cancelled = await pushService.cancelScheduledPush(id);

  return {
    success: cancelled,
    message: cancelled ? '定时任务已取消' : '未找到该任务或状态不允许取消',
  };
}

async function handleUpdateScheduledPush(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const id = String(args.id || '');
  if (!id) throw new Error('定时任务 ID 不能为空');

  const pushService = new PushService(env, username);
  const updates: Record<string, unknown> = {};

  if (args.title !== undefined) updates.title = String(args.title);
  if (args.body !== undefined) updates.content = String(args.body);
  if (args.url !== undefined) updates.url = String(args.url);
  if (args.scheduleType !== undefined) updates.scheduleType = args.scheduleType;
  if (args.recurringType !== undefined) updates.recurringType = args.recurringType;
  if (args.timezone !== undefined) updates.timezone = String(args.timezone);
  if (args.cronExpression !== undefined) updates.cronExpression = String(args.cronExpression);
  if (args.scheduledAt !== undefined) updates.scheduledAt = String(args.scheduledAt);
  if (args.channels !== undefined) {
    updates.channels = String(args.channels)
      .split(',')
      .map((c) => c.trim() as PushChannel)
      .filter(Boolean);
  }
  if (args.selectedWeekDays !== undefined) {
    updates.selectedWeekDays = String(args.selectedWeekDays)
      .split(',')
      .map((d) => parseInt(d.trim(), 10))
      .filter((d) => !isNaN(d) && d >= 0 && d <= 6);
  }

  const updated = await pushService.updateScheduledPush(id, updates as any);
  if (!updated) {
    return { success: false, message: '未找到该任务或状态不允许编辑' };
  }
  return {
    success: true,
    scheduled: {
      id: updated.id,
      title: updated.title,
      content: updated.content,
      channels: updated.channels,
      scheduledAt: updated.scheduledAt,
      scheduleType: updated.scheduleType,
      recurringType: updated.recurringType,
      status: updated.status,
      timezone: updated.timezone,
    },
  };
}

async function handleRescheduleOverdueTask(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const id = String(args.id || '');
  const scheduledAt = String(args.scheduledAt || '');
  if (!id) throw new Error('超时任务 ID 不能为空');
  if (!scheduledAt) throw new Error('新的执行时间不能为空');

  const pushService = new PushService(env, username);
  const updated = await pushService.rescheduleOverdueTask(id, scheduledAt);

  if (!updated) {
    return { success: false, message: '未找到该超时任务' };
  }
  return {
    success: true,
    scheduled: {
      id: updated.id,
      title: updated.title,
      scheduledAt: updated.scheduledAt,
      status: updated.status,
    },
  };
}

async function handleGetScheduledPushDetail(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const id = String(args.id || '');
  if (!id || !env.DB) return null;

  const result = await env.DB.prepare(
    'SELECT * FROM scheduled_pushes WHERE id = ? AND user_id = ?'
  )
    .bind(id, username)
    .first();

  if (!result) return null;

  const r = result as Record<string, unknown>;
  return {
    id: r.id,
    title: r.title,
    content: r.body,
    channels: r.channels ? JSON.parse(r.channels as string) : [],
    url: r.url,
    scheduledAt: r.next_run && (r.next_run as number) > 0
      ? new Date(((r.next_run as number) > 1e12 ? (r.next_run as number) : (r.next_run as number) * 60000)).toISOString()
      : null,
    scheduleType: r.enabled === 1 ? 'recurring' : 'once',
    recurringType: r.recurring_type,
    selectedWeekDays: r.selected_week_days ? JSON.parse(r.selected_week_days as string) : undefined,
    cronExpression: r.cron,
    status: r.status,
    enabled: r.enabled === 1,
    timezone: r.timezone || 'Asia/Shanghai',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function handleListScheduledPushes(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const pushService = new PushService(env, username);
  const status = args.status as string | undefined;
  const pushes = await pushService.getScheduledPushes(
    status as 'pending' | 'processing' | 'completed' | 'failed' | 'overdue' | undefined
  );

  return pushes.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    scheduleType: p.scheduleType,
    recurringType: p.recurringType,
    scheduledAt: p.scheduledAt,
    nextRun: p.nextRun,
    channels: p.channels,
    enabled: p.enabled,
    timezone: p.timezone,
  }));
}

async function handleGetPushHistory(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const limit = Math.min(Math.max(parseInt(String(args.limit || '10'), 10) || 10, 1), 100);
  if (!env.DB) return { history: [] };

  const result = await env.DB.prepare(
    `SELECT * FROM push_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
  )
    .bind(username, limit)
    .all();

  return {
    history: (result.results || []).map((r: Record<string, unknown>) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      status: r.status,
      channels: r.channels ? JSON.parse(r.channels as string) : [],
      createdAt: r.created_at,
    })),
  };
}

async function handleGetPushHistoryDetail(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const id = String(args.id || '');
  if (!id || !env.DB) return null;

  const result = await env.DB.prepare(
    `SELECT * FROM push_history WHERE id = ? AND user_id = ?`
  )
    .bind(id, username)
    .first();

  if (!result) return null;

  const r = result as Record<string, unknown>;
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    url: r.url,
    imageUrl: r.image_url,
    markdown: r.markdown === 1,
    channels: r.channels ? JSON.parse(r.channels as string) : [],
    results: r.results ? JSON.parse(r.results as string) : [],
    status: r.status,
    createdAt: r.created_at,
    deliveredAt: r.delivered_at,
    readAt: r.read_at,
    clickedAt: r.clicked_at,
  };
}

async function handleGetExecutionLogs(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const limit = Math.min(Math.max(parseInt(String(args.limit || '10'), 10) || 10, 1), 100);
  if (!env.DB) return { logs: [] };

  const result = await env.DB.prepare(
    `SELECT * FROM push_execution_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
  )
    .bind(username, limit)
    .all();

  return {
    logs: (result.results || []).map((r: Record<string, unknown>) => ({
      id: r.id,
      pushHistoryId: r.push_history_id,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      status: r.status,
      channels: r.channels ? JSON.parse(r.channels as string) : [],
      channelResults: r.channel_results ? JSON.parse(r.channel_results as string) : [],
      errorMessage: r.error_message,
      createdAt: r.created_at,
    })),
  };
}

async function handleTestChannel(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const channel = String(args.channel || '') as PushChannel;
  if (!channel) throw new Error('渠道标识不能为空');

  const results = await dispatchPushWithOptions(
    { title: '渠道测试', body: `这是一条来自 MCP 的测试消息，用于验证 ${channel} 渠道。` },
    [channel],
    username,
    env,
  );

  const result = results[0];
  return {
    channel,
    healthy: result?.success,
    message: result?.success ? '渠道正常' : result?.message,
    testedAt: new Date().toISOString(),
  };
}

async function handleCheckAllChannelsHealth(
  env: Env,
  username: string
): Promise<unknown> {
  const settings = await loadUserChannelSettings(username, env);

  const results = await Promise.all(
    CHANNEL_DEFINITIONS.map(async (ch) => {
      const channelPrefix = `channel:${ch.id}:`;
      const isConfigured = Object.keys(settings).some((key) => key.startsWith(channelPrefix));

      if (!isConfigured) {
        return { channel: ch.id, healthy: false, message: '渠道未配置', testedAt: new Date().toISOString() };
      }

      const res = await dispatchPushWithOptions(
        { title: '渠道健康检查', body: `验证 ${ch.id} 渠道是否正常工作。` },
        [ch.id as PushChannel],
        username,
        env,
      );

      return {
        channel: ch.id,
        healthy: res[0]?.success,
        message: res[0]?.success ? '渠道正常' : res[0]?.message,
        testedAt: new Date().toISOString(),
      };
    })
  );

  return { channels: results };
}

async function handleGetChannelGroups(
  env: Env,
  username: string
): Promise<unknown> {
  const pushService = new PushService(env, username);
  const groups = await pushService.getChannelGroups();
  return groups;
}

async function handleGetDrafts(
  env: Env,
  username: string
): Promise<unknown> {
  const pushService = new PushService(env, username);
  const drafts = await pushService.getDrafts();
  return drafts;
}

async function handleGetFavorites(
  env: Env,
  username: string
): Promise<unknown> {
  const pushService = new PushService(env, username);
  const favorites = await pushService.getFavorites();
  return favorites;
}

async function handleCreateTemplate(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const pushService = new PushService(env, username);
  const channels = args.channels
    ? String(args.channels).split(',').map((c) => c.trim() as PushChannel).filter(Boolean)
    : [];
  const template = await pushService.saveTemplate({
    name: String(args.name || ''),
    title: String(args.title || ''),
    content: String(args.body || ''),
    channels: channels.length > 0 ? channels : undefined,
    url: args.url ? String(args.url) : undefined,
    category: args.category ? String(args.category) : undefined,
    useMarkdown: false,
    variables: [],
  });
  return template;
}

async function handleUpdateTemplate(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const id = String(args.id || '');
  if (!id) throw new Error('模板 ID 不能为空');
  const pushService = new PushService(env, username);
  const updates: Record<string, unknown> = {};
  if (args.name !== undefined) updates.name = String(args.name);
  if (args.title !== undefined) updates.title = String(args.title);
  if (args.body !== undefined) updates.content = String(args.body);
  if (args.url !== undefined) updates.url = String(args.url);
  if (args.category !== undefined) updates.category = String(args.category);
  if (args.channels !== undefined) {
    updates.channels = String(args.channels).split(',').map((c) => c.trim() as PushChannel).filter(Boolean);
  }
  const updated = await pushService.updateTemplate(id, updates as any);
  if (!updated) throw new Error('未找到该模板');
  return updated;
}

async function handleDeleteTemplate(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const id = String(args.id || '');
  if (!id) throw new Error('模板 ID 不能为空');
  const pushService = new PushService(env, username);
  const deleted = await pushService.deleteTemplate(id);
  return { success: deleted, message: deleted ? '模板已删除' : '未找到该模板' };
}

async function handleCreateChannelGroup(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const pushService = new PushService(env, username);
  const channels = String(args.channels || '').split(',').map((c) => c.trim() as PushChannel).filter(Boolean);
  const group = await pushService.saveChannelGroup({
    name: String(args.name || ''),
    channels,
  });
  return group;
}

async function handleUpdateChannelGroup(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const id = String(args.id || '');
  if (!id) throw new Error('分组 ID 不能为空');
  const pushService = new PushService(env, username);
  const updates: { name?: string; channels?: PushChannel[] } = {};
  if (args.name !== undefined) updates.name = String(args.name);
  if (args.channels !== undefined) {
    updates.channels = String(args.channels).split(',').map((c) => c.trim() as PushChannel).filter(Boolean);
  }
  const updated = await pushService.updateChannelGroup(id, updates);
  if (!updated) throw new Error('未找到该分组');
  return updated;
}

async function handleDeleteChannelGroup(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const id = String(args.id || '');
  if (!id) throw new Error('分组 ID 不能为空');
  const pushService = new PushService(env, username);
  const deleted = await pushService.deleteChannelGroup(id);
  return { success: deleted, message: deleted ? '分组已删除' : '未找到该分组' };
}

async function handleCreateDraft(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const pushService = new PushService(env, username);
  const channels = args.channels
    ? String(args.channels).split(',').map((c) => c.trim() as PushChannel).filter(Boolean)
    : [];
  const draft = await pushService.saveDraft({
    title: String(args.title || ''),
    body: args.body ? String(args.body) : undefined,
    url: args.url ? String(args.url) : undefined,
    channels: channels.length > 0 ? channels : undefined,
  });
  return draft;
}

async function handleUpdateDraft(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const id = String(args.id || '');
  if (!id) throw new Error('草稿 ID 不能为空');
  const pushService = new PushService(env, username);
  const updates: { title?: string; body?: string; url?: string; channels?: PushChannel[] } = {};
  if (args.title !== undefined) updates.title = String(args.title);
  if (args.body !== undefined) updates.body = String(args.body);
  if (args.url !== undefined) updates.url = String(args.url);
  if (args.channels !== undefined) {
    updates.channels = String(args.channels).split(',').map((c) => c.trim() as PushChannel).filter(Boolean);
  }
  const updated = await pushService.updateDraft(id, updates);
  if (!updated) throw new Error('未找到该草稿');
  return updated;
}

async function handleDeleteDraft(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const id = String(args.id || '');
  if (!id) throw new Error('草稿 ID 不能为空');
  const pushService = new PushService(env, username);
  const deleted = await pushService.deleteDraft(id);
  return { success: deleted, message: deleted ? '草稿已删除' : '未找到该草稿' };
}

async function handleCreateFavorite(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const pushService = new PushService(env, username);
  const channels = String(args.channels || '').split(',').map((c) => c.trim() as PushChannel).filter(Boolean);
  if (channels.length === 0) throw new Error('至少需要一个推送渠道');
  const favorite = await pushService.saveFavorite({
    title: String(args.title || ''),
    body: args.body ? String(args.body) : undefined,
    url: args.url ? String(args.url) : undefined,
    channels,
  });
  return favorite;
}

async function handleDeleteFavorite(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const id = String(args.id || '');
  if (!id) throw new Error('收藏 ID 不能为空');
  const pushService = new PushService(env, username);
  const deleted = await pushService.deleteFavorite(id);
  return { success: deleted, message: deleted ? '收藏已删除' : '未找到该收藏' };
}

async function handleDeletePushHistory(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  if (!env.DB) return { success: false, message: '数据库不可用' };
  const ids = args.ids ? String(args.ids).split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (ids.length === 0) {
    await deletePushHistory(username, env);
    return { success: true, message: '全部推送历史已删除' };
  }
  const result = await batchDeletePushHistory(username, env, ids);
  return result;
}

async function handleSaveChannelConfig(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const channel = String(args.channel || '');
  if (!channel) throw new Error('渠道标识不能为空');

  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(args)) {
    if (key !== 'channel' && value !== undefined) {
      fields[key] = String(value);
    }
  }

  await saveUserChannelSetting(username, channel, fields, env);
  return { success: true, channel, message: '渠道配置已保存' };
}

async function handleListBackupEndpoints(
  env: Env,
  username: string
): Promise<unknown> {
  const endpoints = await getBackupEndpoints(env, username);
  return endpoints.map((ep) => ({
    id: ep.id,
    name: ep.name,
    type: ep.type,
    enabled: ep.enabled,
    schedule: ep.schedule,
    lastBackup: ep.lastBackup,
  }));
}

async function handleRunBackup(
  env: Env,
  username: string
): Promise<unknown> {
  const results = await executeAllBackups(env, username);
  return {
    success: results.every((r) => r.success),
    results: results.map((r) => ({
      endpointId: r.endpointId,
      endpointName: r.endpointName,
      success: r.success,
      message: r.message,
    })),
  };
}

async function handleListBackups(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const endpointId = String(args.endpointId || '');
  if (!endpointId) throw new Error('备份端点 ID 不能为空');

  const { getBackupEndpoint } = await import('./backup');
  const endpoint = await getBackupEndpoint(env, username, endpointId);
  if (!endpoint) throw new Error('未找到该备份端点');

  const backups = await listBackupsFromEndpoint(env, username, endpoint);
  return { endpointId, endpointName: endpoint.name, backups };
}

async function handleGetUserSettings(
  env: Env,
  username: string
): Promise<unknown> {
  const userService = new UserService(env);
  const user = await userService.findByEmail(username);
  if (!user) throw new Error('用户不存在');
  return {
    email: user.email,
    role: user.role,
    settings: await userService.getUserSettings(user.id),
    allowedIPs: await userService.getAllowedIPs(user.id),
  };
}

async function handleGetAllowedIPs(
  env: Env,
  username: string
): Promise<unknown> {
  const userService = new UserService(env);
  const user = await userService.findByEmail(username);
  if (!user) return { allowedIPs: [] };
  return { allowedIPs: await userService.getAllowedIPs(user.id) };
}

async function handleExportData(
  env: Env,
  username: string
): Promise<unknown> {
  const { exportData } = await import('./backup');
  const data = await exportData(env, username);
  return data;
}

async function handleGetCurrentUser(env: Env, username: string): Promise<unknown> {
  const userService = new UserService(env);
  const user = await userService.findByEmail(username);
  if (!user) throw new Error('用户不存在');
  return { id: user.id, email: user.email, role: user.role, disabled: user.disabled, avatar_url: user.avatar_url };
}

async function handleUpdateAvatar(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const userService = new UserService(env);
  const user = await userService.findByEmail(username);
  if (!user) throw new Error('用户不存在');
  const updates: Record<string, unknown> = {};
  if (args.avatar_url !== undefined) updates.avatar_url = String(args.avatar_url);
  if (args.use_avatar_as_popup !== undefined) updates.use_avatar_as_popup = parseInt(String(args.use_avatar_as_popup), 10) || 0;
  const updated = await userService.updateUser(user.id, updates);
  return { success: true, avatar_url: updated?.avatar_url };
}

async function handleUpdateCacheSettings(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const userService = new UserService(env);
  const user = await userService.findByEmail(username);
  if (!user) throw new Error('用户不存在');
  const settings: Record<string, number> = {};
  for (const key of ['cache_ttl_backup', 'cache_ttl_channels', 'cache_ttl_templates', 'cache_ttl_groups', 'cache_ttl_scheduled']) {
    if (args[key] !== undefined) settings[key] = parseInt(String(args[key]), 10) || 0;
  }
  await userService.saveCacheSettings(user.id, settings as any);
  return { success: true };
}

async function handleUpdateAISettings(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const userService = new UserService(env);
  const user = await userService.findByEmail(username);
  if (!user) throw new Error('用户不存在');
  const settings: Record<string, unknown> = {};
  if (args.ai_enabled !== undefined) settings.ai_enabled = args.ai_enabled === 'true';
  if (args.ai_provider !== undefined) settings.ai_provider = String(args.ai_provider);
  if (args.ai_api_key !== undefined) settings.ai_api_key = String(args.ai_api_key);
  if (args.ai_api_url !== undefined) settings.ai_api_url = String(args.ai_api_url);
  if (args.ai_model_name !== undefined) settings.ai_model_name = String(args.ai_model_name);
  await userService.saveAISettings(user.id, settings as any);
  return { success: true };
}

async function handleGetAITools(env: Env, username: string): Promise<unknown> {
  const userService = new UserService(env);
  const user = await userService.findByEmail(username);
  if (!user) throw new Error('用户不存在');
  const settings = await userService.getAISettings(user.id);
  return { tools: userService.getUserAITools(settings) };
}

async function handleGetExecutionLogDetail(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const id = String(args.id || '');
  if (!id || !env.DB) return null;
  const result = await env.DB.prepare('SELECT * FROM push_execution_logs WHERE id = ? AND user_id = ?').bind(id, username).first();
  if (!result) return null;
  const r = result as Record<string, unknown>;
  return {
    id: r.id, pushHistoryId: r.push_history_id, startedAt: r.started_at, finishedAt: r.finished_at,
    status: r.status, channels: JSON.parse((r.channels as string) || '[]'),
    channelResults: JSON.parse((r.channel_results as string) || '[]'),
    errorMessage: r.error_message, createdAt: r.created_at,
  };
}

async function handleGetPushHistoryFiltered(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await getPushHistory(username, env, {
    page: parseInt(String(args.page || '1'), 10) || 1,
    pageSize: parseInt(String(args.pageSize || '20'), 10) || 20,
    channel: args.channel ? String(args.channel) : undefined,
    status: args.status ? String(args.status) : undefined,
    keyword: args.keyword ? String(args.keyword) : undefined,
  });
  return result;
}

async function handleBatchDeleteHistoryByFilter(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await batchDeletePushHistoryByFilter(username, env, {
    olderThan: args.olderThan ? String(args.olderThan) : undefined,
    channel: args.channel ? String(args.channel) : undefined,
    status: args.status ? String(args.status) : undefined,
  });
  return result;
}

async function handleMarkPushDelivered(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const pushService = new PushService(env, username);
  const result = await pushService.markDelivered(String(args.id || ''));
  return { success: result };
}
async function handleMarkPushRead(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const pushService = new PushService(env, username);
  const result = await pushService.markRead(String(args.id || ''));
  return { success: result };
}
async function handleMarkPushClicked(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const pushService = new PushService(env, username);
  const result = await pushService.markClicked(String(args.id || ''));
  return { success: result };
}
async function handleRevokePush(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const pushService = new PushService(env, username);
  const result = await pushService.revokePush(String(args.id || ''));
  return { success: result };
}

async function handlePreviewTemplate(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const id = String(args.id || '');
  const pushService = new PushService(env, username);
  const template = await pushService['getTemplateById'](id);
  if (!template) throw new Error('模板不存在');
  const variables = args.variables ? JSON.parse(String(args.variables)) : {};
  return {
    id: template.id, name: template.name,
    title: replaceTemplateVariables(template.title, variables),
    content: replaceTemplateVariables(template.content, variables),
  };
}

async function handleGetTemplateVariables(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const id = String(args.id || '');
  const pushService = new PushService(env, username);
  const template = await pushService['getTemplateById'](id);
  if (!template) throw new Error('模板不存在');
  const titleVars = extractVariables(template.title);
  const contentVars = extractVariables(template.content);
  return { variables: [...new Set([...titleVars, ...contentVars])] };
}

async function handleDeleteScheduledPush(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const pushService = new PushService(env, username);
  const deleted = await pushService.deleteScheduledPush(String(args.id || ''));
  return { success: deleted };
}

async function handleBatchCancelScheduled(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const ids = String(args.ids || '').split(',').map((s) => s.trim()).filter(Boolean);
  const pushService = new PushService(env, username);
  return await pushService.batchCancelScheduledPushes(ids);
}

async function handleBatchEnableScheduled(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const ids = String(args.ids || '').split(',').map((s) => s.trim()).filter(Boolean);
  const pushService = new PushService(env, username);
  return await pushService.batchEnableScheduledPushes(ids);
}

async function handleBatchDeleteScheduled(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const ids = String(args.ids || '').split(',').map((s) => s.trim()).filter(Boolean);
  let deleted = 0;
  const pushService = new PushService(env, username);
  for (const id of ids) { if (await pushService.deleteScheduledPush(id)) deleted++; }
  return { deleted, total: ids.length };
}

async function handleGetOverdueTasks(env: Env, username: string): Promise<unknown> {
  const pushService = new PushService(env, username);
  return await pushService.getOverdueTasks();
}

async function handleBatchDeleteGroups(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const ids = String(args.ids || '').split(',').map((s) => s.trim()).filter(Boolean);
  const pushService = new PushService(env, username);
  let deleted = 0;
  for (const id of ids) { if (await pushService.deleteChannelGroup(id)) deleted++; }
  return { deleted, total: ids.length };
}

async function handleBatchSendToGroups(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const title = String(args.title || '');
  const body = args.body ? String(args.body) : '';
  const url = args.url ? String(args.url) : '';
  const groupIds = String(args.groupIds || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!title) throw new Error('推送标题不能为空');
  if (groupIds.length === 0) throw new Error('至少需要一个分组');
  const pushService = new PushService(env, username);
  const allChannels: PushChannel[] = [];
  for (const gid of groupIds) {
    const group = await pushService['getChannelGroupById'](gid);
    if (group) allChannels.push(...group.channels);
  }
  const uniqueChannels = [...new Set(allChannels)];
  if (uniqueChannels.length === 0) throw new Error('未找到有效的渠道');
  return await dispatchPushWithOptions({ title, body, url }, uniqueChannels, username, env);
}

async function handleGet2FAStatus(env: Env, username: string): Promise<unknown> {
  const userService = new UserService(env);
  const user = await userService.findByEmail(username);
  return { enabled: !!user?.totp_enabled, hasSecret: !!user?.totp_secret };
}

async function handleSetup2FA(env: Env, username: string): Promise<unknown> {
  const secret = generateTOTPSecret();
  const otpauthUrl = `otpauth://totp/BeeSwarm:${encodeURIComponent(username)}?secret=${secret}&issuer=BeeSwarm&algorithm=SHA1&digits=6&period=30`;
  const qrCode = await generateQRCodeDataURL(otpauthUrl);
  const userService = new UserService(env);
  const user = await userService.findByEmail(username);
  if (!user) throw new Error('用户不存在');
  await userService.updateUser(user.id, { totp_secret: secret });
  return { secret, qrCode, otpauthUrl };
}

async function handleVerify2FASetup(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const code = String(args.code || '');
  const userService = new UserService(env);
  const user = await userService.findByEmail(username);
  if (!user?.totp_secret) throw new Error('请先生成 TOTP secret');
  const valid = await verifyTOTP(user.totp_secret, code);
  if (!valid) throw new Error('验证码无效');
  await userService.updateUser(user.id, { totp_enabled: 1 });
  return { success: true, message: '2FA 已启用' };
}

async function handleDisable2FA(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const code = String(args.code || '');
  const userService = new UserService(env);
  const user = await userService.findByEmail(username);
  if (!user?.totp_secret) throw new Error('2FA 未设置');
  const valid = await verifyTOTP(user.totp_secret, code);
  if (!valid) throw new Error('验证码无效');
  await userService.updateUser(user.id, { totp_enabled: 0, totp_secret: null });
  return { success: true, message: '2FA 已禁用' };
}

async function handleSaveBackupEndpoint(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const endpoint = {
    id: args.id ? String(args.id) : crypto.randomUUID(),
    name: String(args.name || ''),
    type: String(args.type || 's3') as any,
    enabled: args.enabled !== 'false',
    config: {} as any,
    schedule: { enabled: false, interval: 24, startTime: '02:00' },
    retention: 30,
  };
  if (args.type === 's3' || args.type === undefined) {
    endpoint.config = { endpoint: args.endpoint || '', accessKeyId: args.accessKeyId || '', secretAccessKey: args.secretAccessKey || '', bucket: args.bucket || '', region: args.region || '', path: args.path || '' };
  } else if (args.type === 'webdav') {
    endpoint.config = { url: args.url || '', username: args.username || '', password: args.password || '', path: args.path || '' };
  } else {
    endpoint.config = { path: args.path || '' };
  }
  await saveBackupEndpoint(env, username, endpoint as any);
  return { success: true, id: endpoint.id };
}

async function handleDeleteBackupEndpoint(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const deleted = await deleteBackupEndpoint(env, username, String(args.id || ''));
  return { success: deleted };
}

async function handleTestBackupEndpoint(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const { getBackupEndpoint } = await import('./backup');
  const endpoint = await getBackupEndpoint(env, username, String(args.id || ''));
  if (!endpoint) throw new Error('未找到该备份端点');
  const result = await testBackupEndpoint(endpoint, env);
  return result;
}

async function handleDeleteBackup(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const { getBackupEndpoint } = await import('./backup');
  const endpoint = await getBackupEndpoint(env, username, String(args.endpointId || ''));
  if (!endpoint) throw new Error('未找到该备份端点');
  return await deleteBackupFromEndpoint(env, username, endpoint, String(args.key || ''));
}

async function handleRestoreBackup(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const { getBackupEndpoint } = await import('./backup');
  const endpoint = await getBackupEndpoint(env, username, String(args.endpointId || ''));
  if (!endpoint) throw new Error('未找到该备份端点');
  return await restoreFromEndpoint(env, username, endpoint, String(args.key || ''));
}

async function handleImportData(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const data = JSON.parse(String(args.data || '{}'));
  const mergeMode = (String(args.mergeMode || 'overwrite') as 'overwrite' | 'merge');
  return await importData(env, username, data, { mergeMode });
}

async function handleValidateBackupData(env: Env, args: Record<string, unknown>): Promise<unknown> {
  const data = JSON.parse(String(args.data || '{}'));
  return validateBackup(data);
}

async function handleGetBackupHistory(env: Env, username: string): Promise<unknown> {
  return await getBackupHistory(env, username);
}

async function handleDeleteBackupRecord(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  await deleteBackupRecordItem(env, String(args.id || ''), username);
  return { success: true };
}

async function handleGetWebhookUrl(env: Env, username: string): Promise<unknown> {
  const baseUrl = env.ALLOWED_ORIGINS?.split(',')[0] || '';
  return { webhookUrl: `${baseUrl}/api/webhook/push?token=${username}` };
}

async function handleGetAvatarStatus(env: Env, username: string): Promise<unknown> {
  const endpoints = await getBackupEndpoints(env, username);
  const r2Endpoint = endpoints.find((e) => e.type === 'r2' && e.r2_domain);
  const hasUserR2 = !!r2Endpoint;
  return { hasR2: hasUserR2, storageType: hasUserR2 ? 'r2' : 'base64', message: hasUserR2 ? '头像存储服务可用' : '头像将使用 base64 存储' };
}

async function handleTestBarkKey(env: Env, args: Record<string, unknown>): Promise<unknown> {
  const key = String(args.key || '');
  const server = String(args.server || 'https://api.day.app');
  if (!key) throw new Error('Bark Key 不能为空');
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) throw new Error('Bark Key 包含非法字符');
  try {
    const serverUrl = new URL(server);
    if (serverUrl.protocol !== 'https:') throw new Error('Server 必须是 HTTPS');
    const testUrl = new URL(`${server}/${key}/测试标题`);
    testUrl.searchParams.set('body', '这是一条测试消息');
    const res = await fetch(testUrl.toString());
    const data = await res.json() as { code: number; message: string };
    return { success: data.code === 200, message: data.code === 200 ? 'Bark Key 有效' : data.message };
  } catch (err) {
    return { success: false, message: (err as Error).message };
  }
}

async function handleGetPushVersionDetail(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const id = String(args.id || '');
  if (!id || !env.DB) return null;
  const result = await env.DB.prepare('SELECT id, title, body, url, channels, status, created_at FROM push_history WHERE id = ? AND user_id = ?').bind(id, username).first();
  if (!result) return null;
  const r = result as Record<string, unknown>;
  return { id: r.id, title: r.title, body: r.body, url: r.url, channels: JSON.parse((r.channels as string) || '[]'), status: r.status, createdAt: r.created_at };
}

async function handleComparePushVersions(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const id1 = String(args.id1 || '');
  const id2 = String(args.id2 || '');
  if (!id1 || !id2 || !env.DB) throw new Error('需要两个推送 ID');
  const result = await env.DB.prepare('SELECT id, title, body, url, channels, status, created_at FROM push_history WHERE id IN (?, ?) AND user_id = ?').bind(id1, id2, username).all();
  const records = (result.results || []).map((r: Record<string, unknown>) => ({ id: r.id, title: r.title, body: r.body, url: r.url, channels: JSON.parse((r.channels as string) || '[]'), status: r.status, createdAt: r.created_at }));
  if (records.length !== 2) throw new Error('未找到两个推送记录');
  const diff: Record<string, { old: unknown; new: unknown }> = {};
  for (const key of ['title', 'body', 'url', 'status'] as const) {
    if (records[0][key] !== records[1][key]) { diff[key] = { old: records[0][key], new: records[1][key] }; }
  }
  return { version1: records[0], version2: records[1], diff };
}

async function handleRunBackupSingle(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const endpointId = String(args.endpointId || '');
  if (!endpointId) throw new Error('端点 ID 不能为空');
  const endpoints = await getBackupEndpoints(env, username);
  const endpoint = endpoints.find((e) => e.id === endpointId);
  if (!endpoint) throw new Error('未找到该备份端点');
  if (!endpoint.enabled) throw new Error('该备份端点已禁用');
  const { uploadBackupToEndpoint, saveBackupEndpoint } = await import('./backup');
  const result = await uploadBackupToEndpoint(env, username, endpoint);
  endpoint.lastBackup = { time: new Date().toISOString(), status: result.success ? 'success' : 'failed', message: result.message };
  await saveBackupEndpoint(env, username, endpoint);
  return { ...result, endpointName: endpoint.name };
}

// ==================== 管理员工具处理函数 ====================

async function handleListUsers(env: Env): Promise<unknown> {
  if (!env.DB) return { users: [] };
  const result = await env.DB.prepare(
    "SELECT id, email, role, disabled, disabled_reason, created_at FROM users ORDER BY created_at ASC LIMIT 500"
  ).all();
  return { users: result.results || [] };
}

async function handleCreateUser(env: Env, args: Record<string, unknown>): Promise<unknown> {
  const { hashPassword } = await import('../utils/password');
  const email = String(args.email || '');
  const password = String(args.password || '');
  const role = (args.role as string) || 'user';

  if (!email || !password) throw new Error('邮箱和密码不能为空');
  if (password.length < 8) throw new Error('密码至少 8 位');

  const userService = new UserService(env);
  const hashed = await hashPassword(password);
  const user = await userService.createUser(email, hashed, role as any);
  return { id: user.id, email: user.email, role: user.role };
}

async function handleUpdateUserRole(env: Env, args: Record<string, unknown>): Promise<unknown> {
  const userId = String(args.userId || '');
  const role = String(args.role || '');
  if (!userId || !role) throw new Error('用户 ID 和角色不能为空');

  const userService = new UserService(env);
  const updated = await userService.updateUser(userId, { role: role as any });
  if (!updated) throw new Error('未找到该用户');
  return { success: true, email: updated.email, role: updated.role };
}

async function handleDisableUser(env: Env, args: Record<string, unknown>): Promise<unknown> {
  const userId = String(args.userId || '');
  if (!userId) throw new Error('用户 ID 不能为空');

  const userService = new UserService(env);
  const reason = args.reason ? String(args.reason) : undefined;
  const updated = await userService.updateUser(userId, { disabled: 1, disabled_reason: reason || null });
  if (!updated) throw new Error('未找到该用户');
  return { success: true, email: updated.email, disabled: true, reason };
}

async function handleEnableUser(env: Env, args: Record<string, unknown>): Promise<unknown> {
  const userId = String(args.userId || '');
  if (!userId) throw new Error('用户 ID 不能为空');

  const userService = new UserService(env);
  const updated = await userService.updateUser(userId, { disabled: 0, disabled_reason: null });
  if (!updated) throw new Error('未找到该用户');
  return { success: true, email: updated.email, disabled: false };
}

async function handleDeleteUser(env: Env, args: Record<string, unknown>): Promise<unknown> {
  const userId = String(args.userId || '');
  if (!userId) throw new Error('用户 ID 不能为空');

  const userService = new UserService(env);
  const deleted = await userService.deleteUser(userId);
  return { success: deleted, message: deleted ? '用户已删除' : '未找到该用户' };
}

async function handleGetAuditLogs(env: Env, args: Record<string, unknown>): Promise<unknown> {
  const limit = Math.min(Math.max(parseInt(String(args.limit || '50'), 10) || 50, 1), 200);
  const action = args.action ? String(args.action) : undefined;
  if (!env.DB) return { logs: [] };

  let sql = 'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?';
  const params: (string | number)[] = [limit];
  if (action) {
    sql = 'SELECT * FROM audit_logs WHERE action = ? ORDER BY created_at DESC LIMIT ?';
    params.unshift(action);
  }
  const result = await env.DB.prepare(sql).bind(...params).all();
  return { logs: result.results || [] };
}

async function handleClearAuditLogs(env: Env): Promise<unknown> {
  if (!env.DB) return { success: false };
  await env.DB.prepare('DELETE FROM audit_logs').run();
  return { success: true, message: '审计日志已清除' };
}

async function handleGetSystemSettings(env: Env): Promise<unknown> {
  const systemSettings = new SystemSettingsService(env);
  await systemSettings.ensureTable();
  const settings = await systemSettings.getAllSettings();
  return { settings };
}

async function handleUpdateSystemSettings(env: Env, args: Record<string, unknown>): Promise<unknown> {
  const systemSettings = new SystemSettingsService(env);
  await systemSettings.ensureTable();
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value !== undefined) updates[key] = value;
  }
  await systemSettings.saveSettings(updates);
  return { success: true, message: '系统设置已保存' };
}

async function handleGetDatabaseStats(env: Env): Promise<unknown> {
  const stats = await getDatabaseStats(env);
  return { stats };
}

async function handleCleanupDatabase(env: Env, args: Record<string, unknown>): Promise<unknown> {
  const result = await cleanupExpiredData(env, {
    pushHistoryRetentionDays: parseInt(String(args.pushHistoryDays || '30'), 10) || 30,
    auditLogRetentionDays: parseInt(String(args.auditLogDays || '90'), 10) || 90,
    batchSize: 100,
  });
  return { success: true, ...result };
}

async function handleArchivePushHistory(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await archivePushHistory(env, username, {
    archiveAfterDays: parseInt(String(args.archiveAfterDays || '30'), 10) || 30,
    batchSize: 50,
  });
  return { success: true, ...result };
}

async function handleListArchives(env: Env, username: string): Promise<unknown> {
  const archives = await listArchives(env, username);
  return { archives };
}

async function handleRestoreArchive(env: Env, username: string, args: Record<string, unknown>): Promise<unknown> {
  const archiveKey = String(args.archiveKey || '');
  if (!archiveKey) throw new Error('归档 key 不能为空');
  const result = await restoreArchivedData(env, username, archiveKey);
  return { success: true, ...result };
}

async function handleGetDatabaseTables(env: Env): Promise<unknown> {
  const tables = await getAllTables(env);
  return { tables };
}

async function handleDeleteDatabaseTable(env: Env, args: Record<string, unknown>): Promise<unknown> {
  const name = String(args.name || '');
  if (!name) throw new Error('表名不能为空');
  const result = await deleteTable(env, name);
  return result;
}

async function handleCleanupOrphanTables(env: Env): Promise<unknown> {
  const result = await cleanupOrphanTablesForce(env);
  return result;
}

async function handleGetSystemHealth(env: Env): Promise<unknown> {
  let healthy = true; const checks: Record<string, unknown> = {};
  try {
    checks.database = env.DB ? 'connected' : 'not configured';
    if (env.DB) await env.DB.prepare('SELECT 1').run();
  } catch { checks.database = 'error'; healthy = false; }
  return { status: healthy ? 'healthy' : 'unhealthy', checks };
}

async function handleGetAnalyticsActivity(env: Env, args: Record<string, unknown>): Promise<unknown> {
  const days = Math.min(Math.max(parseInt(String(args.days || '7'), 10) || 7, 1), 90);
  if (!env.DB) return { activity: [] };
  const since = new Date(); since.setDate(since.getDate() - days);
  const result = await env.DB.prepare(
    `SELECT DATE(created_at) as date, action, COUNT(*) as count FROM audit_logs WHERE created_at >= ? GROUP BY DATE(created_at), action ORDER BY date DESC`
  ).bind(since.toISOString()).all();
  return { activity: result.results || [] };
}

async function handleGetMetrics(env: Env): Promise<unknown> {
  if (!env.DB) return { metrics: {} };
  const userCount = (await env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>())?.count || 0;
  const pushCount = (await env.DB.prepare('SELECT COUNT(*) as count FROM push_history').first<{ count: number }>())?.count || 0;
  const taskCount = (await env.DB.prepare('SELECT COUNT(*) as count FROM scheduled_pushes').first<{ count: number }>())?.count || 0;
  return { metrics: { users: userCount, totalPushes: pushCount, totalScheduledTasks: taskCount } };
}

async function handleGetTemplates(
  env: Env,
  username: string
): Promise<unknown> {
  const pushService = new PushService(env, username);
  const templates = await pushService.getTemplates();

  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    title: t.title,
    content: t.content,
    channels: t.channels,
    category: t.category,
    useMarkdown: t.useMarkdown,
    createdAt: t.createdAt,
  }));
}

async function handleGetPushStats(
  env: Env,
  username: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const days = Math.min(Math.max(parseInt(String(args.days || '7'), 10) || 7, 1), 90);
  const pushService = new PushService(env, username);
  const stats = await pushService.getPushStats(days);

  return stats;
}

async function handleGetSystemStatus(
  env: Env
): Promise<unknown> {
  let dbConnected = false;
  let userCount = 0;
  let pendingTasks = 0;

  try {
    if (env.DB) {
      dbConnected = true;
      const userResult = await env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
      userCount = userResult?.count || 0;

      const taskResult = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM scheduled_pushes WHERE status = 'pending'"
      ).first<{ count: number }>();
      pendingTasks = taskResult?.count || 0;
    }
  } catch {
    dbConnected = false;
  }

  return {
    status: 'ok',
    database: dbConnected ? 'connected' : 'disconnected',
    stats: {
      users: userCount,
      pendingTasks,
    },
    timestamp: new Date().toISOString(),
  };
}

type ChannelSettings = Record<string, string>;

async function loadUserChannelSettings(username: string, env: Env): Promise<ChannelSettings> {
  if (!env.DB) return {};

  const result = await env.DB.prepare(
    'SELECT * FROM channel_configs WHERE user_id = ?'
  )
    .bind(username)
    .all<{ channel_id: string; config: string; enabled: number }>();

  const settings: ChannelSettings = {};
  for (const row of result.results || []) {
    settings[`channel:${row.channel_id}:enabled`] = row.enabled ? 'true' : 'false';
    try {
      const config = JSON.parse(row.config);
      for (const [key, value] of Object.entries(config)) {
        settings[`channel:${row.channel_id}:${key}`] = String(value);
      }
    } catch {
      // 忽略解析错误
    }
  }
  return settings;
}

// ==================== MCP 请求分发 ====================

export async function handleMCPRequest(
  request: MCPRequest,
  env: Env,
  username: string,
  userRole: string = 'user'
): Promise<MCPResponse> {
  const { id, method, params } = request;

  try {
    switch (method) {
      case 'initialize': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
              resources: {},
            },
            serverInfo: {
              name: 'bee-swarm-mcp',
              version: '1.0.0',
            },
          },
        };
      }

      case 'notifications/initialized':
        return { jsonrpc: '2.0', id, result: null };

      case 'tools/list':
        return { jsonrpc: '2.0', id, result: { tools: getToolsForRole(userRole) } };

      case 'tools/call': {
        const p = params as { name?: string; arguments?: Record<string, unknown> } | undefined;
        const toolName = p?.name || '';
        const args = p?.arguments || {};

        // 权限检查：管理员工具仅管理员可用
        if (ADMIN_TOOLS.has(toolName) && userRole !== 'admin') {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32001, message: '权限不足，此工具需要管理员权限' },
          };
        }

        let result: unknown;
        switch (toolName) {
          case 'send_push':
            result = await handleSendPush(env, username, args);
            break;
          case 'create_scheduled_push':
            result = await handleCreateScheduledPush(env, username, args);
            break;
          case 'update_scheduled_push':
            result = await handleUpdateScheduledPush(env, username, args);
            break;
          case 'cancel_scheduled_push':
            result = await handleCancelScheduledPush(env, username, args);
            break;
          case 'reschedule_overdue_task':
            result = await handleRescheduleOverdueTask(env, username, args);
            break;
          case 'list_channels':
            result = await handleListChannels(env, username);
            break;
          case 'list_scheduled_pushes':
            result = await handleListScheduledPushes(env, username, args);
            break;
          case 'get_scheduled_push_detail':
            result = await handleGetScheduledPushDetail(env, username, args);
            break;
          case 'get_templates':
            result = await handleGetTemplates(env, username);
            break;
          case 'get_channel_groups':
            result = await handleGetChannelGroups(env, username);
            break;
          case 'get_push_history':
            result = await handleGetPushHistory(env, username, args);
            break;
          case 'get_push_history_detail':
            result = await handleGetPushHistoryDetail(env, username, args);
            break;
          case 'get_push_stats':
            result = await handleGetPushStats(env, username, args);
            break;
          case 'get_execution_logs':
            result = await handleGetExecutionLogs(env, username, args);
            break;
          case 'test_channel':
            result = await handleTestChannel(env, username, args);
            break;
          case 'check_all_channels_health':
            result = await handleCheckAllChannelsHealth(env, username);
            break;
          case 'get_drafts':
            result = await handleGetDrafts(env, username);
            break;
          case 'get_favorites':
            result = await handleGetFavorites(env, username);
            break;
          case 'save_channel_config':
            result = await handleSaveChannelConfig(env, username, args);
            break;
          case 'create_template':
            result = await handleCreateTemplate(env, username, args);
            break;
          case 'update_template':
            result = await handleUpdateTemplate(env, username, args);
            break;
          case 'delete_template':
            result = await handleDeleteTemplate(env, username, args);
            break;
          case 'create_channel_group':
            result = await handleCreateChannelGroup(env, username, args);
            break;
          case 'update_channel_group':
            result = await handleUpdateChannelGroup(env, username, args);
            break;
          case 'delete_channel_group':
            result = await handleDeleteChannelGroup(env, username, args);
            break;
          case 'create_draft':
            result = await handleCreateDraft(env, username, args);
            break;
          case 'update_draft':
            result = await handleUpdateDraft(env, username, args);
            break;
          case 'delete_draft':
            result = await handleDeleteDraft(env, username, args);
            break;
          case 'create_favorite':
            result = await handleCreateFavorite(env, username, args);
            break;
          case 'delete_favorite':
            result = await handleDeleteFavorite(env, username, args);
            break;
          case 'delete_push_history':
            result = await handleDeletePushHistory(env, username, args);
            break;
          case 'list_backup_endpoints':
            result = await handleListBackupEndpoints(env, username);
            break;
          case 'run_backup':
            result = await handleRunBackup(env, username);
            break;
          case 'list_backups':
            result = await handleListBackups(env, username, args);
            break;
          case 'get_user_settings':
            result = await handleGetUserSettings(env, username);
            break;
          case 'get_allowed_ips':
            result = await handleGetAllowedIPs(env, username);
            break;
          case 'export_data':
            result = await handleExportData(env, username);
            break;
          case 'get_current_user':
            result = await handleGetCurrentUser(env, username);
            break;
          case 'update_avatar':
            result = await handleUpdateAvatar(env, username, args);
            break;
          case 'update_cache_settings':
            result = await handleUpdateCacheSettings(env, username, args);
            break;
          case 'update_ai_settings':
            result = await handleUpdateAISettings(env, username, args);
            break;
          case 'get_ai_tools':
            result = await handleGetAITools(env, username);
            break;
          case 'get_execution_log_detail':
            result = await handleGetExecutionLogDetail(env, username, args);
            break;
          case 'get_push_history_filtered':
            result = await handleGetPushHistoryFiltered(env, username, args);
            break;
          case 'batch_delete_push_history_by_filter':
            result = await handleBatchDeleteHistoryByFilter(env, username, args);
            break;
          case 'mark_push_delivered':
            result = await handleMarkPushDelivered(env, username, args);
            break;
          case 'mark_push_read':
            result = await handleMarkPushRead(env, username, args);
            break;
          case 'mark_push_clicked':
            result = await handleMarkPushClicked(env, username, args);
            break;
          case 'revoke_push':
            result = await handleRevokePush(env, username, args);
            break;
          case 'preview_template':
            result = await handlePreviewTemplate(env, username, args);
            break;
          case 'get_template_variables':
            result = await handleGetTemplateVariables(env, username, args);
            break;
          case 'delete_scheduled_push':
            result = await handleDeleteScheduledPush(env, username, args);
            break;
          case 'batch_cancel_scheduled':
            result = await handleBatchCancelScheduled(env, username, args);
            break;
          case 'batch_enable_scheduled':
            result = await handleBatchEnableScheduled(env, username, args);
            break;
          case 'batch_delete_scheduled':
            result = await handleBatchDeleteScheduled(env, username, args);
            break;
          case 'get_overdue_tasks':
            result = await handleGetOverdueTasks(env, username);
            break;
          case 'batch_delete_groups':
            result = await handleBatchDeleteGroups(env, username, args);
            break;
          case 'batch_send_to_groups':
            result = await handleBatchSendToGroups(env, username, args);
            break;
          case 'get_2fa_status':
            result = await handleGet2FAStatus(env, username);
            break;
          case 'setup_2fa':
            result = await handleSetup2FA(env, username);
            break;
          case 'verify_2fa_setup':
            result = await handleVerify2FASetup(env, username, args);
            break;
          case 'disable_2fa':
            result = await handleDisable2FA(env, username, args);
            break;
          case 'save_backup_endpoint':
            result = await handleSaveBackupEndpoint(env, username, args);
            break;
          case 'delete_backup_endpoint':
            result = await handleDeleteBackupEndpoint(env, username, args);
            break;
          case 'test_backup_endpoint':
            result = await handleTestBackupEndpoint(env, username, args);
            break;
          case 'delete_backup':
            result = await handleDeleteBackup(env, username, args);
            break;
          case 'restore_backup':
            result = await handleRestoreBackup(env, username, args);
            break;
          case 'import_data':
            result = await handleImportData(env, username, args);
            break;
          case 'validate_backup_data':
            result = await handleValidateBackupData(env, args);
            break;
          case 'get_backup_history':
            result = await handleGetBackupHistory(env, username);
            break;
          case 'delete_backup_record':
            result = await handleDeleteBackupRecord(env, username, args);
            break;
          case 'get_webhook_url':
            result = await handleGetWebhookUrl(env, username);
            break;
          case 'get_avatar_status':
            result = await handleGetAvatarStatus(env, username);
            break;
          case 'test_bark_key':
            result = await handleTestBarkKey(env, args);
            break;
          case 'get_push_version_detail':
            result = await handleGetPushVersionDetail(env, username, args);
            break;
          case 'compare_push_versions':
            result = await handleComparePushVersions(env, username, args);
            break;
          case 'run_backup_single':
            result = await handleRunBackupSingle(env, username, args);
            break;
          case 'get_system_status':
            result = await handleGetSystemStatus(env);
            break;
          case 'list_users':
            result = await handleListUsers(env);
            break;
          case 'create_user':
            result = await handleCreateUser(env, args);
            break;
          case 'update_user_role':
            result = await handleUpdateUserRole(env, args);
            break;
          case 'disable_user':
            result = await handleDisableUser(env, args);
            break;
          case 'enable_user':
            result = await handleEnableUser(env, args);
            break;
          case 'delete_user':
            result = await handleDeleteUser(env, args);
            break;
          case 'get_audit_logs':
            result = await handleGetAuditLogs(env, args);
            break;
          case 'clear_audit_logs':
            result = await handleClearAuditLogs(env);
            break;
          case 'get_system_settings':
            result = await handleGetSystemSettings(env);
            break;
          case 'update_system_settings':
            result = await handleUpdateSystemSettings(env, args);
            break;
          case 'get_database_stats':
            result = await handleGetDatabaseStats(env);
            break;
          case 'cleanup_database':
            result = await handleCleanupDatabase(env, args);
            break;
          case 'archive_push_history':
            result = await handleArchivePushHistory(env, username, args);
            break;
          case 'list_archives':
            result = await handleListArchives(env, username);
            break;
          case 'restore_archive':
            result = await handleRestoreArchive(env, username, args);
            break;
          case 'get_database_tables':
            result = await handleGetDatabaseTables(env);
            break;
          case 'delete_database_table':
            result = await handleDeleteDatabaseTable(env, args);
            break;
          case 'cleanup_orphan_tables':
            result = await handleCleanupOrphanTables(env);
            break;
          case 'get_system_health':
            result = await handleGetSystemHealth(env);
            break;
          case 'get_analytics_activity':
            result = await handleGetAnalyticsActivity(env, args);
            break;
          case 'get_metrics':
            result = await handleGetMetrics(env);
            break;
          default:
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32601, message: `未知工具: ${toolName}` },
            };
        }
        // 包装为 MCP 标准响应格式
        const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `未知方法: ${method}` },
        };
    }
  } catch (err) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: (err as Error).message,
      },
    };
  }
}