import type { ChannelResult } from '../../types';
import { BaseChannel, type ChannelPayload } from './base';

export interface WebPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface VAPIDKeys {
  publicKey: string;
  privateKey: string;
}

export class WebPushChannel extends BaseChannel {
  private vapidKeys: VAPIDKeys | null = null;

  constructor(id: string, config: Record<string, string>, vapidKeys?: VAPIDKeys) {
    super(id, config);
    if (vapidKeys) {
      this.vapidKeys = vapidKeys;
    }
  }

  protected async testConnection(): Promise<boolean> {
    const subscription = this.getSubscription();
    if (!subscription || !this.vapidKeys) return false;
    return true;
  }

  private getSubscription(): WebPushSubscription | null {
    const endpoint = this.config.endpoint;
    const p256dh = this.config.p256dh;
    const auth = this.config.auth;

    if (!endpoint || !p256dh || !auth) return null;

    return {
      endpoint,
      keys: { p256dh, auth },
    };
  }

  async send(payload: ChannelPayload): Promise<ChannelResult> {
    const subscription = this.getSubscription();
    if (!subscription) {
      return { channel: 'webpush', success: false, message: 'Subscription not configured' };
    }

    if (!this.vapidKeys) {
      return { channel: 'webpush', success: false, message: 'VAPID keys not configured' };
    }

    try {
      const res = await this.sendPushNotification(subscription, payload);
      if (res.ok) {
        return { channel: 'webpush', success: true, message: 'Push notification sent' };
      }

      if (res.status === 404 || res.status === 410) {
        return {
          channel: 'webpush',
          success: false,
          message: 'Subscription expired, please re-subscribe',
        };
      }

      return { channel: 'webpush', success: false, message: `Push failed: ${res.status}` };
    } catch (err) {
      return { channel: 'webpush', success: false, message: (err as Error).message };
    }
  }

  private async sendPushNotification(
    subscription: WebPushSubscription,
    payload: ChannelPayload
  ): Promise<Response> {
    const pushData = JSON.stringify({
      title: payload.title,
      body: payload.body || '',
      url: payload.url || '/',
      icon: payload.imageUrl || '/icon.png',
      badge: '/badge.png',
      tag: 'bee-swarm-notification',
      requireInteraction: false,
      silent: false,
    });

    const vapidToken = await this.getVapidToken(subscription);
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `vapid t=${vapidToken}, k=${this.vapidKeys!.publicKey}`,
        'Content-Length': pushData.length.toString(),
        TTL: '86400',
      },
      body: pushData,
    });

    return response;
  }

  private async getVapidToken(subscription: WebPushSubscription): Promise<string> {
    const audience = new URL(subscription.endpoint).origin;
    const now = Math.floor(Date.now() / 1000);

    const protectedHeader = btoa(JSON.stringify({ alg: 'ES256', typ: 'JWT' }));
    const jwtPayload = btoa(
      JSON.stringify({
        aud: audience,
        exp: now + 86400,
        sub: audience,
      })
    );

    const signingInput = `${protectedHeader}.${jwtPayload}`;
    const privateKey = this.urlBase64Decode(this.vapidKeys!.privateKey);

    // 使用 ECDSA P-256 进行真正的签名
    const keyPair = await this.importPrivateKey(privateKey);
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      keyPair,
      new TextEncoder().encode(signingInput)
    );

    // 将 ASN.1 格式的 ECDSA 签名转换为 ES256 固定长度 (r || s) 格式
    const rawSignature = this.ecdsaAsn1ToRaw(new Uint8Array(signature));

    return `${signingInput}.${this.binaryToBase64(rawSignature)}`;
  }

  /**
   * 将原始 32 字节私钥导入为 ECDSA P-256 CryptoKey
   */
  private async importPrivateKey(rawKey: Uint8Array): Promise<CryptoKey> {
    // 使用 JWK 格式导入 EC P-256 私钥
    const jwk: JsonWebKey = {
      kty: 'EC',
      crv: 'P-256',
      d: this.urlBase64EncodePrivate(rawKey),
      ext: true,
    };

    return crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign']
    );
  }

  /**
   * 将原始私钥转换为 JWK d 参数（URL-safe Base64）
   */
  private urlBase64EncodePrivate(rawKey: Uint8Array): string {
    const base64 = this.binaryToBase64(rawKey);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private binaryToBase64(buffer: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < buffer.length; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary);
  }

  /**
   * 将 ASN.1 DER 编码的 ECDSA 签名转换为 ES256 原始格式 (64 字节 r||s)
   */
  private ecdsaAsn1ToRaw(der: Uint8Array): Uint8Array {
    // ASN.1 SEQUENCE
    if (der[0] !== 0x30) throw new Error('Invalid ASN.1 signature');
    let offset = 2; // skip SEQUENCE tag + length

    // r INTEGER
    if (der[offset] !== 0x02) throw new Error('Invalid ASN.1 r');
    const rLen = der[offset + 1];
    const rStart = offset + 2;
    const rEnd = rStart + rLen;

    // 跳过前导 0x00（如果存在）
    const r = der.subarray(rStart, rEnd);
    const rPadded = r.length === 32 ? r : (r[0] === 0x00 ? r.subarray(1) : r);

    offset = rEnd;

    // s INTEGER
    if (der[offset] !== 0x02) throw new Error('Invalid ASN.1 s');
    const sLen = der[offset + 1];
    const sStart = offset + 2;
    const sEnd = sStart + sLen;

    const s = der.subarray(sStart, sEnd);
    const sPadded = s.length === 32 ? s : (s[0] === 0x00 ? s.subarray(1) : s);

    // 补齐到 32 字节
    const result = new Uint8Array(64);
    result.set(rPadded, 32 - rPadded.length);
    result.set(sPadded, 64 - sPadded.length);
    return result;
  }

  private urlBase64Decode(str: string): Uint8Array {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded = atob(base64 + padding);
    const buffer = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      buffer[i] = decoded.charCodeAt(i);
    }
    return buffer;
  }
}

export async function sendWebPush(
  subscription: WebPushSubscription,
  payload: ChannelPayload,
  vapidKeys: VAPIDKeys
): Promise<ChannelResult> {
  const channel = new WebPushChannel(
    'webpush',
    {
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    vapidKeys
  );
  return channel.sendWithRetry(payload);
}

/**
 * 生成 ECDSA P-256 VAPID 密钥对
 * 返回 URL-safe Base64 编码的公钥和私钥
 */
export async function generateVAPIDKeys(): Promise<VAPIDKeys> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  // 导出私钥为原始 32 字节
  const privateKeyRaw = await crypto.subtle.exportKey('raw', keyPair.privateKey);
  // 导出公钥为未压缩格式（65 字节：0x04 || x || y），去掉 0x04 前缀得到 64 字节
  const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);

  return {
    publicKey: urlBase64Encode(new Uint8Array(publicKeyRaw).subarray(1)),
    privateKey: urlBase64Encode(new Uint8Array(privateKeyRaw)),
  };
}

function urlBase64Encode(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
