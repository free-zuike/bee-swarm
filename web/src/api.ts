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

/** 认证参数（用户名+密码） */
function authQuery(username: string, password: string): string {
  return `?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
}

/** Token 认证参数 */
function tokenAuth(token: string): RequestInit {
  return {
    headers: {
      ...(token ? { 'X-Token': token } : {}),
    },
  };
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
// 管理接口（需用户名+密码）
// -------------------------------------------

export async function getChannels(username: string, password: string): Promise<{
  channels: Array<{ id: PushChannel; name: string; icon: string; enabled: boolean }>;
  settings: ChannelSettings;
  definitions: Array<{
    id: PushChannel; name: string; icon: string;
    fields: Array<{ key: string; label: string; type: string; placeholder: string; required: boolean }>;
  }>;
}> {
  return request(`${BASE}/admin/channels${authQuery(username, password)}`);
}

export async function saveChannel(
  username: string,
  password: string,
  channelId: string,
  fields: Record<string, string>
): Promise<{
  success: boolean;
  message: string;
  channels: Array<{ id: PushChannel; name: string; icon: string; enabled: boolean }>;
}> {
  return request(`${BASE}/admin/channels/${channelId}${authQuery(username, password)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

export async function sendPush(
  username: string,
  password: string,
  payload: { title: string; body?: string; url?: string; channels?: PushChannel[] }
): Promise<{
  success: boolean;
  message: string;
  results: Array<{ channel: PushChannel; success: boolean; message: string }>;
}> {
  return request(`${BASE}/admin/push${authQuery(username, password)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function getHistory(username: string, password: string): Promise<{
  history: Array<{
    time: string;
    title: string;
    body: string;
    url: string;
    results: Array<{ channel: PushChannel; success: boolean; message: string }>;
  }>;
}> {
  return request(`${BASE}/admin/history${authQuery(username, password)}`);
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
// 备份管理接口（Token 认证）
// -------------------------------------------

// 手动备份
export async function createBackup(token: string) {
  return tokenRequest(`${BASE}/admin/backup`, token, { method: 'POST' });
}

// 列出备份
export async function listBackups(token: string) {
  return tokenRequest(`${BASE}/admin/backups`, token);
}

// 恢复备份
export async function restoreBackup(token: string, key: string) {
  return tokenRequest(`${BASE}/admin/backup/restore`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
}

// 删除备份
export async function deleteBackup(token: string, key: string) {
  return tokenRequest(`${BASE}/admin/backup`, token, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
}
