// ============================================
// API 服务封装
// ============================================
import type {
  PushChannel,
  ChannelSettings,
  BackupEndpoint,
  PushTemplate,
  ChannelGroup,
  ScheduledPush,
  PushStats,
  PushMetrics,
  ChannelHealth,
} from '@/types';
import { withCache, apiCache } from '@/composables/useApiCache';

const BASE = '/api';

/** 通用错误处理函数 */
async function handleResponseError(res: Response): Promise<Error> {
  let errorMsg = `请求失败 (${res.status})`;
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    if (body.error) errorMsg = body.error;
    else if (body.message) errorMsg = body.message;
  } catch {
    /* ignore */
  }
  return new Error(errorMsg);
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw await handleResponseError(res);
  }
  return res.json();
}

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function subscribeTokenRefresh(callback: (token: string) => void) {
  refreshSubscribers.push(callback);
}

function onTokenRefreshed(newToken: string) {
  refreshSubscribers.forEach((callback) => callback(newToken));
  refreshSubscribers = [];
}

/** 带 Token 的请求 */
async function tokenRequest<T>(url: string, token: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...((options?.headers as Record<string, string>) || {}),
    'X-Token': token,
  };
  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    const storedRefreshToken = localStorage.getItem('bee_swarm_refresh_token');

    if (storedRefreshToken && !isRefreshing) {
      isRefreshing = true;

      try {
        const newTokens = await refreshToken(storedRefreshToken);
        localStorage.setItem('bee_swarm_token', newTokens.token);
        localStorage.setItem('bee_swarm_refresh_token', newTokens.refreshToken);
        localStorage.setItem('bee_swarm_expires_at', String(newTokens.expiresAt));

        onTokenRefreshed(newTokens.token);
        isRefreshing = false;

        const newHeaders = { ...headers, 'X-Token': newTokens.token };
        const retryRes = await fetch(url, { ...options, headers: newHeaders });

        if (!retryRes.ok) {
          if (retryRes.status === 401) {
            clearAuthAndRedirect();
          }
          throw await handleResponseError(retryRes);
        }

        return retryRes.json() as Promise<T>;
      } catch {
        isRefreshing = false;
        clearAuthAndRedirect();
        throw new Error('认证已过期，请重新登录');
      }
    } else if (refreshSubscribers.length > 0) {
      return new Promise((resolve, reject) => {
        subscribeTokenRefresh(async (newToken) => {
          try {
            const newHeaders = { ...headers, 'X-Token': newToken };
            const retryRes = await fetch(url, { ...options, headers: newHeaders });

            if (!retryRes.ok) {
              if (retryRes.status === 401) {
                clearAuthAndRedirect();
              }
              throw await handleResponseError(retryRes);
            }

            resolve(retryRes.json() as Promise<T>);
          } catch (err) {
            reject(err);
          }
        });
      });
    } else {
      clearAuthAndRedirect();
    }

    throw await handleResponseError(res);
  }

  if (!res.ok) {
    throw await handleResponseError(res);
  }

  return res.json() as Promise<T>;
}

function clearAuthAndRedirect() {
  localStorage.removeItem('bee_swarm_token');
  localStorage.removeItem('bee_swarm_refresh_token');
  localStorage.removeItem('bee_swarm_expires_at');
  if (window.location.pathname !== '/') {
    window.location.href = '/';
  }
}

// -------------------------------------------
// 公开接口
// -------------------------------------------

export async function register(
  email: string,
  password: string
): Promise<{ success: boolean; message: string }> {
  return request(`${BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

export async function login(
  email: string,
  password: string
): Promise<{ success: boolean; message: string; email: string }> {
  return request(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

/** 获取访问 Token */
export async function getToken(
  email: string,
  password: string
): Promise<{
  token: string;
  refreshToken: string;
  expiresAt: number;
}> {
  return request(`${BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

/** 刷新 Token */
export async function refreshToken(refreshToken: string): Promise<{
  token: string;
  refreshToken: string;
  expiresAt: number;
}> {
  return request(`${BASE}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
}

// -------------------------------------------
// 管理接口（Token 认证版本）
// -------------------------------------------

export async function getChannelsWithToken(token: string): Promise<{
  channels: Array<{ id: PushChannel; name: string; icon: string; enabled: boolean }>;
  settings: ChannelSettings;
  definitions: Array<{
    id: PushChannel;
    name: string;
    icon: string;
    fields: Array<{
      key: string;
      label: string;
      type: string;
      placeholder: string;
      required: boolean;
    }>;
  }>;
}> {
  const url = `${BASE}/admin/channels`;
  return withCache(url, () => tokenRequest(url, token), token, { ttl: 10 * 60 * 1000 });
}

export async function saveChannelWithToken(
  token: string,
  channelId: string,
  fields: Record<string, string>
): Promise<{
  success: boolean;
  message: string;
  channels: Array<{ id: PushChannel; name: string; icon: string; enabled: boolean }>;
}> {
  const result = await tokenRequest<{
    success: boolean;
    message: string;
    channels: Array<{ id: PushChannel; name: string; icon: string; enabled: boolean }>;
  }>(`${BASE}/admin/channels/${channelId}`, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  apiCache.invalidate(`${BASE}/admin/channels`, token);
  apiCache.invalidate(`${BASE}/admin/channels/health`, token);
  return result;
}

export async function sendPushWithToken(
  token: string,
  payload: { title: string; body?: string; url?: string; channels?: PushChannel[] }
): Promise<{
  success: boolean;
  message: string;
  results: Array<{ channel: PushChannel; success: boolean; message: string }>;
}> {
  return tokenRequest(`${BASE}/admin/push`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** dispatchPush alias for GroupManager */
export async function dispatchPush(
  token: string,
  payload: { title: string; body?: string; url?: string; channels?: PushChannel[] }
): Promise<{
  success: boolean;
  message: string;
  results: Array<{ channel: PushChannel; success: boolean; message: string }>;
}> {
  return sendPushWithToken(token, payload);
}

export async function getHistoryWithToken(
  token: string,
  options?: {
    page?: number;
    pageSize?: number;
    channel?: string;
    status?: string;
    keyword?: string;
  }
): Promise<{
  history: Array<{
    id: string;
    time: string;
    title: string;
    body: string;
    url: string;
    channels: string[];
    status: string;
    results: Array<{
      channel: PushChannel;
      success: boolean;
      message: string;
      latencyMs?: number;
      retries?: number;
    }>;
  }>;
  total: number;
  hasMore: boolean;
}> {
  const params = new URLSearchParams();
  if (options?.page) params.set('page', String(options.page));
  if (options?.pageSize) params.set('pageSize', String(options.pageSize));
  if (options?.channel) params.set('channel', options.channel);
  if (options?.status) params.set('status', options.status);
  if (options?.keyword) params.set('keyword', options.keyword);
  const query = params.toString();
  const url = query ? `${BASE}/admin/history?${query}` : `${BASE}/admin/history`;
  return tokenRequest(url, token);
}

export async function getApiKeyWithToken(
  token: string,
  refresh?: boolean
): Promise<{ apikey: string }> {
  const url = refresh ? `${BASE}/apikey?refresh=true` : `${BASE}/apikey`;
  return tokenRequest(url, token);
}

// -------------------------------------------
// 多备份端接口（Token 认证）
// -------------------------------------------

// 获取所有备份端
export async function getBackupEndpoints(token: string): Promise<{ endpoints: BackupEndpoint[] }> {
  const url = `${BASE}/admin/backup-endpoints`;
  return withCache(url, () => tokenRequest(url, token), token, { ttl: 5 * 60 * 1000 });
}

// 添加备份端
export async function addBackupEndpoint(
  token: string,
  endpoint: Omit<BackupEndpoint, 'id'>
): Promise<{ success: boolean; endpoint: BackupEndpoint }> {
  const url = `${BASE}/admin/backup-endpoints`;
  const result = await tokenRequest<{ success: boolean; endpoint: BackupEndpoint }>(url, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(endpoint),
  });
  apiCache.invalidate(url, token);
  return result;
}

// 更新备份端
export async function updateBackupEndpoint(
  token: string,
  id: string,
  endpoint: Partial<BackupEndpoint>
): Promise<{ success: boolean; endpoint: BackupEndpoint }> {
  const url = `${BASE}/admin/backup-endpoints/${id}`;
  const result = await tokenRequest<{ success: boolean; endpoint: BackupEndpoint }>(url, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(endpoint),
  });
  apiCache.invalidate(`${BASE}/admin/backup-endpoints`, token);
  return result;
}

// 删除备份端
export async function deleteBackupEndpoint(
  token: string,
  id: string
): Promise<{ success: boolean; message: string }> {
  const url = `${BASE}/admin/backup-endpoints/${id}`;
  const result = await tokenRequest<{ success: boolean; message: string }>(url, token, {
    method: 'DELETE',
  });
  apiCache.invalidate(`${BASE}/admin/backup-endpoints`, token);
  return result;
}

// 测试备份端连接
export async function testBackupEndpoint(
  token: string,
  id: string,
  config?: { type?: string; config?: Record<string, unknown> }
): Promise<{ success: boolean; message: string }> {
  return tokenRequest(`${BASE}/admin/backup-endpoints/${id}/test`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: config ? JSON.stringify(config) : undefined,
  });
}

// 列出指定备份端的备份
export async function listBackupsFromEndpoint(
  token: string,
  id: string
): Promise<{ backups: Array<{ key: string; size: number; lastModified: string }> }> {
  return tokenRequest(`${BASE}/admin/backup-endpoints/${id}/backups`, token);
}

// 从指定备份端恢复
export async function restoreBackupFromEndpoint(
  token: string,
  id: string,
  key: string
): Promise<{ success: boolean; message: string }> {
  return tokenRequest(`${BASE}/admin/backup-endpoints/${id}/restore`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
}

// 删除指定备份端的备份
export async function deleteBackupFromEndpoint(
  token: string,
  id: string,
  key: string
): Promise<{ success: boolean; message: string }> {
  return tokenRequest(`${BASE}/admin/backup-endpoints/${id}/backups`, token, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
}

// 下载指定备份文件
export async function downloadBackupFromEndpoint(
  token: string,
  id: string,
  key: string
): Promise<void> {
  const url = `${BASE}/admin/backup-endpoints/${id}/backups/${encodeURIComponent(key)}/download`;
  const res = await fetch(url, {
    headers: { 'X-Token': token },
  });

  if (!res.ok) {
    throw await handleResponseError(res);
  }

  const blob = await res.blob();
  const filename =
    res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ||
    key.split('/').pop() ||
    'backup.json';

  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}

// 手动触发所有启用的备份
export async function backupAll(token: string): Promise<{
  results: Array<{ success: boolean; message: string; endpointId?: string; endpointName?: string }>;
}> {
  return tokenRequest(`${BASE}/admin/backup-all`, token, { method: 'POST' });
}

// 手动触发单个备份端备份
export async function backupSingleEndpoint(
  token: string,
  id: string
): Promise<{ success: boolean; message: string; endpointId?: string; endpointName?: string }> {
  return tokenRequest(`${BASE}/admin/backup-endpoints/${id}/backup`, token, { method: 'POST' });
}

// -------------------------------------------
// 推送模板接口
// -------------------------------------------

// 获取所有模板
export async function getTemplates(token: string): Promise<{ templates: PushTemplate[] }> {
  const url = `${BASE}/admin/templates`;
  return withCache(url, () => tokenRequest(url, token), token, { ttl: 5 * 60 * 1000 });
}

// 创建模板
export async function createTemplate(
  token: string,
  template: Omit<PushTemplate, 'id' | 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; template: PushTemplate }> {
  const url = `${BASE}/admin/templates`;
  const result = await tokenRequest<{ success: boolean; template: PushTemplate }>(url, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(template),
  });
  apiCache.invalidate(url, token);
  return result;
}

// 更新模板
export async function updateTemplate(
  token: string,
  id: string,
  template: Partial<PushTemplate>
): Promise<{ success: boolean; template: PushTemplate }> {
  const url = `${BASE}/admin/templates/${id}`;
  const result = await tokenRequest<{ success: boolean; template: PushTemplate }>(url, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(template),
  });
  apiCache.invalidate(`${BASE}/admin/templates`, token);
  return result;
}

// 删除模板
export async function deleteTemplate(
  token: string,
  id: string
): Promise<{ success: boolean; message: string }> {
  const url = `${BASE}/admin/templates/${id}`;
  const result = await tokenRequest<{ success: boolean; message: string }>(url, token, {
    method: 'DELETE',
  });
  apiCache.invalidate(`${BASE}/admin/templates`, token);
  return result;
}

// -------------------------------------------
// 渠道分组接口
// -------------------------------------------

// 获取所有分组
export async function getChannelGroups(token: string): Promise<{ groups: ChannelGroup[] }> {
  const url = `${BASE}/admin/groups`;
  return withCache(url, () => tokenRequest(url, token), token, { ttl: 5 * 60 * 1000 });
}

// 创建分组
export async function createChannelGroup(
  token: string,
  group: { name: string; channels: PushChannel[] }
): Promise<{ success: boolean; group: ChannelGroup }> {
  const url = `${BASE}/admin/groups`;
  const result = await tokenRequest<{ success: boolean; group: ChannelGroup }>(url, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(group),
  });
  apiCache.invalidate(url, token);
  return result;
}

// 删除分组
export async function deleteChannelGroup(
  token: string,
  id: string
): Promise<{ success: boolean; message: string }> {
  const url = `${BASE}/admin/groups/${id}`;
  const result = await tokenRequest<{ success: boolean; message: string }>(url, token, {
    method: 'DELETE',
  });
  apiCache.invalidate(`${BASE}/admin/groups`, token);
  return result;
}

// 更新分组
export async function updateChannelGroup(
  token: string,
  id: string,
  group: { name?: string; channels?: string[] }
): Promise<{ success: boolean; group: ChannelGroup }> {
  const url = `${BASE}/admin/groups/${id}`;
  const result = await tokenRequest<{ success: boolean; group: ChannelGroup }>(url, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(group),
  });
  apiCache.invalidate(`${BASE}/admin/groups`, token);
  return result;
}

// -------------------------------------------
// 定时推送接口
// -------------------------------------------

// 获取定时推送列表
export async function getScheduledPushes(
  token: string,
  status?: string
): Promise<{ scheduled: ScheduledPush[] }> {
  const url = status ? `${BASE}/admin/scheduled?status=${status}` : `${BASE}/admin/scheduled`;
  const cacheKey = status ? `${BASE}/admin/scheduled?status=${status}` : `${BASE}/admin/scheduled`;
  return withCache(cacheKey, () => tokenRequest(url, token), token, { ttl: 30 * 1000 });
}

// 更新定时推送
export async function updateScheduledPush(
  token: string,
  id: string,
  push: {
    title?: string;
    content?: string;
    channels?: PushChannel[];
    url?: string;
    scheduledAt?: string;
    templateId?: string;
    scheduleType?: 'once' | 'recurring';
    recurringType?:
      | 'hourly'
      | 'daily'
      | 'weekly'
      | 'monthly'
      | 'interval'
      | 'cron'
      | 'intervalMonth'
      | 'yearly'
      | 'intervalYear';
    selectedWeekDays?: number[];
    selectedMonthDays?: number[];
    intervalHours?: number;
    intervalMonths?: number;
    intervalYears?: number;
    cronExpression?: string;
  }
): Promise<{ success: boolean; scheduled: ScheduledPush }> {
  const result = await tokenRequest<{ success: boolean; scheduled: ScheduledPush }>(
    `${BASE}/admin/scheduled/${id}`,
    token,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(push),
    }
  );
  apiCache.invalidate(`${BASE}/admin/scheduled`, token);
  apiCache.invalidate(`${BASE}/admin/scheduled?status=pending`, token);
  apiCache.invalidate(`${BASE}/admin/scheduled?status=running`, token);
  apiCache.invalidate(`${BASE}/admin/scheduled?status=completed`, token);
  apiCache.invalidate(`${BASE}/admin/scheduled?status=failed`, token);
  return result;
}

// 创建定时推送
export async function createScheduledPush(
  token: string,
  push: {
    title: string;
    content?: string;
    channels: PushChannel[];
    url?: string;
    scheduledAt: string;
    templateId?: string;
    scheduleType?: 'once' | 'recurring';
    recurringType?:
      | 'hourly'
      | 'daily'
      | 'weekly'
      | 'monthly'
      | 'interval'
      | 'cron'
      | 'intervalMonth'
      | 'yearly'
      | 'intervalYear';
    selectedWeekDays?: number[];
    selectedMonthDays?: number[];
    intervalHours?: number;
    intervalMonths?: number;
    intervalYears?: number;
    cronExpression?: string;
  }
): Promise<{ success: boolean; scheduled: ScheduledPush }> {
  const result = await tokenRequest<{ success: boolean; scheduled: ScheduledPush }>(
    `${BASE}/admin/scheduled`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(push),
    }
  );
  apiCache.invalidate(`${BASE}/admin/scheduled`, token);
  apiCache.invalidate(`${BASE}/admin/scheduled?status=pending`, token);
  apiCache.invalidate(`${BASE}/admin/scheduled?status=running`, token);
  apiCache.invalidate(`${BASE}/admin/scheduled?status=completed`, token);
  apiCache.invalidate(`${BASE}/admin/scheduled?status=failed`, token);
  return result;
}

// 取消定时推送
export async function cancelScheduledPush(
  token: string,
  id: string
): Promise<{ success: boolean; message: string }> {
  const result = await tokenRequest<{ success: boolean; message: string }>(
    `${BASE}/admin/scheduled/${id}`,
    token,
    { method: 'DELETE' }
  );
  apiCache.invalidate(`${BASE}/admin/scheduled`, token);
  apiCache.invalidate(`${BASE}/admin/scheduled?status=pending`, token);
  apiCache.invalidate(`${BASE}/admin/scheduled?status=running`, token);
  apiCache.invalidate(`${BASE}/admin/scheduled?status=completed`, token);
  apiCache.invalidate(`${BASE}/admin/scheduled?status=failed`, token);
  return result;
}

// 删除定时推送
export async function deleteScheduledPush(
  token: string,
  id: string
): Promise<{ success: boolean; message: string }> {
  const result = await tokenRequest<{ success: boolean; message: string }>(
    `${BASE}/admin/scheduled/${id}`,
    token,
    { method: 'DELETE' }
  );
  apiCache.invalidate(`${BASE}/admin/scheduled`, token);
  apiCache.invalidate(`${BASE}/admin/scheduled?status=pending`, token);
  apiCache.invalidate(`${BASE}/admin/scheduled?status=running`, token);
  apiCache.invalidate(`${BASE}/admin/scheduled?status=completed`, token);
  apiCache.invalidate(`${BASE}/admin/scheduled?status=failed`, token);
  return result;
}

// -------------------------------------------
// 推送统计接口
// -------------------------------------------

// 获取推送统计
export async function getPushStats(token: string): Promise<PushStats> {
  return tokenRequest(`${BASE}/admin/stats`, token);
}

// 获取会话指标
export async function getPushMetrics(token: string): Promise<PushMetrics> {
  return tokenRequest(`${BASE}/admin/metrics`, token);
}

// -------------------------------------------
// 渠道健康检查
// -------------------------------------------

// 检查单个渠道健康状态
export async function checkChannelHealth(
  token: string,
  channel: PushChannel
): Promise<ChannelHealth> {
  return tokenRequest(`${BASE}/admin/channels/health?channel=${channel}`, token);
}

// 检查所有渠道健康状态
export async function checkAllChannelsHealth(
  token: string
): Promise<{ channels: ChannelHealth[] }> {
  return tokenRequest(`${BASE}/admin/channels/health`, token);
}

// 删除推送历史
export async function clearHistory(token: string): Promise<{ success: boolean; message: string }> {
  return tokenRequest(`${BASE}/admin/history`, token, { method: 'DELETE' });
}

// -------------------------------------------
// Webhook 触发推送
// -------------------------------------------

// 通过 Webhook 触发推送
export async function webhookPush(
  token: string,
  payload: {
    title?: string;
    content?: string;
    templateId?: string;
    channels?: PushChannel[];
    url?: string;
  }
): Promise<{
  success: boolean;
  results: Array<{ channel: PushChannel; success: boolean; message: string }>;
  message: string;
}> {
  return tokenRequest(`${BASE}/admin/webhook/push`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// 获取 Webhook URL
export async function getWebhookUrl(token: string): Promise<{
  webhookUrl: string;
  description: string;
  exampleBody: Record<string, unknown>;
  templateExample: Record<string, unknown>;
}> {
  return tokenRequest(`${BASE}/admin/webhook/url`, token);
}

// -------------------------------------------
// 渠道健康检查
// -------------------------------------------

// 测试单个渠道（实际发送测试消息）
export async function testChannelHealth(
  token: string,
  channel: PushChannel
): Promise<{ channel: PushChannel; healthy: boolean; message: string; testedAt: string }> {
  return tokenRequest(`${BASE}/admin/channels/health/${channel}/test`, token, {
    method: 'POST',
  });
}

// 获取超时任务列表
export async function getOverdueTasks(token: string): Promise<{ overdue: ScheduledPush[] }> {
  return withCache(
    `${BASE}/admin/scheduled/overdue`,
    () => tokenRequest(`${BASE}/admin/scheduled/overdue`, token),
    token,
    { ttl: 30 * 1000 }
  );
}

// 重新安排超时任务
export async function rescheduleOverdueTask(
  token: string,
  id: string,
  scheduledAt: string
): Promise<{ success: boolean; scheduled: ScheduledPush; message: string }> {
  const result = await tokenRequest<{
    success: boolean;
    scheduled: ScheduledPush;
    message: string;
  }>(`${BASE}/admin/scheduled/${id}/reschedule`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scheduledAt }),
  });
  apiCache.invalidate(`${BASE}/admin/scheduled`, token);
  apiCache.invalidate(`${BASE}/admin/scheduled?status=pending`, token);
  apiCache.invalidate(`${BASE}/admin/scheduled?status=overdue`, token);
  apiCache.invalidate(`${BASE}/admin/scheduled/overdue`, token);
  return result;
}

// -------------------------------------------
// 模板预览
// -------------------------------------------

// 预览模板变量替换结果
export async function previewTemplate(
  token: string,
  templateId: string,
  options: { variables?: Record<string, string>; autoVars?: boolean }
): Promise<{ title: string; content: string; url?: string }> {
  return tokenRequest(`${BASE}/admin/templates/${templateId}/preview`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
}

// -------------------------------------------
// 批量操作
// -------------------------------------------

// 批量删除推送历史
export async function batchDeleteHistory(
  token: string,
  ids: string[]
): Promise<{ success: boolean; message: string; deletedCount: number }> {
  return tokenRequest(`${BASE}/admin/history/batch-delete`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

// 按条件批量删除推送历史
export async function batchDeleteHistoryByFilter(
  token: string,
  filter: { olderThan?: string; channel?: string; status?: string }
): Promise<{ success: boolean; message: string; deletedCount: number }> {
  return tokenRequest(`${BASE}/admin/history/batch-delete-filter`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(filter),
  });
}

// 批量取消定时任务
export async function batchCancelScheduled(
  token: string,
  ids: string[]
): Promise<{ success: boolean; message: string; cancelled: number; notFound: number }> {
  return tokenRequest(`${BASE}/admin/scheduled/batch-cancel`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

// 批量启用定时任务
export async function batchEnableScheduled(
  token: string,
  ids: string[]
): Promise<{ success: boolean; message: string; enabled: number; notFound: number }> {
  return tokenRequest(`${BASE}/admin/scheduled/batch-enable`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

// 批量删除定时任务
export async function batchDeleteScheduled(
  token: string,
  ids: string[]
): Promise<{ success: boolean; message: string; deleted: number }> {
  return tokenRequest(`${BASE}/admin/scheduled/batch-delete`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

// 批量删除分组
export async function batchDeleteGroups(
  token: string,
  ids: string[]
): Promise<{ success: boolean; message: string; deleted: number }> {
  return tokenRequest(`${BASE}/admin/groups/batch-delete`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

// -------------------------------------------
// 用户管理接口（管理员专用）
// -------------------------------------------

export type UserRole = 'admin' | 'user' | 'viewer';

export interface UserInfo {
  id: string;
  email: string;
  role: UserRole;
  disabled: number;
  disabled_reason?: string;
  created_at: string;
}

// 获取当前用户信息
export async function getCurrentUser(token: string): Promise<UserInfo & { avatar_url?: string; use_avatar_as_popup?: number }> {
  return tokenRequest(`${BASE}/admin/me`, token);
}

// 更新用户头像设置
export async function updateAvatar(
  token: string,
  data: { avatar_url?: string; use_avatar_as_popup?: number }
): Promise<{ success: boolean; message: string; avatar_url: string; use_avatar_as_popup: number }> {
  return tokenRequest(`${BASE}/admin/me/avatar`, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// 获取用户列表
export async function getUsers(token: string): Promise<{ users: UserInfo[] }> {
  return tokenRequest(`${BASE}/admin/users`, token);
}

// 创建用户
export async function createUser(
  token: string,
  data: { email: string; password: string }
): Promise<UserInfo & { success: boolean; message: string }> {
  const result = await tokenRequest<UserInfo & { success: boolean; message: string }>(
    `${BASE}/admin/users`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  );
  apiCache.invalidate(`${BASE}/admin/users`, token);
  return result;
}

// 更新用户角色
export async function updateUserRole(
  token: string,
  userId: string,
  role: UserRole
): Promise<{ success: boolean; message: string }> {
  const result = await tokenRequest<{ success: boolean; message: string }>(
    `${BASE}/admin/users/${userId}/role`,
    token,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    }
  );
  apiCache.invalidate(`${BASE}/admin/users`, token);
  apiCache.invalidate(`${BASE}/admin/me`, token);
  return result;
}

// 禁用用户
export async function disableUser(
  token: string,
  userId: string,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  const result = await tokenRequest<{ success: boolean; message: string }>(
    `${BASE}/admin/users/${userId}/disable`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }
  );
  apiCache.invalidate(`${BASE}/admin/users`, token);
  return result;
}

// 启用用户
export async function enableUser(
  token: string,
  userId: string
): Promise<{ success: boolean; message: string }> {
  const result = await tokenRequest<{ success: boolean; message: string }>(
    `${BASE}/admin/users/${userId}/enable`,
    token,
    {
      method: 'POST',
    }
  );
  apiCache.invalidate(`${BASE}/admin/users`, token);
  return result;
}

// 删除用户
export async function deleteUser(
  token: string,
  userId: string
): Promise<{ success: boolean; message: string }> {
  const result = await tokenRequest<{ success: boolean; message: string }>(
    `${BASE}/admin/users/${userId}`,
    token,
    {
      method: 'DELETE',
    }
  );
  apiCache.invalidate(`${BASE}/admin/users`, token);
  return result;
}

// -------------------------------------------
// 审计日志接口（管理员专用）
// -------------------------------------------

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  metadata?: any;
  timestamp: string;
}

export async function getAuditLogs(
  token: string,
  options?: { action?: string; startDate?: string; endDate?: string }
): Promise<{ logs: AuditLog[] }> {
  const params = new URLSearchParams();
  if (options?.action) params.set('action', options.action);
  if (options?.startDate) params.set('startDate', options.startDate);
  if (options?.endDate) params.set('endDate', options.endDate);
  const query = params.toString();
  const url = query ? `${BASE}/admin/audit?${query}` : `${BASE}/admin/audit`;
  return tokenRequest(url, token);
}

export async function clearAuditLogs(token: string): Promise<{ success: boolean; message: string }> {
  return tokenRequest(`${BASE}/admin/audit`, token, {
    method: 'DELETE',
  });
}
