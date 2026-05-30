// ============================================
// API 服务封装
// ============================================
import type { PushChannel, ChannelSettings, BackupEndpoint, PushTemplate, ChannelGroup, ScheduledPush, PushStats, PushMetrics, ChannelHealth } from '@/types';

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

/** 带 Token 的请求 */
async function tokenRequest<T>(url: string, token: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...((options?.headers as Record<string, string>) || {}),
    'X-Token': token,
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('bee_swarm_token');
      localStorage.removeItem('bee_swarm_refresh_token');
      localStorage.removeItem('bee_swarm_expires_at');
      if (window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }
    throw await handleResponseError(res);
  }
  return res.json();
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
  return tokenRequest(`${BASE}/admin/channels`, token);
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
  return tokenRequest(`${BASE}/admin/channels/${channelId}`, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
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

export async function getHistoryWithToken(
  token: string,
  options?: { page?: number; pageSize?: number; channel?: string; status?: string; keyword?: string }
): Promise<{
  history: Array<{
    id: string;
    time: string;
    title: string;
    body: string;
    url: string;
    channels: string[];
    status: string;
    results: Array<{ channel: PushChannel; success: boolean; message: string; latencyMs?: number; retries?: number }>;
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
  return tokenRequest(`${BASE}/admin/backup-endpoints`, token);
}

// 添加备份端
export async function addBackupEndpoint(
  token: string,
  endpoint: Omit<BackupEndpoint, 'id'>
): Promise<{ success: boolean; endpoint: BackupEndpoint }> {
  return tokenRequest(`${BASE}/admin/backup-endpoints`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(endpoint),
  });
}

// 更新备份端
export async function updateBackupEndpoint(
  token: string,
  id: string,
  endpoint: Partial<BackupEndpoint>
): Promise<{ success: boolean; endpoint: BackupEndpoint }> {
  return tokenRequest(`${BASE}/admin/backup-endpoints/${id}`, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(endpoint),
  });
}

// 删除备份端
export async function deleteBackupEndpoint(
  token: string,
  id: string
): Promise<{ success: boolean; message: string }> {
  return tokenRequest(`${BASE}/admin/backup-endpoints/${id}`, token, { method: 'DELETE' });
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
  const filename = res.headers.get('Content-Disposition')
    ?.match(/filename="([^"]+)"/)?.[1]
    || key.split('/').pop()
    || 'backup.json';

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
  return tokenRequest(`${BASE}/admin/templates`, token);
}

// 创建模板
export async function createTemplate(
  token: string,
  template: Omit<PushTemplate, 'id' | 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; template: PushTemplate }> {
  return tokenRequest(`${BASE}/admin/templates`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(template),
  });
}

// 更新模板
export async function updateTemplate(
  token: string,
  id: string,
  template: Partial<PushTemplate>
): Promise<{ success: boolean; template: PushTemplate }> {
  return tokenRequest(`${BASE}/admin/templates/${id}`, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(template),
  });
}

// 删除模板
export async function deleteTemplate(
  token: string,
  id: string
): Promise<{ success: boolean; message: string }> {
  return tokenRequest(`${BASE}/admin/templates/${id}`, token, { method: 'DELETE' });
}

// -------------------------------------------
// 渠道分组接口
// -------------------------------------------

// 获取所有分组
export async function getChannelGroups(token: string): Promise<{ groups: ChannelGroup[] }> {
  return tokenRequest(`${BASE}/admin/groups`, token);
}

// 创建分组
export async function createChannelGroup(
  token: string,
  group: { name: string; channels: PushChannel[] }
): Promise<{ success: boolean; group: ChannelGroup }> {
  return tokenRequest(`${BASE}/admin/groups`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(group),
  });
}

// 删除分组
export async function deleteChannelGroup(
  token: string,
  id: string
): Promise<{ success: boolean; message: string }> {
  return tokenRequest(`${BASE}/admin/groups/${id}`, token, { method: 'DELETE' });
}

// 更新分组
export async function updateChannelGroup(
  token: string,
  id: string,
  group: { name?: string; channels?: string[] }
): Promise<{ success: boolean; group: ChannelGroup }> {
  return tokenRequest(`${BASE}/admin/groups/${id}`, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(group),
  });
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
  return tokenRequest(url, token);
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
    recurringType?: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'interval' | 'cron';
    selectedWeekDays?: number[];
    selectedMonthDays?: number[];
    intervalHours?: number;
    cronExpression?: string;
  }
): Promise<{ success: boolean; scheduled: ScheduledPush }> {
  return tokenRequest(`${BASE}/admin/scheduled`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(push),
  });
}

// 取消定时推送
export async function cancelScheduledPush(
  token: string,
  id: string
): Promise<{ success: boolean; message: string }> {
  return tokenRequest(`${BASE}/admin/scheduled/${id}`, token, { method: 'DELETE' });
}

// 删除定时推送
export async function deleteScheduledPush(
  token: string,
  id: string
): Promise<{ success: boolean; message: string }> {
  return tokenRequest(`${BASE}/admin/scheduled/${id}`, token, { method: 'DELETE' });
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
): Promise<{ success: boolean; results: Array<{ channel: PushChannel; success: boolean; message: string }>; message: string }> {
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
