// ============================================
// Web Push 推送服务
// 使用 web-push 库（自动处理 VAPID 签名和消息加密）
// ============================================
import webpush from 'web-push';
import type { Env, PushSubscription, PushPayload, ChannelResult } from '../types';

/**
 * 发送 Web Push 通知
 */
export async function sendWebPush(
  subscription: PushSubscription,
  payload: PushPayload,
  env: Env
): Promise<void> {
  // 设置 VAPID 密钥
  webpush.setVapidDetails(
    'mailto:admin@example.com',
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  );

  await webpush.sendNotification(subscription, JSON.stringify(payload));
}

export async function addSubscription(subscription: PushSubscription, env: Env): Promise<void> {
  await env.SUBSCRIPTIONS.put(`sub:${subscription.endpoint}`, JSON.stringify(subscription), { expirationTtl: 60 * 60 * 24 * 365 });
}

export async function removeSubscription(endpoint: string, env: Env): Promise<void> {
  await env.SUBSCRIPTIONS.delete(`sub:${endpoint}`);
}

export async function getAllSubscriptions(env: Env): Promise<PushSubscription[]> {
  const list = await env.SUBSCRIPTIONS.list({ prefix: 'sub:' });
  const subs: PushSubscription[] = [];
  for (const key of list.keys) {
    const data = await env.SUBSCRIPTIONS.get(key.name);
    if (data) subs.push(JSON.parse(data));
  }
  return subs;
}

export async function broadcastWebPush(payload: PushPayload, env: Env): Promise<ChannelResult> {
  const list = await env.SUBSCRIPTIONS.list({ prefix: 'sub:' });
  if (list.keys.length === 0) return { channel: 'webpush', success: true, message: '没有订阅用户' };

  // 设置 VAPID 密钥
  webpush.setVapidDetails(
    'mailto:admin@example.com',
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  );

  let success = 0, failed = 0;
  const errors: string[] = [];

  for (const key of list.keys) {
    const data = await env.SUBSCRIPTIONS.get(key.name);
    if (!data) continue;
    try {
      await webpush.sendNotification(JSON.parse(data), JSON.stringify(payload));
      success++;
    } catch (err: any) {
      failed++;
      errors.push(err.message || err.statusCode ? `${err.statusCode} ${err.body}` : '未知错误');
      // 410/404 表示订阅已失效，自动清理
      if (err.statusCode === 410 || err.statusCode === 404) {
        await env.SUBSCRIPTIONS.delete(key.name);
      }
    }
  }

  return {
    channel: 'webpush',
    success: failed === 0,
    message: `推送完成: ${success} 成功, ${failed} 失败${errors.length ? ' - ' + errors.slice(0, 2).join(', ') : ''}`,
  };
}
