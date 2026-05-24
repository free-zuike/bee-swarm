// ============================================
// Web Push 推送服务
// 使用 Web Crypto API 实现 VAPID 签名
// ============================================
import type { Env, PushSubscription, PushPayload, ChannelResult } from '../types';

/**
 * Base64Url 编码
 */
function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const binary = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
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
 * 从 Base64Url 导入 VAPID 私钥
 * 自动检测格式：32字节(raw) 或 PKCS#8
 */
async function importVapidPrivateKey(privateKeyBase64: string, publicKeyBase64: string): Promise<CryptoKey> {
  const privateKeyBytes = base64UrlDecode(privateKeyBase64);
  
  if (privateKeyBytes.length === 32) {
    // 旧格式：32字节 raw 私钥，需要构造 PKCS#8
    const pubKeyBytes = base64UrlDecode(publicKeyBase64);
    
    // PKCS#8 ECDSA P-256 私钥结构（固定前缀 + 私钥 + 公钥）
    const pkcs8 = new Uint8Array([
      0x30, 0x81, 0x87, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86,
      0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d,
      0x03, 0x01, 0x07, 0x04, 0x6d, 0x30, 0x6b, 0x02, 0x01, 0x01, 0x04, 0x20,
      ...privateKeyBytes,
      0xa1, 0x44, 0x03, 0x42, 0x00, 0x04,
      ...pubKeyBytes,
    ]);
    
    return crypto.subtle.importKey(
      'pkcs8',
      pkcs8,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
  } else {
    // 新格式：完整 PKCS#8
    return crypto.subtle.importKey(
      'pkcs8',
      privateKeyBytes,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
  }
}

/**
 * 生成 VAPID JWT
 */
async function generateVapidJWT(
  audience: string,
  subject: string,
  privateKey: string
): Promise<string> {
  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: now + 12 * 60 * 60,
    sub: subject,
  })));
  
  const signingInput = `${header}.${payload}`;
  
  const key = await importVapidPrivateKey(privateKey, publicKey);
  
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput)
  );
  
  return `${header}.${payload}.${base64UrlEncode(signature)}`;
}

/**
 * 发送 Web Push 通知（简化版，先不加密测试 VAPID）
 */
export async function sendWebPush(
  subscription: PushSubscription,
  payload: PushPayload,
  env: Env
): Promise<void> {
  const audience = new URL(subscription.endpoint).origin;
  
  // 生成 VAPID JWT
  const vapidToken = await generateVapidJWT(
    audience,
    'mailto:admin@example.com',
    env.VAPID_PRIVATE_KEY,
    env.VAPID_PUBLIC_KEY
  );
  
  // 发送明文 payload（简化测试）
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${vapidToken}, k=${env.VAPID_PUBLIC_KEY}`,
      'Content-Type': 'application/json',
      'TTL': '86400',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = new Error(`Web Push failed: ${response.status} ${response.statusText}`);
    (error as any).statusCode = response.status;
    throw error;
  }
}

/**
 * 添加订阅
 */
export async function addSubscription(
  subscription: PushSubscription,
  env: Env
): Promise<void> {
  await env.SUBSCRIPTIONS.put(
    `sub:${subscription.endpoint}`,
    JSON.stringify(subscription),
    { expirationTtl: 60 * 60 * 24 * 365 }
  );
}

/**
 * 删除订阅
 */
export async function removeSubscription(
  endpoint: string,
  env: Env
): Promise<void> {
  await env.SUBSCRIPTIONS.delete(`sub:${endpoint}`);
}

/**
 * 获取所有订阅
 */
export async function getAllSubscriptions(env: Env): Promise<PushSubscription[]> {
  const list = await env.SUBSCRIPTIONS.list({ prefix: 'sub:' });
  const subscriptions: PushSubscription[] = [];

  for (const key of list.keys) {
    const data = await env.SUBSCRIPTIONS.get(key.name);
    if (data) subscriptions.push(JSON.parse(data));
  }

  return subscriptions;
}

/**
 * 广播推送
 */
export async function broadcastWebPush(
  payload: PushPayload,
  env: Env
): Promise<ChannelResult> {
  const list = await env.SUBSCRIPTIONS.list({ prefix: 'sub:' });

  if (list.keys.length === 0) {
    return { channel: 'webpush', success: true, message: '没有订阅用户' };
  }

  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const key of list.keys) {
    const data = await env.SUBSCRIPTIONS.get(key.name);
    if (!data) continue;

    try {
      const subscription: PushSubscription = JSON.parse(data);
      await sendWebPush(subscription, payload, env);
      success++;
    } catch (err: any) {
      failed++;
      const errorMsg = err.message || '未知错误';
      errors.push(errorMsg);
      if (err.statusCode === 410 || err.statusCode === 404) {
        await env.SUBSCRIPTIONS.delete(key.name);
      }
    }
  }

  return {
    channel: 'webpush',
    success: failed === 0,
    message: `推送完成: ${success} 成功, ${failed} 失败${errors.length > 0 ? ' - ' + errors.slice(0, 2).join(', ') : ''}`,
  };
}
