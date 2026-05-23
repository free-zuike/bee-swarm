// ============================================
// API 服务封装
// 所有后端接口调用集中管理
// ============================================
import type { PushChannel } from '@/types';

const BASE = '/api';

/** 通用请求封装 */
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  return res.json();
}

// -------------------------------------------
// 公开接口
// -------------------------------------------

/** 获取 VAPID 公钥 */
export async function getVapidKey(): Promise<{ publicKey: string }> {
  return request(`${BASE}/vapid-key`);
}

/** 订阅 Web Push */
export async function subscribe(subscription: PushSubscription): Promise<{ success: boolean; message: string }> {
  return request(`${BASE}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription),
  });
}

/** 取消订阅 */
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

/** 获取渠道配置 */
export async function getChannels(password: string): Promise<{
  channels: Array<{ id: PushChannel; name: string; icon: string; enabled: boolean }>;
}> {
  return request(`${BASE}/admin/channels?password=${encodeURIComponent(password)}`);
}

/** 获取订阅列表 */
export async function getSubscriptions(password: string): Promise<{
  total: number;
  subscriptions: PushSubscription[];
}> {
  return request(`${BASE}/admin/subscriptions?password=${encodeURIComponent(password)}`);
}

/** 发送推送 */
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
