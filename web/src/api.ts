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
