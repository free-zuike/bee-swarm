// ============================================
// API 服务封装
// ============================================
import type { PushChannel, ChannelSettings } from '@/types';

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    let errorMsg = `请求失败 (${res.status})`;
    try {
      const body = await res.json();
      if (body.error) errorMsg = body.error;
      else if (body.message) errorMsg = body.message;
    } catch { /* ignore */ }
    throw new Error(errorMsg);
  }
  return res.json();
}

/** 带 Token 的请求 */
async function tokenRequest<T>(url: string, token: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> || {}),
    'X-Token': token,
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    let errorMsg = `请求失败 (${res.status})`;
    try {
      const body = await res.json();
      if (body.error) errorMsg = body.error;
      else if (body.message) errorMsg = body.message;
    } catch { /* ignore */ }
    throw new Error(errorMsg);
  }
  return res.json();
}

// -------------------------------------------
// 公开接口
// -------------------------------------------

export async function register(email: string, password: string): Promise<{ success: boolean; message: string }> {
  return request(`${BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

export async function login(email: string, password: string): Promise<{ success: boolean; message: string; email: string }> {
  return request(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

/** 获取访问 Token */
export async function getToken(email: string, password: string): Promise<{
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
    id: PushChannel; name: string; icon: string;
    fields: Array<{ key: string; label: string; type: string; placeholder: string; required: boolean }>;
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

export async function getHistoryWithToken(token: string): Promise<{
  history: Array<{
    time: string;
    title: string;
    body: string;
    url: string;
    results: Array<{ channel: PushChannel; success: boolean; message: string }>;
  }>;
}> {
  return tokenRequest(`${BASE}/admin/history`, token);
}

export async function getApiKeyWithToken(token: string, refresh?: boolean): Promise<{ apikey: string }> {
  const url = refresh ? `${BASE}/apikey?refresh=true` : `${BASE}/apikey`;
  return tokenRequest(url, token);
}

// -------------------------------------------
// 多备份端接口（Token 认证）
// -------------------------------------------

export interface BackupEndpoint {
  id: string;
  name: string;
  type: 's3' | 'webdav';
  enabled: boolean;
  config: {
    endpoint?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    bucket?: string;
    region?: string;
    path?: string;
    pathStyle?: boolean;
    url?: string;
    username?: string;
    password?: string;
  };
  schedule: {
    enabled: boolean;
    interval: number;
    startTime: string;
  };
  retention: number;
  lastBackup?: {
    time: string;
    status: 'success' | 'failed';
    message?: string;
  };
}

// 获取所有备份端
export async function getBackupEndpoints(token: string): Promise<{ endpoints: BackupEndpoint[] }> {
  return tokenRequest(`${BASE}/admin/backup-endpoints`, token);
}

// 添加备份端
export async function addBackupEndpoint(token: string, endpoint: Omit<BackupEndpoint, 'id'>): Promise<{ success: boolean; endpoint: BackupEndpoint }> {
  return tokenRequest(`${BASE}/admin/backup-endpoints`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(endpoint),
  });
}

// 更新备份端
export async function updateBackupEndpoint(token: string, id: string, endpoint: Partial<BackupEndpoint>): Promise<{ success: boolean; endpoint: BackupEndpoint }> {
  return tokenRequest(`${BASE}/admin/backup-endpoints/${id}`, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(endpoint),
  });
}

// 删除备份端
export async function deleteBackupEndpoint(token: string, id: string): Promise<{ success: boolean; message: string }> {
  return tokenRequest(`${BASE}/admin/backup-endpoints/${id}`, token, { method: 'DELETE' });
}

// 测试备份端连接
export async function testBackupEndpoint(token: string, id: string, config?: any): Promise<{ success: boolean; message: string }> {
  return tokenRequest(`${BASE}/admin/backup-endpoints/${id}/test`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: config ? JSON.stringify(config) : undefined,
  });
}

// 列出指定备份端的备份
export async function listBackupsFromEndpoint(token: string, id: string): Promise<{ backups: Array<{ key: string; size: number; lastModified: string }> }> {
  return tokenRequest(`${BASE}/admin/backup-endpoints/${id}/backups`, token);
}

// 从指定备份端恢复
export async function restoreBackupFromEndpoint(token: string, id: string, key: string): Promise<{ success: boolean; message: string }> {
  return tokenRequest(`${BASE}/admin/backup-endpoints/${id}/restore`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
}

// 删除指定备份端的备份
export async function deleteBackupFromEndpoint(token: string, id: string, key: string): Promise<{ success: boolean; message: string }> {
  return tokenRequest(`${BASE}/admin/backup-endpoints/${id}/backups`, token, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
}

// 手动触发所有启用的备份
export async function backupAll(token: string): Promise<{ results: Array<{ success: boolean; message: string; endpointId?: string; endpointName?: string }> }> {
  return tokenRequest(`${BASE}/admin/backup-all`, token, { method: 'POST' });
}

// 手动触发单个备份端备份
export async function backupSingleEndpoint(token: string, id: string): Promise<{ success: boolean; message: string; endpointId?: string; endpointName?: string }> {
  return tokenRequest(`${BASE}/admin/backup-endpoints/${id}/backup`, token, { method: 'POST' });
}
