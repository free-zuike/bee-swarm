// ============================================
// Web Push 推送服务
// 使用 jose 库处理 VAPID JWT 签名
// ============================================
import { SignJWT, importPKCS8, importJWK } from 'jose';
import type { Env, PushSubscription, PushPayload, ChannelResult } from '../types';

/** Base64Url → Uint8Array */
function b64urlToBytes(str: string): Uint8Array {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  return new Uint8Array(bin.split('').map(c => c.charCodeAt(0)));
}

/** Base64Url → standard Base64 */
function b64urlToB64(str: string): string {
  return str.replace(/-/g, '+').replace(/_/g, '/');
}

/**
 * 导入 VAPID 私钥
 * 支持 PKCS#8 格式（jose 标准）和 raw 32 字节格式
 */
async function importVapidKey(privateKeyB64url: string, publicKeyB64url: string) {
  const raw = b64urlToBytes(privateKeyB64url);

  if (raw.length === 32) {
    // raw 32 字节私钥 → 构造 JWK
    const pubRaw = b64urlToBytes(publicKeyB64url);
    if (pubRaw.length !== 65 || pubRaw[0] !== 0x04) {
      throw new Error('Invalid public key format');
    }
    // 提取 x, y 坐标并编码为 base64url
    const xBytes = pubRaw.slice(1, 33);
    const yBytes = pubRaw.slice(33, 65);
    const toB64url = (bytes: Uint8Array) => btoa(Array.from(bytes).map(b => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    return importJWK({
      kty: 'EC',
      crv: 'P-256',
      d: privateKeyB64url,
      x: toB64url(xBytes),
      y: toB64url(yBytes),
    }, 'ES256');
  } else {
    // PKCS#8 格式
    return importPKCS8(b64urlToB64(privateKeyB64url), 'ES256');
  }
}

/**
 * 生成 VAPID JWT
 */
async function generateVapidJWT(
  audience: string,
  subject: string,
  privateKey: string,
  publicKey: string
): Promise<string> {
  const key = await importVapidKey(privateKey, publicKey);

  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', typ: 'JWT' })
    .setIssuedAt()
    .setSubject(subject)
    .setAudience(audience)
    .setExpirationTime('12h')
    .sign(key);
}

/**
 * 发送 Web Push 通知
 */
export async function sendWebPush(
  subscription: PushSubscription,
  payload: PushPayload,
  env: Env
): Promise<void> {
  const audience = new URL(subscription.endpoint).origin;

  const vapidToken = await generateVapidJWT(
    audience,
    'mailto:admin@example.com',
    env.VAPID_PRIVATE_KEY,
    env.VAPID_PUBLIC_KEY
  );

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
