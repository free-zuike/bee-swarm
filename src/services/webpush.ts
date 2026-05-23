// ============================================
// Web Push 推送服务
// 使用 Web Crypto API 实现 VAPID 签名和消息加密
// ============================================
import type { Env, PushSubscription, PushPayload, ChannelResult } from '../types';

/**
 * Base64Url 编码
 */
function base64UrlEncode(buffer: ArrayBuffer | string): string {
  const bytes = typeof buffer === 'string' 
    ? new TextEncoder().encode(buffer)
    : new Uint8Array(buffer);
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
 * 从 Base64Url 导入 VAPID 私钥（JWK 格式）
 */
async function importVapidPrivateKey(privateKeyBase64: string, publicKeyBase64: string): Promise<CryptoKey> {
  // 解码私钥（32 字节）
  const privateKeyBytes = base64UrlDecode(privateKeyBase64);
  // 解码公钥（65 字节，uncompressed point format）
  const publicKeyBytes = base64UrlDecode(publicKeyBase64);
  
  // 使用 JWK 格式导入
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: privateKeyBase64,
    x: base64UrlEncode(publicKeyBytes.slice(1, 33)), // 公钥的 x 坐标（跳过 0x04 前缀）
    y: base64UrlEncode(publicKeyBytes.slice(33, 65)), // 公钥的 y 坐标
    ext: true,
  };
  
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
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
  const header = base64UrlEncode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(JSON.stringify({
    aud: audience,
    exp: now + 12 * 60 * 60,
    sub: subject,
  }));
  
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
 * 加密推送消息（使用 Web Push 标准加密）
 */
async function encryptPayload(
  payload: string,
  subscription: PushSubscription
): Promise<{ ciphertext: ArrayBuffer; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  // 解码用户公钥和认证密钥
  const userPublicKey = base64UrlDecode(subscription.keys.p256dh);
  const authSecret = base64UrlDecode(subscription.keys.auth);
  
  // 生成临时 ECDH 密钥对
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  
  // 导入用户公钥
  const userKey = await crypto.subtle.importKey(
    'raw',
    userPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  
  // 派生共享密钥
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: userKey },
    serverKeyPair.privateKey,
    256
  );
  
  // 生成随机 salt
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  // 导出服务器公钥
  const serverPublicKey = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeyPair.publicKey)
  );
  
  // HKDF 密钥派生
  const prk = await crypto.subtle.importKey(
    'raw',
    new Uint8Array([...new Uint8Array(sharedSecret), ...authSecret]),
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );
  
  const ikm = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt,
      info: new TextEncoder().encode('Content-Encoding: aes128gcm\x00')
    },
    prk,
    128
  );
  
  // 使用 AES-GCM 加密
  const contentEncryptionKey = await crypto.subtle.importKey(
    'raw',
    ikm,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  // 添加填充和记录分隔符
  const recordSize = 4096;
  const paddingSize = 0;
  const record = new Uint8Array(2 + paddingSize + payload.length);
  record[0] = (paddingSize >> 8) & 0xff;
  record[1] = paddingSize & 0xff;
  record.set(new TextEncoder().encode(payload), 2 + paddingSize);
  
  // 生成 nonce
  const nonceBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt,
      info: new TextEncoder().encode('Content-Encoding: nonce\x00')
    },
    prk,
    96
  );
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(nonceBits) },
    contentEncryptionKey,
    record
  );
  
  return { ciphertext, salt, serverPublicKey };
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
  
  // 生成 VAPID JWT
  const vapidToken = await generateVapidJWT(
    audience,
    'mailto:admin@example.com',
    env.VAPID_PRIVATE_KEY,
    env.VAPID_PUBLIC_KEY
  );
  
  // 加密 payload
  const payloadStr = JSON.stringify(payload);
  const { ciphertext, salt, serverPublicKey } = await encryptPayload(payloadStr, subscription);
  
  // 构造加密后的 body（aes128gcm 格式）
  const body = new Uint8Array(
    salt.length + 4 + 1 + serverPublicKey.length + ciphertext.byteLength
  );
  let offset = 0;
  body.set(salt, offset); offset += salt.length;
  body[offset++] = (recordSize >> 16) & 0xff;
  body[offset++] = (recordSize >> 8) & 0xff;
  body[offset++] = recordSize & 0xff;
  body[offset++] = 0; // key ID length
  body.set(serverPublicKey, offset); offset += serverPublicKey.length;
  body.set(new Uint8Array(ciphertext), offset);
  
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${vapidToken}, k=${env.VAPID_PUBLIC_KEY}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
    },
    body,
  });

  if (!response.ok) {
    const error = new Error(`Web Push failed: ${response.status} ${response.statusText}`);
    (error as any).statusCode = response.status;
    throw error;
  }
}

const recordSize = 4096;

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
      console.error('Web Push failed:', errorMsg, err);
      if (err.statusCode === 410 || err.statusCode === 404) {
        await env.SUBSCRIPTIONS.delete(key.name);
      }
    }
  }

  return {
    channel: 'webpush',
    success: failed === 0,
    message: `推送完成: ${success} 成功, ${failed} 失败${errors.length > 0 ? ' - ' + errors.join(', ') : ''}`,
  };
}
