// ============================================
// Web Push 推送服务
// 基于 web-push 库，通过浏览器 Service Worker 接收推送
// ============================================
import webPush from 'web-push';
import type { Env, PushSubscription, PushPayload, ChannelResult } from '../types';

/**
 * 发送 Web Push 通知到单个订阅者
 *
 * @param subscription - 浏览器推送订阅对象
 * @param payload      - 推送消息内容
 * @param env          - Workers 环境变量
 */
export async function sendWebPush(
  subscription: PushSubscription,
  payload: PushPayload,
  env: Env
): Promise<void> {
  // 配置 VAPID 身份信息（用于推送服务器验证发送者身份）
  webPush.setVapidDetails(
    'mailto:admin@example.com',
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  );

  // 发送推送通知，payload 会传递给 Service Worker
  await webPush.sendNotification(subscription, JSON.stringify(payload), {
    TTL: 24 * 60 * 60,   // 消息存活时间 24 小时
    urgency: 'normal',    // 普通优先级
  });
}

/**
 * 将新订阅保存到 KV
 *
 * @param subscription - 浏览器推送订阅对象
 * @param env          - Workers 环境变量
 */
export async function addSubscription(
  subscription: PushSubscription,
  env: Env
): Promise<void> {
  // 使用 endpoint 作为唯一键，存储订阅对象
  await env.SUBSCRIPTIONS.put(
    `sub:${subscription.endpoint}`,
    JSON.stringify(subscription),
    { expirationTtl: 60 * 60 * 24 * 365 } // 1 年后自动过期
  );

  // 更新订阅计数
  const count = parseInt(await env.SUBSCRIPTIONS.get('meta:count') || '0', 10);
  await env.SUBSCRIPTIONS.put('meta:count', String(count + 1));
}

/**
 * 删除订阅
 *
 * @param endpoint - 订阅端点 URL
 * @param env      - Workers 环境变量
 */
export async function removeSubscription(
  endpoint: string,
  env: Env
): Promise<void> {
  await env.SUBSCRIPTIONS.delete(`sub:${endpoint}`);

  const count = parseInt(await env.SUBSCRIPTIONS.get('meta:count') || '0', 10);
  await env.SUBSCRIPTIONS.put('meta:count', String(Math.max(0, count - 1)));
}

/**
 * 获取所有有效订阅
 *
 * @param env - Workers 环境变量
 * @returns 订阅列表
 */
export async function getAllSubscriptions(env: Env): Promise<PushSubscription[]> {
  const list = await env.SUBSCRIPTIONS.list({ prefix: 'sub:' });
  const subscriptions: PushSubscription[] = [];

  for (const key of list.keys) {
    const data = await env.SUBSCRIPTIONS.get(key.name);
    if (data) {
      subscriptions.push(JSON.parse(data));
    }
  }

  return subscriptions;
}

/**
 * 向所有 Web Push 订阅者广播消息
 * 自动清理失效的订阅（410/404）
 *
 * @param payload - 推送消息内容
 * @param env     - Workers 环境变量
 * @returns 推送结果（成功数、失败数、错误详情）
 */
export async function broadcastWebPush(
  payload: PushPayload,
  env: Env
): Promise<ChannelResult> {
  const list = await env.SUBSCRIPTIONS.list({ prefix: 'sub:' });

  // 如果没有订阅者，直接返回
  if (list.keys.length === 0) {
    return {
      channel: 'webpush',
      success: true,
      message: '没有订阅用户',
    };
  }

  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  // 遍历所有订阅，逐个发送
  for (const key of list.keys) {
    const data = await env.SUBSCRIPTIONS.get(key.name);
    if (!data) continue;

    try {
      const subscription: PushSubscription = JSON.parse(data);
      await sendWebPush(subscription, payload, env);
      success++;
    } catch (err: any) {
      failed++;
      // 订阅已失效（用户卸载或清除数据），自动清理
      if (err.statusCode === 410 || err.statusCode === 404) {
        await env.SUBSCRIPTIONS.delete(key.name);
        errors.push(`已清理失效订阅`);
      } else {
        errors.push(err.message);
      }
    }
  }

  // 清理后更新订阅计数
  const newList = await env.SUBSCRIPTIONS.list({ prefix: 'sub:' });
  await env.SUBSCRIPTIONS.put('meta:count', String(newList.keys.length));

  const msg = failed > 0
    ? `推送完成: ${success} 成功, ${failed} 失败`
    : `推送成功: ${success} 条`;

  return {
    channel: 'webpush',
    success: failed === 0,
    message: msg,
  };
}
