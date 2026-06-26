import type { Env } from '../types';
import { SystemSettingsService } from './systemSettingsService';

// ============================================
// 用户数据结构定义
// ============================================

export interface UserDataExport {
  version: string;
  exportedAt: string;
  userId: string;
  metadata: {
    source: string;
    dataSize?: number;
    tableCounts?: { [key: string]: number };
  };
  userSettings?: UserSettingsExport;
  systemSettings?: SystemSettingsExport;
  tables: {
    channelConfigs?: ChannelConfigExport[];
    pushTemplates?: PushTemplateExport[];
    scheduledPushes?: ScheduledPushExport[];
    channelGroups?: ChannelGroupExport[];
    pushHistory?: PushHistoryExport[];
    auditLogs?: AuditLogExport[];
    metrics?: MetricsExport;
    backupEndpoints?: BackupEndpointExport[];
  };
}

export interface SystemSettingsExport {
  turnstileEnabled?: boolean;
  turnstileSiteKey?: string;
  turnstileSecretKey?: string;
  cleanupEnabled?: boolean;
  cleanupPushHistoryDays?: number;
  cleanupAuditLogDays?: number;
  cleanupBatchSize?: number;
  cleanupAutoDeleteOrphanTables?: boolean;
  corsAllowedOrigins?: string[];
}

export interface UserSettingsExport {
  avatarUrl?: string;
  useAvatarAsPopup?: boolean;
  cacheSettings?: Record<string, unknown>;
  aiSettings?: Record<string, unknown>;
  cacheTtlBackup?: number;
  cacheTtlChannels?: number;
  cacheTtlTemplates?: number;
  cacheTtlGroups?: number;
  cacheTtlScheduled?: number;
  aiEnabled?: boolean;
  aiProvider?: string;
  aiModel?: string;
  aiApiKey?: string;
  aiApiUrl?: string;
  aiModelName?: string;
}

export interface ChannelConfigExport {
  id: string;
  channelId: string;
  config: Record<string, string>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PushTemplateExport {
  id: string;
  name: string;
  title?: string;
  body?: string;
  url?: string;
  imageUrl?: string;
  markdown?: string;
  channels?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledPushExport {
  id: string;
  templateId?: string;
  cron?: string;
  nextRun?: string;
  title?: string;
  body?: string;
  url?: string;
  imageUrl?: string;
  markdown?: string;
  channels?: string[];
  enabled: boolean;
  status?: string;
  recurringType?: string;
  scheduledAt?: string;
  overdueReminderSent?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelGroupExport {
  id: string;
  name: string;
  channels: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PushHistoryExport {
  id: string;
  channelId: string;
  channelType?: string;
  channelName?: string;
  title?: string;
  content?: string;
  url?: string;
  imageUrl?: string;
  markdown?: string;
  success: boolean;
  error?: string;
  latencyMs?: number;
  timestamp: string;
  createdAt: string;
}

export interface AuditLogExport {
  id: string;
  action: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface MetricsExport {
  total: number;
  success: number;
  failed: number;
  channelStats?: Record<string, unknown>;
  dailyStats?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BackupEndpointExport {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  schedule?: Record<string, unknown>;
  retention?: number;
  createdAt: string;
  updatedAt: string;
}

export interface BackupRecord {
  id: string;
  userId: string;
  endpointId?: string;
  endpointName?: string;
  storagePath?: string;
  status: 'pending' | 'success' | 'failed';
  sizeBytes?: number;
  dataHash?: string;
  errorMessage?: string;
  tableCounts?: { [key: string]: number };
  createdAt: string;
  completedAt?: string;
}

// ============================================
// D1 数据导出/导入服务
// ============================================

/**
 * 导出用户所有数据
 */
export async function exportUserData(
  env: Env,
  userId: string,
  options?: { dateRange?: { start?: string; end?: string } }
): Promise<UserDataExport> {
  const result: UserDataExport = {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    userId,
    metadata: {
      source: 'd1_export',
      tableCounts: {},
    },
    tables: {},
  };

  if (!env.DB) {
    throw new Error('D1 database not available');
  }

  // 导出渠道配置
  const channelConfigs = await env.DB.prepare('SELECT * FROM channel_configs WHERE user_id = ?')
    .bind(userId)
    .all<{
      id: string;
      channel_id: string;
      config: string;
      enabled: number;
      created_at: string;
      updated_at: string;
    }>();

  if (channelConfigs.results?.length) {
    result.tables.channelConfigs = channelConfigs.results.map((r) => ({
      id: r.id,
      channelId: r.channel_id,
      config: JSON.parse(r.config),
      enabled: r.enabled === 1,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
    result.metadata.tableCounts!.channelConfigs = result.tables.channelConfigs.length;
  }

  // 导出推送模板
  const pushTemplates = await env.DB.prepare('SELECT * FROM push_templates WHERE user_id = ?')
    .bind(userId)
    .all<{
      id: string;
      name: string;
      title?: string;
      body?: string;
      url?: string;
      image_url?: string;
      markdown?: string;
      channels?: string;
      created_at: string;
      updated_at: string;
    }>();

  if (pushTemplates.results?.length) {
    result.tables.pushTemplates = pushTemplates.results.map((r) => ({
      id: r.id,
      name: r.name,
      title: r.title,
      body: r.body,
      url: r.url,
      imageUrl: r.image_url,
      markdown: r.markdown,
      channels: r.channels ? JSON.parse(r.channels) : undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
    result.metadata.tableCounts!.pushTemplates = result.tables.pushTemplates.length;
  }

  // 导出定时推送任务
  const scheduledPushes = await env.DB.prepare('SELECT * FROM scheduled_pushes WHERE user_id = ?')
    .bind(userId)
    .all<{
      id: string;
      template_id?: string;
      cron?: string;
      next_run?: number;
      title?: string;
      body?: string;
      url?: string;
      image_url?: string;
      markdown?: string;
      channels?: string;
      enabled: number;
      status?: string;
      recurring_type?: string;
      overdue_reminder_sent?: number;
      created_at: string;
      updated_at: string;
    }>();

  if (scheduledPushes.results?.length) {
    result.tables.scheduledPushes = scheduledPushes.results.map((r) => ({
      id: r.id,
      templateId: r.template_id,
      cron: r.cron,
      nextRun:
        r.next_run && r.next_run > 0 && r.next_run < 1e12
          ? new Date(r.next_run * 60000).toISOString()
          : undefined,
      title: r.title,
      body: r.body,
      url: r.url,
      imageUrl: r.image_url,
      markdown: r.markdown,
      channels: r.channels ? JSON.parse(r.channels) : undefined,
      enabled: r.enabled === 1,
      status: r.status,
      recurringType: r.recurring_type,
      selectedWeekDays: r.selected_week_days ? JSON.parse(r.selected_week_days) : undefined,
      selectedMonthDays: r.selected_month_days ? JSON.parse(r.selected_month_days) : undefined,
      yearlyDates: r.yearly_dates ? JSON.parse(r.yearly_dates) : undefined,
      timezone: r.timezone,
      abTestEnabled: r.ab_test_enabled === 1,
      abTestVariants: r.ab_test_variants ? JSON.parse(r.ab_test_variants) : undefined,
      overdueReminderSent: r.overdue_reminder_sent === 1,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
    result.metadata.tableCounts!.scheduledPushes = result.tables.scheduledPushes.length;
  }

  // 导出渠道分组
  const channelGroups = await env.DB.prepare('SELECT * FROM channel_groups WHERE user_id = ?')
    .bind(userId)
    .all<{ id: string; name: string; channels: string; created_at: string; updated_at: string }>();

  if (channelGroups.results?.length) {
    result.tables.channelGroups = channelGroups.results.map((r) => ({
      id: r.id,
      name: r.name,
      channels: JSON.parse(r.channels),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
    result.metadata.tableCounts!.channelGroups = result.tables.channelGroups.length;
  }

  // 导出推送历史（最多 1000 条，支持时间范围过滤）
  let pushHistorySQL = 'SELECT * FROM push_history WHERE user_id = ?';
  const pushHistoryParams: (string | number)[] = [userId];
  if (options?.dateRange?.start) {
    pushHistorySQL += ' AND created_at >= ?';
    pushHistoryParams.push(options.dateRange.start);
  }
  if (options?.dateRange?.end) {
    pushHistorySQL += ' AND created_at <= ?';
    pushHistoryParams.push(options.dateRange.end);
  }
  pushHistorySQL += ' ORDER BY created_at DESC LIMIT 1000';

  const pushHistory = await env.DB.prepare(pushHistorySQL)
    .bind(...pushHistoryParams)
    .all<{
      id: string;
      channel_id: string;
      channel_type?: string;
      channel_name?: string;
      title?: string;
      content?: string;
      url?: string;
      image_url?: string;
      markdown?: string;
      success: number;
      error?: string;
      latency_ms?: number;
      timestamp: string;
      created_at: string;
    }>();

  if (pushHistory.results?.length) {
    result.tables.pushHistory = pushHistory.results.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      url: r.url,
      imageUrl: r.image_url,
      markdown: r.markdown === 1,
      channels: r.channels ? JSON.parse(r.channels) : undefined,
      results: r.results ? JSON.parse(r.results) : undefined,
      status: r.status,
      createdAt: r.created_at,
      deliveredAt: r.delivered_at,
      readAt: r.read_at,
      clickedAt: r.clicked_at,
      revokedAt: r.revoked_at,
    }));
    result.metadata.tableCounts!.pushHistory = result.tables.pushHistory.length;
  }

  // 导出审计日志（最多 1000 条，支持时间范围过滤）
  let auditSQL = 'SELECT * FROM audit_logs WHERE user_id = ?';
  const auditParams: (string | number)[] = [userId];
  if (options?.dateRange?.start) {
    auditSQL += ' AND created_at >= ?';
    auditParams.push(options.dateRange.start);
  }
  if (options?.dateRange?.end) {
    auditSQL += ' AND created_at <= ?';
    auditParams.push(options.dateRange.end);
  }
  auditSQL += ' ORDER BY created_at DESC LIMIT 1000';

  const auditLogs = await env.DB.prepare(auditSQL)
    .bind(...auditParams)
    .all<{ id: string; action: string; data?: string; created_at: string }>();

  if (auditLogs.results?.length) {
    result.tables.auditLogs = auditLogs.results.map((r) => ({
      id: r.id,
      action: r.action,
      data: r.data ? JSON.parse(r.data) : undefined,
      createdAt: r.created_at,
    }));
    result.metadata.tableCounts!.auditLogs = result.tables.auditLogs.length;
  }

  // 导出指标统计
  const metrics = await env.DB.prepare('SELECT * FROM metrics WHERE user_id = ?')
    .bind(userId)
    .first<{
      total: number;
      success: number;
      failed: number;
      channel_stats?: string;
      daily_stats?: string;
      created_at: string;
      updated_at: string;
    }>();

  if (metrics) {
    result.tables.metrics = {
      total: metrics.total,
      success: metrics.success,
      failed: metrics.failed,
      channelStats: metrics.channel_stats ? JSON.parse(metrics.channel_stats) : undefined,
      dailyStats: metrics.daily_stats ? JSON.parse(metrics.daily_stats) : undefined,
      createdAt: metrics.created_at,
      updatedAt: metrics.updated_at,
    };
    result.metadata.tableCounts!.metrics = 1;
  }

  // 导出用户设置
  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(userId).first<{
    avatar_url?: string;
    use_avatar_as_popup?: number;
    cache_settings?: string;
    ai_settings?: string;
    cache_ttl_backup?: number;
    cache_ttl_channels?: number;
    cache_ttl_templates?: number;
    cache_ttl_groups?: number;
    cache_ttl_scheduled?: number;
    ai_enabled?: number;
    ai_provider?: string;
    ai_model?: string;
    ai_api_key?: string;
    ai_api_url?: string;
    ai_model_name?: string;
  }>();

  if (user) {
    result.userSettings = {
      avatarUrl: user.avatar_url,
      useAvatarAsPopup: user.use_avatar_as_popup === 1,
      cacheSettings: user.cache_settings ? JSON.parse(user.cache_settings) : undefined,
      aiSettings: user.ai_settings ? JSON.parse(user.ai_settings) : undefined,
      cacheTtlBackup: user.cache_ttl_backup,
      cacheTtlChannels: user.cache_ttl_channels,
      cacheTtlTemplates: user.cache_ttl_templates,
      cacheTtlGroups: user.cache_ttl_groups,
      cacheTtlScheduled: user.cache_ttl_scheduled,
      aiEnabled: user.ai_enabled === 1,
      aiProvider: user.ai_provider,
      aiModel: user.ai_model,
      aiApiKey: user.ai_api_key,
      aiApiUrl: user.ai_api_url,
      aiModelName: user.ai_model_name,
    };
  }

  // 导出系统设置（包括人机验证、清理配置等）
  try {
    const systemSettingsService = new SystemSettingsService(env);
    await systemSettingsService.ensureTable();
    const systemSettings = await systemSettingsService.getAllSettings();

    result.systemSettings = {
      turnstileEnabled: systemSettings.turnstile_enabled,
      turnstileSiteKey: systemSettings.turnstile_site_key,
      turnstileSecretKey: systemSettings.turnstile_secret_key,
      cleanupEnabled: systemSettings.cleanup_enabled,
      cleanupPushHistoryDays: systemSettings.cleanup_push_history_days,
      cleanupAuditLogDays: systemSettings.cleanup_audit_log_days,
      cleanupBatchSize: systemSettings.cleanup_batch_size,
      cleanupAutoDeleteOrphanTables: systemSettings.cleanup_auto_delete_orphan_tables,
      corsAllowedOrigins: systemSettings.cors_allowed_origins,
    };
  } catch {
    // 忽略系统设置导出错误，不影响其他数据备份
  }

  // 导出备份端点配置（不包含敏感信息）
  const backupEndpoints = await env.DB.prepare(
    'SELECT id, name, type, enabled, schedule, retention, created_at, updated_at FROM backup_endpoints WHERE user_id = ?'
  )
    .bind(userId)
    .all<{
      id: string;
      name: string;
      type: string;
      enabled: number;
      schedule?: string;
      retention?: number;
      created_at: string;
      updated_at: string;
    }>();

  if (backupEndpoints.results?.length) {
    result.tables.backupEndpoints = backupEndpoints.results.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      config: r.config ? JSON.parse(r.config) : undefined,
      enabled: r.enabled === 1,
      schedule: r.schedule ? JSON.parse(r.schedule) : undefined,
      retention: r.retention,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
    result.metadata.tableCounts!.backupEndpoints = result.tables.backupEndpoints.length;
  }

  // 计算数据大小
  const jsonString = JSON.stringify(result);
  result.metadata.dataSize = new Blob([jsonString]).size;

  return result;
}

/**
 * 导入用户数据（覆盖式导入）
 */
export async function importUserData(
  env: Env,
  userId: string,
  data: UserDataExport,
  options: {
    skipTables?: string[];
    mergeMode?: 'overwrite' | 'merge';
  } = {}
): Promise<{ success: boolean; message: string; imported: { [key: string]: number } }> {
  const { skipTables = [], mergeMode = 'overwrite' } = options;
  const imported: { [key: string]: number } = {};

  if (!env.DB) {
    throw new Error('D1 database not available');
  }

  try {
    // 在事务中执行导入
    const tables = data.tables;

    // 导入用户设置（总是导入）
    if (data.userSettings) {
      const settings = data.userSettings;
      // 先获取用户ID
      const existingUser = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
        .bind(userId)
        .first<{ id: string }>();

      if (existingUser) {
        await env.DB.prepare(
          `
          UPDATE users 
          SET avatar_url = ?, 
              use_avatar_as_popup = ?,
              cache_settings = ?,
              ai_settings = ?,
              cache_ttl_backup = ?,
              cache_ttl_channels = ?,
              cache_ttl_templates = ?,
              cache_ttl_groups = ?,
              cache_ttl_scheduled = ?,
              ai_enabled = ?,
              ai_provider = ?,
              ai_model = ?,
              ai_api_key = ?,
              ai_api_url = ?,
              ai_model_name = ?,
              updated_at = ?
          WHERE email = ?
        `
        )
          .bind(
            settings.avatarUrl || null,
            settings.useAvatarAsPopup ? 1 : 0,
            settings.cacheSettings ? JSON.stringify(settings.cacheSettings) : null,
            settings.aiSettings ? JSON.stringify(settings.aiSettings) : null,
            settings.cacheTtlBackup || null,
            settings.cacheTtlChannels || null,
            settings.cacheTtlTemplates || null,
            settings.cacheTtlGroups || null,
            settings.cacheTtlScheduled || null,
            settings.aiEnabled ? 1 : 0,
            settings.aiProvider || null,
            settings.aiModel || null,
            settings.aiApiKey || null,
            settings.aiApiUrl || null,
            settings.aiModelName || null,
            new Date().toISOString(),
            userId
          )
          .run();

        imported.userSettings = 1;
      }
    }

    // 导入系统设置（总是导入）
    if (data.systemSettings) {
      const settings = data.systemSettings;
      try {
        const systemSettingsService = new SystemSettingsService(env);
        await systemSettingsService.ensureTable();

        await systemSettingsService.saveSettings({
          turnstile_enabled: settings.turnstileEnabled,
          turnstile_site_key: settings.turnstileSiteKey,
          turnstile_secret_key: settings.turnstileSecretKey,
          cleanup_enabled: settings.cleanupEnabled,
          cleanup_push_history_days: settings.cleanupPushHistoryDays,
          cleanup_audit_log_days: settings.cleanupAuditLogDays,
          cleanup_batch_size: settings.cleanupBatchSize,
          cleanup_auto_delete_orphan_tables: settings.cleanupAutoDeleteOrphanTables,
          cors_allowed_origins: settings.corsAllowedOrigins,
        });

        imported.systemSettings = 1;
      } catch {
        // 忽略系统设置导入错误，不影响其他数据恢复
      }
    }

    // 如果是覆盖模式，先清空现有数据
    if (mergeMode === 'overwrite') {
      const deleteStatements = [
        'DELETE FROM audit_logs WHERE user_id = ?',
        'DELETE FROM push_history WHERE user_id = ?',
        'DELETE FROM channel_groups WHERE user_id = ?',
        'DELETE FROM scheduled_pushes WHERE user_id = ?',
        'DELETE FROM push_templates WHERE user_id = ?',
        'DELETE FROM channel_configs WHERE user_id = ?',
        'DELETE FROM metrics WHERE user_id = ?',
        // 保留备份端点配置，因为它们可能是需要的
        // 'DELETE FROM backup_endpoints WHERE user_id = ?',
      ];

      for (const stmt of deleteStatements) {
        await env.DB.prepare(stmt).bind(userId).run();
      }
    }

    // 导入渠道配置
    if (!skipTables.includes('channelConfigs') && tables.channelConfigs?.length) {
      for (const item of tables.channelConfigs) {
        try {
          await env.DB.prepare(
            `
            INSERT OR REPLACE INTO channel_configs (id, user_id, channel_id, config, enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `
          )
            .bind(
              item.id,
              userId,
              item.channelId,
              JSON.stringify(item.config),
              item.enabled ? 1 : 0,
              item.createdAt,
              item.updatedAt
            )
            .run();
        } catch (e) {
          console.warn('[Import] Failed to import channel config:', (e as Error).message);
        }
      }
      imported.channelConfigs = tables.channelConfigs.length;
    }

    // 导入推送模板
    if (!skipTables.includes('pushTemplates') && tables.pushTemplates?.length) {
      for (const item of tables.pushTemplates) {
        try {
          await env.DB.prepare(
            `
            INSERT OR REPLACE INTO push_templates (id, user_id, name, title, body, url, image_url, markdown, channels, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
          )
            .bind(
              item.id,
              userId,
              item.name,
              item.title || null,
              item.body || null,
              item.url || null,
              item.imageUrl || null,
              item.markdown || null,
              item.channels ? JSON.stringify(item.channels) : null,
              item.createdAt,
              item.updatedAt
            )
            .run();
        } catch (e) {
          console.warn('[Import] Failed to import push template:', (e as Error).message);
        }
      }
      imported.pushTemplates = tables.pushTemplates.length;
    }

    // 导入定时推送任务
    if (!skipTables.includes('scheduledPushes') && tables.scheduledPushes?.length) {
      for (const item of tables.scheduledPushes) {
        const nextRun = item.nextRun ? Math.floor(new Date(item.nextRun).getTime() / 60000) : null;
        try {
          await env.DB.prepare(
            `
            INSERT OR REPLACE INTO scheduled_pushes (id, user_id, template_id, cron, next_run, title, body, url, image_url, markdown, channels, enabled, status, recurring_type, selected_week_days, selected_month_days, yearly_dates, timezone, ab_test_enabled, ab_test_variants, overdue_reminder_sent, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
          )
            .bind(
              item.id,
              userId,
              item.templateId || null,
              item.cron || null,
              nextRun,
              item.title || null,
              item.body || null,
              item.url || null,
              item.imageUrl || null,
              item.markdown || null,
              item.channels ? JSON.stringify(item.channels) : null,
              item.enabled ? 1 : 0,
              item.status || 'pending',
              item.recurringType || null,
              item.selectedWeekDays ? JSON.stringify(item.selectedWeekDays) : null,
              item.selectedMonthDays ? JSON.stringify(item.selectedMonthDays) : null,
              item.yearlyDates ? JSON.stringify(item.yearlyDates) : null,
              item.timezone || 'Asia/Shanghai',
              item.abTestEnabled ? 1 : 0,
              item.abTestVariants ? JSON.stringify(item.abTestVariants) : null,
              item.overdueReminderSent ? 1 : 0,
              item.createdAt,
              item.updatedAt
            )
            .run();
        } catch (e) {
          console.warn('[Import] Failed to import scheduled push:', (e as Error).message);
        }
      }
      imported.scheduledPushes = tables.scheduledPushes.length;
    }

    // 导入渠道分组
    if (!skipTables.includes('channelGroups') && tables.channelGroups?.length) {
      for (const item of tables.channelGroups) {
        try {
          await env.DB.prepare(
            `
            INSERT OR REPLACE INTO channel_groups (id, user_id, name, channels, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `
          )
            .bind(
              item.id,
              userId,
              item.name,
              JSON.stringify(item.channels),
              item.createdAt,
              item.updatedAt
            )
            .run();
        } catch (e) {
          console.warn('[Import] Failed to import channel group:', (e as Error).message);
        }
      }
      imported.channelGroups = tables.channelGroups.length;
    }

    // 导入推送历史（可选，因为可能数据量很大）
    if (!skipTables.includes('pushHistory') && tables.pushHistory?.length) {
      for (const item of tables.pushHistory) {
        try {
          await env.DB.prepare(
            `
            INSERT OR REPLACE INTO push_history (id, user_id, title, body, url, image_url, markdown, channels, results, status, created_at, delivered_at, read_at, clicked_at, revoked_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
          )
            .bind(
              item.id,
              userId,
              item.title || null,
              item.body || null,
              item.url || null,
              item.imageUrl || null,
              item.markdown ? 1 : 0,
              item.channels ? JSON.stringify(item.channels) : null,
              item.results ? JSON.stringify(item.results) : null,
              item.status || null,
              item.createdAt,
              item.deliveredAt || null,
              item.readAt || null,
              item.clickedAt || null,
              item.revokedAt || null
            )
            .run();
        } catch (e) {
          console.warn('[Import] Failed to import push history:', (e as Error).message);
        }
      }
      imported.pushHistory = tables.pushHistory.length;
    }

    // 导入审计日志
    if (!skipTables.includes('auditLogs') && tables.auditLogs?.length) {
      for (const item of tables.auditLogs) {
        try {
          await env.DB.prepare(
            `
            INSERT OR REPLACE INTO audit_logs (id, user_id, action, data, created_at)
            VALUES (?, ?, ?, ?, ?)
          `
          )
            .bind(
              item.id,
              userId,
              item.action,
              item.data ? JSON.stringify(item.data) : null,
              item.createdAt
            )
            .run();
        } catch (e) {
          console.warn('[Import] Failed to import audit log:', (e as Error).message);
        }
      }
      imported.auditLogs = tables.auditLogs.length;
    }

    // 导入指标统计
    if (!skipTables.includes('metrics') && tables.metrics) {
      try {
        await env.DB.prepare(
          `
          INSERT OR REPLACE INTO metrics (id, user_id, total, success, failed, channel_stats, daily_stats, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        )
          .bind(
            crypto.randomUUID(),
            userId,
            tables.metrics.total,
            tables.metrics.success,
            tables.metrics.failed,
            tables.metrics.channelStats ? JSON.stringify(tables.metrics.channelStats) : null,
            tables.metrics.dailyStats ? JSON.stringify(tables.metrics.dailyStats) : null,
            tables.metrics.createdAt,
            tables.metrics.updatedAt
          )
          .run();
        imported.metrics = 1;
      } catch (e) {
        console.warn('[Import] Failed to import metrics:', (e as Error).message);
      }
    }

    // 导入备份端点（仅在合并模式下）
    if (!skipTables.includes('backupEndpoints') && tables.backupEndpoints?.length) {
      for (const item of tables.backupEndpoints) {
        try {
          await env.DB.prepare(
            `
            INSERT OR REPLACE INTO backup_endpoints (id, user_id, name, type, config, enabled, schedule, retention, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
          )
            .bind(
              item.id,
              userId,
              item.name,
              item.type,
              item.config ? JSON.stringify(item.config) : null,
              item.enabled ? 1 : 0,
              item.schedule ? JSON.stringify(item.schedule) : null,
              item.retention || null,
              item.createdAt,
              item.updatedAt
            )
            .run();
        } catch (e) {
          console.warn('[Import] Failed to import backup endpoint:', (e as Error).message);
        }
      }
      imported.backupEndpoints = tables.backupEndpoints.length;
    }

    return {
      success: true,
      message: `Successfully imported ${Object.values(imported).reduce((a, b) => a + b, 0)} records`,
      imported,
    };
  } catch (error) {
    throw new Error(`Import failed: ${(error as Error).message}`);
  }
}

/**
 * 验证备份数据完整性
 */
export function validateBackupData(data: UserDataExport): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    if (!data.version) {
      errors.push('Missing version field');
    }

    if (!data.exportedAt) {
      errors.push('Missing exportedAt field');
    }

    if (!data.userId) {
      errors.push('Missing userId field');
    }

    if (!data.tables || typeof data.tables !== 'object') {
      errors.push('Missing or invalid tables field');
    }

    // 检查必需的表
    const tables = data.tables || {};
    const hasData = Object.values(tables).some((v) => (Array.isArray(v) ? v.length > 0 : !!v));
    if (!hasData) {
      warnings.push('No data found in backup');
    }

    // 警告：推送历史可能很长
    if (tables.pushHistory && tables.pushHistory.length > 1000) {
      warnings.push('Push history has more than 1000 entries, import may be slow');
    }

    // 警告：审计日志可能很长
    if (tables.auditLogs && tables.auditLogs.length > 1000) {
      warnings.push('Audit logs have more than 1000 entries, import may be slow');
    }
  } catch (error) {
    errors.push(`Validation error: ${(error as Error).message}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 计算数据的哈希值（用于完整性检查）
 */
export function computeDataHash(data: UserDataExport): string {
  try {
    const sortedData = JSON.stringify(data, Object.keys(data).sort());
    // 简单的哈希函数
    let hash = 0;
    for (let i = 0; i < sortedData.length; i++) {
      const char = sortedData.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 转换为 32 位整数
    }
    return Math.abs(hash).toString(16);
  } catch {
    return '';
  }
}

// ============================================
// 备份记录管理
// ============================================

/**
 * 记录备份操作
 */
export async function createBackupRecord(
  env: Env,
  record: Omit<BackupRecord, 'createdAt'>
): Promise<BackupRecord> {
  const fullRecord: BackupRecord = {
    ...record,
    createdAt: new Date().toISOString(),
  };

  if (env.DB) {
    try {
      // 检查备份记录表是否存在，如果不存在则创建
      await ensureBackupRecordsTable(env);

      await env.DB.prepare(
        `
        INSERT OR REPLACE INTO backup_records (id, user_id, endpoint_id, endpoint_name, storage_path, status, size_bytes, data_hash, error_message, table_counts, created_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
        .bind(
          fullRecord.id,
          fullRecord.userId,
          fullRecord.endpointId || null,
          fullRecord.endpointName || null,
          fullRecord.storagePath || null,
          fullRecord.status,
          fullRecord.sizeBytes || null,
          fullRecord.dataHash || null,
          fullRecord.errorMessage || null,
          fullRecord.tableCounts ? JSON.stringify(fullRecord.tableCounts) : null,
          fullRecord.createdAt,
          fullRecord.completedAt || null
        )
        .run();
    } catch (error) {
      console.warn('[BackupRecord] Failed to write to D1:', error);
    }
  }

  return fullRecord;
}

/**
 * 更新备份记录状态
 */
export async function updateBackupRecordStatus(
  env: Env,
  id: string,
  userId: string,
  status: BackupRecord['status'],
  options: {
    sizeBytes?: number;
    dataHash?: string;
    storagePath?: string;
    errorMessage?: string;
    completedAt?: string;
  } = {}
): Promise<void> {
  if (env.DB) {
    try {
      await ensureBackupRecordsTable(env);

      await env.DB.prepare(
        `
        UPDATE backup_records 
        SET status = ?, size_bytes = ?, data_hash = ?, storage_path = ?, error_message = ?, completed_at = ?
        WHERE id = ? AND user_id = ?
      `
      )
        .bind(
          status,
          options.sizeBytes || null,
          options.dataHash || null,
          options.storagePath || null,
          options.errorMessage || null,
          options.completedAt || new Date().toISOString(),
          id,
          userId
        )
        .run();
    } catch (error) {
      console.warn('[BackupRecord] Failed to update status:', error);
    }
  }
}

/**
 * 获取用户备份记录
 */
export async function getBackupRecords(
  env: Env,
  userId: string,
  limit: number = 50
): Promise<BackupRecord[]> {
  if (!env.DB) {
    return [];
  }

  try {
    await ensureBackupRecordsTable(env);

    const result = await env.DB.prepare(
      `
      SELECT * FROM backup_records 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `
    )
      .bind(userId, limit)
      .all<{
        id: string;
        user_id: string;
        endpoint_id?: string;
        endpoint_name?: string;
        storage_path?: string;
        status: string;
        size_bytes?: number;
        data_hash?: string;
        error_message?: string;
        table_counts?: string;
        created_at: string;
        completed_at?: string;
      }>();

    return (result.results || []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      endpointId: r.endpoint_id,
      endpointName: r.endpoint_name,
      storagePath: r.storage_path,
      status: r.status as BackupRecord['status'],
      sizeBytes: r.size_bytes,
      dataHash: r.data_hash,
      errorMessage: r.error_message,
      tableCounts: r.table_counts ? JSON.parse(r.table_counts) : undefined,
      createdAt: r.created_at,
      completedAt: r.completed_at,
    }));
  } catch (error) {
    console.warn('[BackupRecord] Failed to get records:', error);
    return [];
  }
}

/**
 * 删除备份记录
 */
export async function deleteBackupRecord(env: Env, id: string, userId: string): Promise<boolean> {
  if (!env.DB) {
    return false;
  }

  try {
    await ensureBackupRecordsTable(env);

    const result = await env.DB.prepare(
      `
      DELETE FROM backup_records 
      WHERE id = ? AND user_id = ?
    `
    )
      .bind(id, userId)
      .run();

    return (result.meta?.changes || 0) > 0;
  } catch (error) {
    console.warn('[BackupRecord] Failed to delete record:', error);
    return false;
  }
}

/**
 * 确保备份记录表存在
 */
async function ensureBackupRecordsTable(env: Env): Promise<void> {
  try {
    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS backup_records (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        endpoint_id TEXT,
        endpoint_name TEXT,
        storage_path TEXT,
        status TEXT NOT NULL,
        size_bytes INTEGER,
        data_hash TEXT,
        error_message TEXT,
        table_counts TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT
      )
    `
    ).run();

    await env.DB.prepare(
      `
      CREATE INDEX IF NOT EXISTS idx_backup_records_user ON backup_records(user_id)
    `
    ).run();

    await env.DB.prepare(
      `
      CREATE INDEX IF NOT EXISTS idx_backup_records_created ON backup_records(created_at)
    `
    ).run();
  } catch (_error) {
    // 表可能已经存在，忽略错误
  }
}

// ============================================
// CSV 格式导出
// ============================================

function escapeCsvField(value: unknown): string {
  if (value === undefined || value === null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function recordsToCsv(headers: string[], records: Record<string, unknown>[]): string {
  const lines = [headers.join(',')];
  for (const record of records) {
    const row = headers.map((h) => escapeCsvField(record[h]));
    lines.push(row.join(','));
  }
  return lines.join('\n');
}

/**
 * 将导出数据转换为 CSV 格式
 * 返回一个以表名为键的 CSV 字符串映射
 */
export function convertExportToCsv(data: UserDataExport): Record<string, string> {
  const csvMap: Record<string, string> = {};

  if (data.tables.channelConfigs?.length) {
    csvMap['channelConfigs'] = recordsToCsv(
      ['id', 'channelId', 'config', 'enabled', 'createdAt', 'updatedAt'],
      data.tables.channelConfigs.map((r) => ({
        id: r.id,
        channelId: r.channelId,
        config: JSON.stringify(r.config),
        enabled: r.enabled,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }))
    );
  }

  if (data.tables.pushTemplates?.length) {
    csvMap['pushTemplates'] = recordsToCsv(
      ['id', 'name', 'title', 'body', 'url', 'imageUrl', 'channels', 'createdAt', 'updatedAt'],
      data.tables.pushTemplates.map((r) => ({
        id: r.id,
        name: r.name,
        title: r.title,
        body: r.body,
        url: r.url,
        imageUrl: r.imageUrl,
        channels: r.channels?.join(';'),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }))
    );
  }

  if (data.tables.pushHistory?.length) {
    csvMap['pushHistory'] = recordsToCsv(
      [
        'id',
        'channelId',
        'channelType',
        'title',
        'content',
        'url',
        'success',
        'error',
        'latencyMs',
        'timestamp',
        'createdAt',
      ],
      data.tables.pushHistory.map((r) => ({
        id: r.id,
        channelId: r.channelId,
        channelType: r.channelType,
        title: r.title,
        content: r.content,
        url: r.url,
        success: r.success,
        error: r.error,
        latencyMs: r.latencyMs,
        timestamp: r.timestamp,
        createdAt: r.createdAt,
      }))
    );
  }

  if (data.tables.auditLogs?.length) {
    csvMap['auditLogs'] = recordsToCsv(
      ['id', 'action', 'data', 'createdAt'],
      data.tables.auditLogs.map((r) => ({
        id: r.id,
        action: r.action,
        data: JSON.stringify(r.data),
        createdAt: r.createdAt,
      }))
    );
  }

  if (data.tables.scheduledPushes?.length) {
    csvMap['scheduledPushes'] = recordsToCsv(
      [
        'id',
        'templateId',
        'title',
        'body',
        'channels',
        'scheduledAt',
        'recurringType',
        'enabled',
        'status',
        'createdAt',
        'updatedAt',
      ],
      data.tables.scheduledPushes.map((r) => ({
        id: r.id,
        templateId: r.templateId,
        title: r.title,
        body: r.body,
        channels: r.channels?.join(';'),
        scheduledAt: r.scheduledAt,
        recurringType: r.recurringType,
        enabled: r.enabled,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }))
    );
  }

  return csvMap;
}

/**
 * 导出为 CSV（返回合并的 CSV 字符串，用表名分隔）
 */
export function exportAsCsv(data: UserDataExport): string {
  const csvMap = convertExportToCsv(data);
  const parts: string[] = [];
  for (const [table, csv] of Object.entries(csvMap)) {
    parts.push(`=== ${table} ===`);
    parts.push(csv);
    parts.push('');
  }
  return parts.join('\n');
}
