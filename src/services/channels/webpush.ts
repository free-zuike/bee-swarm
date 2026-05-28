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

    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `vapid t=${this.getVapidToken(subscription)}, k=${this.vapidKeys!.publicKey}`,
        'Content-Length': pushData.length.toString(),
        TTL: '86400',
      },
      body: pushData,
    });

    return response;
  }

  private getVapidToken(subscription: WebPushSubscription): string {
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
    const key = this.urlBase64Decode(this.vapidKeys!.privateKey);

    return `${signingInput}.${btoa(String.fromCharCode(...new Uint8Array(key)))}`;
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

export function generateVAPIDKeys(): VAPIDKeys {
  return {
    publicKey: crypto.randomUUID().replace(/-/g, ''),
    privateKey: crypto.randomUUID().replace(/-/g, ''),
  };
}
