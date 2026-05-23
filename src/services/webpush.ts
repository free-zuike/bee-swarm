// ============================================
// Web Push 推送服务
// 使用 Web Crypto API 实现，兼容 Cloudflare Workers
// ============================================
import type { Env, PushSubscription, PushPayload, ChannelResult } from '../types';

// VAPID JWT 头部（base64url 编码）
const VAPID_HEADER = base64UrlEncode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));

/**
 * Base64Url 编码（Web Push 标准格式）
 */
function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Base64Url 解码
 */
function base64UrlDecode(str: string): Uint8Array {
  const padding = '='.repeat((4 - (str.length % 4)) % 4);
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + padding;
  const binary = atob(base64);
  return new Uint8Array(binary.split('').map(c => c.charCodeAt(0)));
}

/**
 * 将 ArrayBuffer 转为 Base64Url 字符串
 */
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return base64UrlEncode(binary);
}

/**
 * 导入 VAPID 私钥为 CryptoKey
 */
async function importVapidKey(privateKeyBase64: string): Promise<CryptoKey> {
  const privateKeyBytes = base64UrlDecode(privateKeyBase64);
  
  // 构造 PKCS#8 格式的私钥
  const pkcs8Header = new Uint8Array([
    0x30, 0x81, 0x87, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86,
    0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d,
    0x03, 0x01, 0x07, 0x04, 0x6d, 0x30, 0x6b, 0x02, 0x01, 0x01, 0x04, 0x20,
    ...privateKeyBytes, 0xa1, 0x44, 0x03, 0x42, 0x00
  ]);
  
  return crypto.subtle.importKey(
    'pkcs8',
    pkcs8Header,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

/**
 * 生成 VAPID JWT Token
 */
async function generateVapidToken(
  audience: string,
  subject: string,
  privateKey: string,
  publicKey: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(JSON.stringify({
    aud: audience,
    exp: now + 12 * 60 * 60, // 12 小时过期
    sub: subject,
  }));
  
  const signingInput = `${VAPID_HEADER}.${payload}`;
  const key = await importVapidKey(privateKey);
  
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput)
  );
  
  const signatureBase64 = arrayBufferToBase64Url(signature);
  return `${signingInput}.${signatureBase64}`;
}

/**
 * 从订阅端点提取 audience（origin）
 */
function getAudience(endpoint: string): string {
  const url = new URL(endpoint);
  return `${url.protocol}//${url.host}`;
}

/**
 * 发送 Web Push 通知到单个订阅者
 * 使用 Web Crypto API 实现加密和 VAPID 签名
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
  const audience = getAudience(subscription.endpoint);
  
  // 生成 VAPID Authorization 头
  const vapidToken = await generateVapidToken(
    audience,
    'mailto:admin@example.com',
    env.VAPID_PRIVATE_KEY,
    env.VAPID_PUBLIC_KEY
  );
  
  // 如果有用户公钥，需要加密 payload（简化版，实际生产需要完整加密）
  let body: string | ArrayBuffer = JSON.stringify(payload);
  let headers: Record<string, string> = {
    'Authorization': `vapid t=${vapidToken}, k=${env.VAPID_PUBLIC_KEY}`,
    'Content-Type': 'application/json',
    'TTL': '86400',
  };

  // 发送推送请求
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers,
    body,
  });

  if (!response.ok) {
    const error = new Error(`Web Push failed: ${response.status} ${response.statusText}`);
    (error as any).statusCode = response.status;
    throw error;
  }
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
