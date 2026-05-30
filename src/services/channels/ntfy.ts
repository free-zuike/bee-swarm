import type { ChannelResult } from '../../types';
import { BaseChannel, type ChannelPayload } from './base';

export class NtfyChannel extends BaseChannel {
  protected async testConnection(): Promise<boolean> {
    const topic = this.config.topic;
    if (!topic) return false;

    try {
      const server = this.config.server || 'https://ntfy.sh';
      const url = new URL(`/${topic}`, server);

      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '🔔',
          message: 'Connection Test',
          priority: 'default',
        }),
      });

      return res.ok;
    } catch {
      return false;
    }
  }

  async send(payload: ChannelPayload): Promise<ChannelResult> {
    const topic = this.config.topic;
    if (!topic) {
      return { channel: 'ntfy', success: false, message: '未配置 ntfy Topic' };
    }

    try {
      const server = this.config.server || 'https://ntfy.sh';
      const url = new URL(`/${topic}`, server);

      const body: Record<string, unknown> = {
        title: payload.title,
        message: payload.body || '',
        priority: 'default',
      };

      if (payload.url) {
        body.actions = [{ action: 'view', label: '查看详情', url: payload.url }];
      }

      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        return { channel: 'ntfy', success: true, message: 'ntfy 推送成功' };
      }

      const text = await res.text();
      return {
        channel: 'ntfy',
        success: false,
        message: `ntfy 推送失败: ${res.status} ${text || res.statusText}`,
      };
    } catch (err) {
      return {
        channel: 'ntfy',
        success: false,
        message: `ntfy 推送异常: ${(err as Error).message}`,
      };
    }
  }
}

export async function sendNtfy(
  payload: ChannelPayload,
  config: Record<string, string>
): Promise<ChannelResult> {
  const channel = new NtfyChannel('ntfy', config);
  return channel.sendWithRetry(payload);
}
