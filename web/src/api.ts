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
  PushHistoryRecord,
  PushResult as ChannelResult,
} from '@/types';
import { withCache, apiCache } from '@/composables/useApiCache';

const BASE = '/api';

/** 通用错误处理函数 */
async function handleResponseError(res: Response): Promise<Error> {
  let errorMsg = `Request failed (${res.status})`;
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
        throw new Error('Authentication expired, please login again');
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
  password: string,
  turnstileToken?: string
): Promise<{ success: boolean; message: string; needVerification?: boolean }> {
  const body: { email: string; password: string; turnstileToken?: string } = { email, password };
  if (turnstileToken) body.turnstileToken = turnstileToken;
  return request(`${BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** 验证邮箱验证码 */
export async function verifyEmail(
  email: string,
  code: string
): Promise<{ success: boolean; message: string }> {
  return request(`${BASE}/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
}

/** 重新发送验证邮件 */
export async function resendVerification(
  email: string
): Promise<{ success: boolean; message: string }> {
  return request(`${BASE}/resend-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function login(
  email: string,
  password: string,
  turnstileToken?: string
): Promise<{ success: boolean; message: string; email: string; need2FA?: boolean }> {
  const body: { email: string; password: string; turnstileToken?: string } = { email, password };
  if (turnstileToken) body.turnstileToken = turnstileToken;
  return request(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** 请求密码重置 */
export async function requestPasswordReset(
  email: string
): Promise<{ success: boolean; message: string }> {
  return request(`${BASE}/password-reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

/** 验证重置令牌 */
export async function verifyResetToken(
  token: string
): Promise<{ valid: boolean; email?: string; message: string }> {
  return request(`${BASE}/password-reset/${token}`, {
    method: 'GET',
  });
}

/** 重置密码 */
export async function resetPassword(
  token: string,
  password: string
): Promise<{ success: boolean; message: string }> {
  return request(`${BASE}/password-reset/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
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

export async function getChannelsWithToken(
  token: string,
  forceRefresh = false
): Promise<{
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
  return withCache(url, () => tokenRequest(url, token), token, {
    forceRefresh,
  });
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
  payload: { title: string; body?: string; url?: string; channels?: PushChannel[]; async?: boolean }
): Promise<{
  success: boolean;
  message: string;
  results?: Array<{ channel: PushChannel; success: boolean; message: string }>;
  requestId?: string;
  async?: boolean;
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
  results?: Array<{ channel: PushChannel; success: boolean; message: string }>;
  requestId?: string;
  async?: boolean;
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
    createdAt: string;
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
  return tokenRequest<{
    history: Array<{
      id: string;
      createdAt: string;
      title: string;
      body: string;
      url: string;
      channels: string[];
      status: string;
      deliveredAt?: string;
      readAt?: string;
      clickedAt?: string;
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
  }>(url, token);
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
  return withCache(url, () => tokenRequest(url, token), token);
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
  id: string,
  forceRefresh?: boolean
): Promise<{ backups: Array<{ key: string; size: number; lastModified: string }> }> {
  const url = `${BASE}/admin/backup-endpoints/${id}/backups`;
  return withCache(url, () => tokenRequest(url, token), token, {
    forceRefresh,
    // 不指定 ttl，让 withCache 使用 apiCache.getUrlTtl(url) 获取自定义 TTL
  });
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
  results: Array<{
    success: boolean;
    message: string;
    endpointId?: string;
    endpointName?: string;
    errorMessage?: string;
  }>;
}> {
  const result = await tokenRequest<{
    results: Array<{
      success: boolean;
      message: string;
      endpointId?: string;
      endpointName?: string;
      errorMessage?: string;
    }>;
  }>(`${BASE}/admin/backup-all`, token, { method: 'POST' });
  apiCache.invalidate(`${BASE}/admin/backup-endpoints`, token);
  return result;
}

// 手动触发单个备份端备份
export async function backupSingleEndpoint(
  token: string,
  id: string
): Promise<{ success: boolean; message: string; endpointId?: string; endpointName?: string }> {
  const result = await tokenRequest<{
    success: boolean;
    message: string;
    endpointId?: string;
    endpointName?: string;
  }>(`${BASE}/admin/backup-endpoints/${id}/backup`, token, { method: 'POST' });
  apiCache.invalidate(`${BASE}/admin/backup-endpoints`, token);
  return result;
}

// -------------------------------------------
// 推送模板接口
// -------------------------------------------

// 获取所有模板
export async function getTemplates(token: string): Promise<{ templates: PushTemplate[] }> {
  const url = `${BASE}/admin/templates`;
  return withCache(url, () => tokenRequest(url, token), token);
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
  return withCache(url, () => tokenRequest(url, token), token);
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
  return withCache(cacheKey, () => tokenRequest(url, token), token);
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
    yearlyDates?: Array<{ month: number; day: number }>;
    intervalHours?: number;
    intervalMonths?: number;
    intervalYears?: number;
    cronExpression?: string;
    timezone?: string;
    abTestEnabled?: boolean;
    abTestVariants?: Array<{ name: string; content: string; weight: number }>;
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
    yearlyDates?: Array<{ month: number; day: number }>;
    intervalHours?: number;
    intervalMonths?: number;
    intervalYears?: number;
    cronExpression?: string;
    timezone?: string;
    abTestEnabled?: boolean;
    abTestVariants?: Array<{ name: string; content: string; weight: number }>;
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
export async function getPushStats(token: string, days: number = 7): Promise<PushStats> {
  return tokenRequest(`${BASE}/admin/stats?days=${days}`, token);
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
    token
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

// 标记推送回执
export async function markReceipt(
  token: string,
  id: string,
  action: 'delivered' | 'read' | 'clicked'
): Promise<{ success: boolean; message: string }> {
  return tokenRequest(`${BASE}/admin/history/${id}/receipt`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
}

// 标记推送已送达
export async function markDelivered(
  token: string,
  id: string
): Promise<{ success: boolean; message: string }> {
  return tokenRequest(`${BASE}/admin/history/${id}/delivered`, token, {
    method: 'POST',
  });
}

// 标记推送已读
export async function markRead(
  token: string,
  id: string
): Promise<{ success: boolean; message: string }> {
  return tokenRequest(`${BASE}/admin/history/${id}/read`, token, {
    method: 'POST',
  });
}

// 标记推送已点击
export async function markClicked(
  token: string,
  id: string
): Promise<{ success: boolean; message: string }> {
  return tokenRequest(`${BASE}/admin/history/${id}/clicked`, token, {
    method: 'POST',
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
// 用户设置接口
// -------------------------------------------

export interface AIProviderConfig {
  api_key?: string;
  api_url?: string;
  model_name?: string;
}

export interface CustomAIProvider {
  id: string;
  name: string;
  icon: string;
}

export interface UserSettings {
  cache_ttl_backup?: number;
  cache_ttl_channels?: number;
  cache_ttl_templates?: number;
  cache_ttl_groups?: number;
  cache_ttl_scheduled?: number;
  ai_model?: string;
  ai_enabled?: boolean;
  ai_provider?: string;
  // 自定义AI提供商列表（用户自己添加的）
  custom_ai_providers?: CustomAIProvider[];
  // 每个AI提供商独立的配置（支持预定义和自定义提供商）
  ai_provider_configs?: Record<string, AIProviderConfig>;
  // 兼容性字段（保持与旧版本兼容）
  ai_api_key?: string;
  ai_api_url?: string;
  ai_model_name?: string;
}

// 获取用户设置
export async function getUserSettings(
  token: string
): Promise<{ success: boolean; settings: UserSettings }> {
  return withCache(
    `${BASE}/admin/me/settings`,
    () => tokenRequest(`${BASE}/admin/me/settings`, token),
    token
  );
}

// 保存用户设置
export async function saveUserSettings(
  token: string,
  settings: UserSettings
): Promise<{ success: boolean; message: string; settings: UserSettings }> {
  const result = await tokenRequest<{ success: boolean; message: string; settings: UserSettings }>(
    `${BASE}/admin/me/settings`,
    token,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }
  );
  apiCache.invalidate(`${BASE}/admin/me/settings`, token);
  return result;
}

// 保存缓存设置
export async function saveCacheSettings(
  token: string,
  settings: {
    cache_ttl_backup?: number;
    cache_ttl_channels?: number;
    cache_ttl_templates?: number;
    cache_ttl_groups?: number;
    cache_ttl_scheduled?: number;
  }
): Promise<{ success: boolean; message: string; settings: UserSettings }> {
  const result = await tokenRequest<{ success: boolean; message: string; settings: UserSettings }>(
    `${BASE}/admin/me/settings/cache`,
    token,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }
  );
  apiCache.invalidate(`${BASE}/admin/me/settings`, token);
  return result;
}

// ============================================
// IP 白名单管理
// ============================================

export async function getAllowedIPs(token: string): Promise<{ success: boolean; ips: string[] }> {
  return tokenRequest(`${BASE}/admin/me/allowed-ips`, token);
}

export async function addAllowedIP(
  token: string,
  ip: string
): Promise<{ success: boolean; ips: string[]; message: string }> {
  return tokenRequest(`${BASE}/admin/me/allowed-ips`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip }),
  });
}

export async function removeAllowedIP(
  token: string,
  ip: string
): Promise<{ success: boolean; ips: string[]; message: string }> {
  return tokenRequest(`${BASE}/admin/me/allowed-ips`, token, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip }),
  });
}

export interface AITool {
  id: string;
  name: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    description: string;
    required: boolean;
  }>;
  enabled: boolean;
  isDefault?: boolean;
}

// 保存AI设置
export async function saveAISettings(
  token: string,
  settings: {
    ai_model?: string;
    ai_enabled?: boolean;
    ai_provider?: string;
    ai_api_key?: string;
    ai_api_url?: string;
    ai_model_name?: string;
    custom_ai_providers?: CustomAIProvider[];
    ai_provider_configs?: Record<string, AIProviderConfig>;
    ai_tools?: AITool[];
  }
): Promise<{ success: boolean; message: string; settings: UserSettings }> {
  const result = await tokenRequest<{ success: boolean; message: string; settings: UserSettings }>(
    `${BASE}/admin/me/settings/ai`,
    token,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }
  );
  apiCache.invalidate(`${BASE}/admin/me/settings`, token);
  return result;
}

// 获取 AI 工具列表
export async function getAITools(token: string): Promise<{ success: boolean; tools: AITool[] }> {
  return tokenRequest(`${BASE}/admin/me/ai/tools`, token);
}

// -------------------------------------------
// AI 相关接口
// -------------------------------------------

// 检查 AI 是否可用（公开接口，不需要认证）
export async function checkAIAvailable(): Promise<{ available: boolean }> {
  const response = await fetch(`${BASE}/ai/available`);
  return response.json();
}

// 使用 AI 生成消息
export async function generateMessageWithAI(
  token: string,
  prompt: string,
  type: 'title' | 'body' | 'both' = 'both',
  language: 'zh' | 'en' = 'zh'
): Promise<{
  success: boolean;
  title?: string;
  body?: string;
  message?: string;
}> {
  return tokenRequest(`${BASE}/admin/ai/generate`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, type, language }),
  });
}

// AI 工具调用 - 执行命令
export async function executeAICommand(
  token: string,
  query: string
): Promise<{
  success: boolean;
  result: string;
  data?: unknown;
  error?: string;
}> {
  return tokenRequest(`${BASE}/admin/ai/execute`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
}

/** AI Agent - 自动分析并执行任务 */
export async function executeAIAgent(
  token: string,
  query: string
): Promise<{
  success: boolean;
  thinking: string;
  steps: Array<{ action: string; params: unknown; result?: unknown; error?: string }>;
  result: string;
}> {
  return tokenRequest(`${BASE}/admin/ai/agent`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
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
  avatar_url?: string;
}

// 获取当前用户信息
export async function getCurrentUser(
  token: string
): Promise<UserInfo & { avatar_url?: string; use_avatar_as_popup?: number }> {
  return tokenRequest(`${BASE}/admin/me`, token);
}

// ============================================
// 系统健康监控
// ============================================

export interface SystemHealth {
  database: { status: string; message: string };
  lastCronRun: string | null;
  activeUsers: number;
  recentPushCount: number;
  queueStatus: { available: boolean; message: string };
  dbSize?: string;
  dbRowCount?: number;
  r2Storage?: {
    available: boolean;
    objectCount: number;
    totalSize: number;
    totalSizeFormatted: string;
  };
  recentErrors?: Array<{ userId: string; action: string; data: string; createdAt: string }>;
}

export interface ActivityData {
  date: string;
  logins: number;
  pushes: number;
  templates: number;
}

export interface ExecutionLog {
  id: string;
  pushHistoryId?: string;
  startedAt: string;
  finishedAt?: string;
  status: string;
  channels: string[];
  channelResults: Array<{ channel: string; success: boolean; message: string; latencyMs?: number }>;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export async function getSystemHealth(
  token: string
): Promise<{ success: boolean; health: SystemHealth }> {
  return tokenRequest(`${BASE}/admin/system/health`, token);
}

// -------------------------------------------
// 用户活动分析接口
// -------------------------------------------

export async function getActivityAnalytics(
  token: string
): Promise<{ success: boolean; activity: ActivityData[] }> {
  return tokenRequest(`${BASE}/admin/analytics/activity`, token);
}

// -------------------------------------------
// 推送执行日志接口
// -------------------------------------------

export async function getExecutionLogs(
  token: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ success: boolean; logs: ExecutionLog[]; total: number; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (options?.page) params.set('page', String(options.page));
  if (options?.pageSize) params.set('pageSize', String(options.pageSize));
  const query = params.toString();
  const url = query ? `${BASE}/admin/execution-logs?${query}` : `${BASE}/admin/execution-logs`;
  return tokenRequest(url, token);
}

export async function getExecutionLogDetail(
  token: string,
  id: string
): Promise<{ success: boolean; log: ExecutionLog }> {
  return tokenRequest(`${BASE}/admin/execution-logs/${id}`, token);
}

// -------------------------------------------
// 推送收藏夹接口
// -------------------------------------------

export interface PushFavorite {
  id: string;
  title: string;
  body: string;
  url: string;
  channels: PushChannel[];
  createdAt: string;
  updatedAt: string;
}

export async function getFavorites(token: string): Promise<{ favorites: PushFavorite[] }> {
  return tokenRequest(`${BASE}/admin/favorites`, token);
}

export async function saveFavorite(
  token: string,
  data: { title: string; body?: string; url?: string; channels: PushChannel[] }
): Promise<{ success: boolean; favorite: PushFavorite }> {
  return tokenRequest<{ success: boolean; favorite: PushFavorite }>(
    `${BASE}/admin/favorites`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  );
}

export async function deleteFavorite(
  token: string,
  id: string
): Promise<{ success: boolean; message: string }> {
  return tokenRequest(`${BASE}/admin/favorites/${id}`, token, { method: 'DELETE' });
}

// -------------------------------------------
// 推送撤销接口
// -------------------------------------------

export async function revokePush(
  token: string,
  id: string
): Promise<{ success: boolean; message: string }> {
  return tokenRequest(`${BASE}/admin/push-history/${id}/revoke`, token, { method: 'POST' });
}

// -------------------------------------------
// 版本对比接口
// -------------------------------------------

export async function getPushVersions(
  token: string,
  id: string
): Promise<{ success: boolean; history: Record<string, unknown> }> {
  return tokenRequest(`${BASE}/admin/push-history/${id}/versions`, token);
}

export async function comparePushVersions(
  token: string,
  id1: string,
  id2: string
): Promise<{
  success: boolean;
  records: Record<string, unknown>[];
  diff: { title: boolean; body: boolean; url: boolean; channels: boolean };
}> {
  return tokenRequest(`${BASE}/admin/push-history/compare`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id1, id2 }),
  });
}

// -------------------------------------------
// 分组批量发送接口
// -------------------------------------------

export async function batchSendToGroups(
  token: string,
  data: {
    groupIds: string[];
    title: string;
    body?: string;
    url?: string;
  }
): Promise<{
  success: boolean;
  message: string;
  results: ChannelResult[];
  sentToGroups: number;
  totalChannels: number;
}> {
  return tokenRequest(`${BASE}/admin/groups/batch-send`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// 检查头像存储服务状态
export async function getAvatarStorageStatus(
  token: string
): Promise<{ success: boolean; hasR2: boolean; message: string }> {
  return tokenRequest(`${BASE}/admin/me/avatar/status`, token);
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

export async function uploadAvatar(
  token: string,
  file: File
): Promise<{ success: boolean; message: string; avatar_url: string }> {
  const formData = new FormData();
  formData.append('avatar', file);

  const res = await fetch(`${BASE}/admin/me/avatar/upload`, {
    method: 'POST',
    headers: { 'X-Token': token },
    body: formData,
  });

  if (!res.ok) {
    throw await handleResponseError(res);
  }

  return res.json();
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

export { apiCache };

// -------------------------------------------
// 模板市场接口
// -------------------------------------------

export async function getMarketTemplates(
  token: string,
  options?: { limit?: number; offset?: number; category?: string; search?: string }
): Promise<{ templates: PushTemplate[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  if (options?.category) params.set('category', options.category);
  if (options?.search) params.set('search', options.search);
  const query = params.toString();
  const url = query ? `${BASE}/admin/templates/market?${query}` : `${BASE}/admin/templates/market`;
  return tokenRequest(url, token);
}

export async function publishTemplate(
  token: string,
  id: string
): Promise<{ success: boolean; message: string }> {
  const result = await tokenRequest<{ success: boolean; message: string }>(
    `${BASE}/admin/templates/${id}/publish`,
    token,
    { method: 'POST' }
  );
  apiCache.invalidate(`${BASE}/admin/templates`, token);
  return result;
}

export async function unpublishTemplate(
  token: string,
  id: string
): Promise<{ success: boolean; message: string }> {
  const result = await tokenRequest<{ success: boolean; message: string }>(
    `${BASE}/admin/templates/${id}/unpublish`,
    token,
    { method: 'POST' }
  );
  apiCache.invalidate(`${BASE}/admin/templates`, token);
  return result;
}

export async function copyFromMarket(
  token: string,
  templateId: string
): Promise<{ success: boolean; template: PushTemplate }> {
  const result = await tokenRequest<{ success: boolean; template: PushTemplate }>(
    `${BASE}/admin/templates/market/${templateId}/copy`,
    token,
    { method: 'POST' }
  );
  apiCache.invalidate(`${BASE}/admin/templates`, token);
  return result;
}

export async function forkTemplate(
  token: string,
  templateId: string
): Promise<{ success: boolean; template: PushTemplate }> {
  const result = await tokenRequest<{ success: boolean; template: PushTemplate }>(
    `${BASE}/admin/templates/${templateId}/fork`,
    token,
    { method: 'POST' }
  );
  apiCache.invalidate(`${BASE}/admin/templates`, token);
  return result;
}

// -------------------------------------------
// 推送工作流接口
// -------------------------------------------

export interface WorkflowStep {
  type: 'push' | 'delay' | 'condition';
  config: Record<string, unknown>;
}

export interface PushWorkflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  enabled: boolean;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  lastRunAt?: string;
  lastStatus?: string;
  createdAt: string;
  updatedAt: string;
}

export async function getWorkflows(token: string): Promise<{ workflows: PushWorkflow[] }> {
  return tokenRequest(`${BASE}/admin/workflows`, token);
}

export async function createWorkflow(
  token: string,
  workflow: {
    name: string;
    description?: string;
    steps: WorkflowStep[];
    enabled?: boolean;
    triggerType?: string;
    triggerConfig?: Record<string, unknown>;
  }
): Promise<{ success: boolean; workflow: PushWorkflow }> {
  const result = await tokenRequest<{ success: boolean; workflow: PushWorkflow }>(
    `${BASE}/admin/workflows`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workflow),
    }
  );
  apiCache.invalidate(`${BASE}/admin/workflows`, token);
  return result;
}

export async function updateWorkflow(
  token: string,
  id: string,
  workflow: Partial<PushWorkflow>
): Promise<{ success: boolean; workflow: PushWorkflow }> {
  const result = await tokenRequest<{ success: boolean; workflow: PushWorkflow }>(
    `${BASE}/admin/workflows/${id}`,
    token,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workflow),
    }
  );
  apiCache.invalidate(`${BASE}/admin/workflows`, token);
  return result;
}

export async function deleteWorkflow(
  token: string,
  id: string
): Promise<{ success: boolean; message: string }> {
  const result = await tokenRequest<{ success: boolean; message: string }>(
    `${BASE}/admin/workflows/${id}`,
    token,
    { method: 'DELETE' }
  );
  apiCache.invalidate(`${BASE}/admin/workflows`, token);
  return result;
}

export async function executeWorkflow(
  token: string,
  id: string
): Promise<{
  success: boolean;
  results: Array<{ step: number; status: string; message: string }>;
}> {
  return tokenRequest(`${BASE}/admin/workflows/${id}/execute`, token, {
    method: 'POST',
  });
}

// -------------------------------------------
// 推送草稿箱接口
// -------------------------------------------

export interface PushDraft {
  id: string;
  title: string;
  body: string;
  url: string;
  channels: PushChannel[];
  createdAt: string;
  updatedAt: string;
}

// 获取草稿列表
export async function getDrafts(token: string): Promise<{ drafts: PushDraft[] }> {
  return tokenRequest(`${BASE}/admin/drafts`, token);
}

// 创建草稿
export async function createDraft(
  token: string,
  draft: { title: string; body?: string; url?: string; channels?: PushChannel[] }
): Promise<{ success: boolean; draft: PushDraft }> {
  const result = await tokenRequest<{ success: boolean; draft: PushDraft }>(
    `${BASE}/admin/drafts`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    }
  );
  return result;
}

// 更新草稿
export async function updateDraft(
  token: string,
  id: string,
  draft: { title?: string; body?: string; url?: string; channels?: PushChannel[] }
): Promise<{ success: boolean; draft: PushDraft }> {
  const result = await tokenRequest<{ success: boolean; draft: PushDraft }>(
    `${BASE}/admin/drafts/${id}`,
    token,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    }
  );
  return result;
}

// 删除草稿
export async function deleteDraft(
  token: string,
  id: string
): Promise<{ success: boolean; message: string }> {
  const result = await tokenRequest<{ success: boolean; message: string }>(
    `${BASE}/admin/drafts/${id}`,
    token,
    { method: 'DELETE' }
  );
  return result;
}

// -------------------------------------------
// 双因素认证 (2FA) 接口
// -------------------------------------------

// 获取 2FA 状态
export async function get2FAStatus(
  token: string
): Promise<{ enabled: boolean; hasSecret: boolean }> {
  return tokenRequest(`${BASE}/admin/2fa/status`, token);
}

// 设置 2FA（生成 secret）
export async function setup2FA(
  token: string
): Promise<{ success: boolean; secret: string; qrCode: string; otpauthUrl: string }> {
  return tokenRequest(`${BASE}/admin/2fa/setup`, token, {
    method: 'POST',
  });
}

// 验证并启用 2FA
export async function verify2FASetup(
  token: string,
  code: string
): Promise<{ success: boolean; message: string }> {
  return tokenRequest(`${BASE}/admin/2fa/verify-setup`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
}

// 禁用 2FA
export async function disable2FA(
  token: string,
  code: string
): Promise<{ success: boolean; message: string }> {
  return tokenRequest(`${BASE}/admin/2fa/disable`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
}

// 登录时 2FA 验证
export async function login2FA(
  email: string,
  password: string,
  code: string
): Promise<{ success: boolean; message: string; email: string }> {
  return request(`${BASE}/login/2fa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, code }),
  });
}

// -------------------------------------------
// 审计日志接口（管理员专用）
// -------------------------------------------

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  avatar_url?: string;
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

export async function clearAuditLogs(
  token: string
): Promise<{ success: boolean; message: string }> {
  return tokenRequest(`${BASE}/admin/audit`, token, {
    method: 'DELETE',
  });
}

// -------------------------------------------
// 系统设置接口（管理员专用）
// -------------------------------------------

export interface SystemSettings {
  turnstile_enabled?: boolean;
  turnstile_site_key?: string;
  turnstile_secret_key?: string;
  cleanup_enabled?: boolean;
  cleanup_push_history_days?: number;
  cleanup_audit_log_days?: number;
  cleanup_batch_size?: number;
  cors_allowed_origins?: string[];
  smtp_host?: string;
  smtp_port?: string;
  smtp_username?: string;
  smtp_password?: string;
  mail_from?: string;
}

export async function getSystemSettings(
  token: string
): Promise<{ success: boolean; settings: SystemSettings }> {
  return tokenRequest(`${BASE}/admin/system/settings`, token);
}

export async function saveSystemSettings(
  token: string,
  settings: Partial<SystemSettings>
): Promise<{ success: boolean; message: string }> {
  const result = await tokenRequest<{ success: boolean; message: string }>(
    `${BASE}/admin/system/settings`,
    token,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }
  );
  apiCache.invalidate(`${BASE}/admin/system/settings`, token);
  return result;
}

// -------------------------------------------
// 数据库管理接口（管理员专用）
// -------------------------------------------

export interface DatabaseStats {
  pushHistoryCount: number;
  auditLogsCount: number;
  usersCount: number;
  estimatedSize: string;
}

export interface ArchiveInfo {
  key: string;
  size: number;
  archivedAt: string;
}

export async function getDatabaseStats(
  token: string
): Promise<{ success: boolean; stats: DatabaseStats }> {
  return tokenRequest(`${BASE}/admin/database/stats`, token);
}

export async function cleanupDatabase(
  token: string,
  options?: {
    pushHistoryRetentionDays?: number;
    auditLogRetentionDays?: number;
    batchSize?: number;
  }
): Promise<{ success: boolean; pushHistoryDeleted: number; auditLogsDeleted: number }> {
  return tokenRequest<{ success: boolean; pushHistoryDeleted: number; auditLogsDeleted: number }>(
    `${BASE}/admin/database/cleanup`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {}),
    }
  );
}

export async function archiveDatabase(
  token: string,
  options?: { archiveAfterDays?: number; batchSize?: number }
): Promise<{ success: boolean; archived: number; failed: number }> {
  return tokenRequest<{ success: boolean; archived: number; failed: number }>(
    `${BASE}/admin/database/archive`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {}),
    }
  );
}

export async function getArchives(
  token: string
): Promise<{ success: boolean; archives: ArchiveInfo[] }> {
  return tokenRequest(`${BASE}/admin/database/archives`, token);
}

export async function restoreArchive(
  token: string,
  archiveKey: string
): Promise<{ success: boolean; restored: number }> {
  return tokenRequest<{ success: boolean; restored: number }>(
    `${BASE}/admin/database/archives/${encodeURIComponent(archiveKey)}/restore`,
    token,
    { method: 'POST' }
  );
}

export interface DatabaseTable {
  name: string;
  isSafe: boolean;
  shouldDelete: boolean;
  rowCount?: number;
}

export async function getDatabaseTables(
  token: string
): Promise<{ success: boolean; tables: DatabaseTable[] }> {
  return withCache(
    `${BASE}/admin/database/tables`,
    () => tokenRequest(`${BASE}/admin/database/tables`, token),
    token,
    { ttl: 5 * 60 * 1000 }
  );
}

export async function deleteDatabaseTable(
  token: string,
  tableName: string
): Promise<{ success: boolean; error?: string }> {
  const result = await tokenRequest<{ success: boolean; error?: string }>(
    `${BASE}/admin/database/tables/${encodeURIComponent(tableName)}`,
    token,
    { method: 'DELETE' }
  );
  apiCache.invalidate(`${BASE}/admin/database/tables`, token);
  apiCache.invalidate(`${BASE}/admin/database/stats`, token);
  return result;
}

export async function cleanupOrphanTables(
  token: string
): Promise<{ success: boolean; deletedTables: string[] }> {
  const result = await tokenRequest<{ success: boolean; deletedTables: string[] }>(
    `${BASE}/admin/database/cleanup-tables`,
    token,
    { method: 'POST' }
  );
  apiCache.invalidate(`${BASE}/admin/database/tables`, token);
  apiCache.invalidate(`${BASE}/admin/database/stats`, token);
  return result;
}

// -------------------------------------------
// 数据导出接口（增强版）
// -------------------------------------------

export async function exportData(
  token: string,
  options?: { format?: 'json' | 'csv'; dateRange?: { start?: string; end?: string } }
): Promise<void> {
  const res = await fetch(`${BASE}/admin/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': token,
    },
    body: JSON.stringify(options || {}),
  });

  if (!res.ok) {
    throw await handleResponseError(res);
  }

  const disposition = res.headers.get('Content-Disposition') || '';
  const filename =
    disposition.match(/filename="([^"]+)"/)?.[1] ||
    `data-export.${options?.format === 'csv' ? 'csv' : 'json'}`;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
