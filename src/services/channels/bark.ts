import type { ChannelResult } from '../../types';
import { BaseChannel, type ChannelPayload } from './base';

export class BarkChannel extends BaseChannel {
  protected async testConnection(): Promise<boolean> {
    const key = this.config.key;
    if (!key) return false;

    try {
      const server = this.config.server || 'https://api.day.app';
      const url = new URL(`${server}/${key}/Connection%20Test`);

      const res = await fetch(url.toString());
      const data = (await res.json()) as { code: number };
      return data.code === 200;
    } catch {
      return false;
    }
  }

  async send(payload: ChannelPayload): Promise<ChannelResult> {
    const key = this.config.key;
    if (!key) {
      return { channel: 'bark', success: false, message: '未配置 Bark Key' };
    }

    try {
      const server = this.config.server || 'https://api.day.app';
      const url = new URL(`${server}/${key}/${encodeURIComponent(payload.title)}`);

      if (payload.body) {
        url.searchParams.set('body', payload.body);
      }
      if (payload.url) {
        url.searchParams.set('url', payload.url);
      }
      if (payload.icon) {
        url.searchParams.set('icon', payload.icon);
      }

      const res = await fetch(url.toString());
      const data = (await res.json()) as { code: number; message: string };

      if (data.code === 200) {
        return { channel: 'bark', success: true, message: 'Bark 推送成功' };
      }

      return { channel: 'bark', success: false, message: `Bark 推送失败: ${data.message}` };
    } catch (err) {
      return {
        channel: 'bark',
        success: false,
        message: `Bark 推送异常: ${(err as Error).message}`,
      };
    }
  }
}

export async function sendBark(
  payload: ChannelPayload,
  config: Record<string, string>
): Promise<ChannelResult> {
  const channel = new BarkChannel('bark', config);
  return channel.sendWithRetry(payload);
}
