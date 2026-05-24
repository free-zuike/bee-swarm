// ============================================
// Web Push 推送服务
// 使用 jose 库处理 VAPID JWT 签名（JWK 格式密钥）
// ============================================
import { SignJWT, importJWK } from 'jose';
import type { Env, PushSubscription, PushPayload, ChannelResult } from '../types';

/**
 * 导入 VAPID 私钥（JWK 格式）
 * 支持两种格式：
 * 1. JWK JSON 字符串: {"kty":"EC","crv":"P-256","d":"...","x":"...","y":"..."}
 * 2. 旧格式 raw base64url（32字节私钥 + 65字节公钥）
 */
async function importVapidKey(privateKey: string, publicKey: string) {
  // 尝试解析为 JWK JSON
  if (privateKey.startsWith('{')) {
    return importJWK(JSON.parse(privateKey), 'ES256');
  }

  // 旧格式：raw base64url
  const privRaw = b64urlToBytes(privateKey);
  if (privRaw.length === 32) {
    const pubRaw = b64urlToBytes(publicKey);
    const toB64url = (bytes: Uint8Array) =>
      btoa(Array.from(bytes).map(b => String.fromCharCode(b)).join(''))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return importJWK({
      kty: 'EC',
      crv: 'P-256',
      d: privateKey,
      x: toB64url(pubRaw.slice(1, 33)),
      y: toB64url(pubRaw.slice(33, 65)),
    }, 'ES256');
  }

  throw new Error(`Unsupported private key format (length: ${privRaw.length})`);
}

function b64urlToBytes(str: string): Uint8Array {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  return new Uint8Array(bin.split('').map(c => c.charCodeAt(0)));
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
 * 将公钥转为 base64url 格式（uncompressed point: 04 + x + y）
 * 支持两种输入：
 * 1. JWK JSON: {"kty":"EC","crv":"P-256","x":"...","y":"..."}
 * 2. 已是 base64url 格式（直接返回）
 */
function publicKeyToBase64Url(publicKey: string): string {
  if (publicKey.startsWith('{')) {
    const jwk = JSON.parse(publicKey);
    const x = b64urlToBytes(jwk.x);
    const y = b64urlToBytes(jwk.y);
    const uncompressed = new Uint8Array([0x04, ...x, ...y]);
    return bytesToB64url(uncompressed);
  }
  return publicKey; // 已是 base64url 格式
}

function bytesToB64url(bytes: Uint8Array): string {
  return btoa(Array.from(bytes).map(b => String.fromCharCode(b)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
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

  // k= 参数需要 base64url 格式的公钥
  const publicKeyB64url = publicKeyToBase64Url(env.VAPID_PUBLIC_KEY);

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${vapidToken}, k=${publicKeyB64url}`,
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

  let success = 0, failed = 0;
  const errors: string[] = [];

  for (const key of list.keys) {
    const data = await env.SUBSCRIPTIONS.get(key.name);
    if (!data) continue;
    try {
      await sendWebPush(JSON.parse(data), payload, env);
      success++;
    } catch (err: any) {
      failed++;
      errors.push(err.message || '未知错误');
      if (err.statusCode === 410 || err.statusCode === 404) await env.SUBSCRIPTIONS.delete(key.name);
    }
  }

  return {
    channel: 'webpush',
    success: failed === 0,
    message: `推送完成: ${success} 成功, ${failed} 失败${errors.length ? ' - ' + errors.slice(0, 2).join(', ') : ''}`,
  };
}
