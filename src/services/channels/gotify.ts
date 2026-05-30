import type { ChannelResult } from '../../types';
import { BaseChannel, type ChannelPayload } from './base';

export class GotifyChannel extends BaseChannel {
  protected async testConnection(): Promise<boolean> {
    const server = this.config.server;
    const token = this.config.token;
    if (!server || !token) return false;

    try {
      const url = new URL('/application', server);
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'X-Gotify-Key': token },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async send(payload: ChannelPayload): Promise<ChannelResult> {
    const server = this.config.server;
    const token = this.config.token;

    if (!server || !token) {
      return { channel: 'gotify', success: false, message: '未配置 Gotify Server 或 Token' };
    }

    try {
      const url = new URL('/message', server);

      const body: Record<string, unknown> = {
        title: payload.title,
        message: payload.body || '',
        priority: parseInt(this.config.priority || '5', 10),
      };

      if (payload.url) {
        body.extras = {
          'client::notification': {
            click: { url: payload.url },
          },
        };
      }

      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gotify-Key': token,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        return { channel: 'gotify', success: true, message: 'Gotify 推送成功' };
      }

      const text = await res.text();
      return {
        channel: 'gotify',
        success: false,
        message: `Gotify 推送失败: ${res.status} ${text || res.statusText}`,
      };
    } catch (err) {
      return {
        channel: 'gotify',
        success: false,
        message: `Gotify 推送异常: ${(err as Error).message}`,
      };
    }
  }
}

export async function sendGotify(
  payload: ChannelPayload,
  config: Record<string, string>
): Promise<ChannelResult> {
  const channel = new GotifyChannel('gotify', config);
  return channel.sendWithRetry(payload);
}
