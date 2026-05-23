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
      if (body.message) errorMsg = body.message;
      else if (body.error) errorMsg = body.error;
    } catch { /* ignore */ }
    throw new Error(errorMsg);
  }
  return res.json();
}

// -------------------------------------------
// 公开接口
// -------------------------------------------

export async function getVapidKey(): Promise<{ publicKey: string }> {
  return request(`${BASE}/vapid-key`);
}

export async function getStatus(): Promise<{ initialized: boolean }> {
  return request(`${BASE}/status`);
}

export async function setupPassword(password: string): Promise<{ success: boolean; message: string }> {
  return request(`${BASE}/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

export async function subscribe(subscription: PushSubscription): Promise<{ success: boolean; message: string }> {
  return request(`${BASE}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription),
  });
}

export async function unsubscribe(endpoint: string): Promise<{ success: boolean; message: string }> {
  return request(`${BASE}/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
}

// -------------------------------------------
// 管理接口（需认证）
// -------------------------------------------

export async function getChannels(password: string): Promise<{
  channels: Array<{ id: PushChannel; name: string; icon: string; enabled: boolean }>;
  settings: ChannelSettings;
  definitions: Array<{
    id: PushChannel; name: string; icon: string;
    fields: Array<{ key: string; label: string; type: string; placeholder: string; required: boolean }>;
  }>;
}> {
  return request(`${BASE}/admin/channels?password=${encodeURIComponent(password)}`);
}

export async function saveChannels(password: string, settings: ChannelSettings): Promise<{
  success: boolean;
  message: string;
  channels: Array<{ id: PushChannel; name: string; icon: string; enabled: boolean }>;
}> {
  return request(`${BASE}/admin/channels?password=${encodeURIComponent(password)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  });
}

export async function getSubscriptions(password: string): Promise<{
  total: number;
  subscriptions: PushSubscription[];
}> {
  return request(`${BASE}/admin/subscriptions?password=${encodeURIComponent(password)}`);
}

export async function sendPush(
  password: string,
  payload: { title: string; body?: string; url?: string; channels?: PushChannel[] }
): Promise<{
  success: boolean;
  message: string;
  results: Array<{ channel: PushChannel; success: boolean; message: string }>;
}> {
  return request(`${BASE}/admin/push?password=${encodeURIComponent(password)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
