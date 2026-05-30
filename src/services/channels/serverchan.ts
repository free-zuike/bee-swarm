import type { ChannelResult } from '../../types';
import { BaseChannel, type ChannelPayload } from './base';

export class ServerchanChannel extends BaseChannel {
  protected async testConnection(): Promise<boolean> {
    const key = this.config.key;
    if (!key) return false;

    try {
      const server = this.config.server || 'https://sctapi.ftqq.com';
      const url = `${server}/${key}.send?title=Connection%20Test`;

      const res = await fetch(url);
      const data = (await res.json()) as { code: number; data?: { error?: string } };

      if (data.code === 0) return true;
      if (data.data?.error === 'success') return true;
      return false;
    } catch {
      return false;
    }
  }

  async send(payload: ChannelPayload): Promise<ChannelResult> {
    const key = this.config.key;
    if (!key) {
      return { channel: 'serverchan', success: false, message: '未配置 Server酱 Key' };
    }

    try {
      const server = this.config.server || 'https://sctapi.ftqq.com';
      const url = `${server}/${key}.send`;

      const content = payload.body || '';
      const title = payload.title;
      const desp = payload.url ? `\n\n🔗 ${payload.url}` : '';

      const body = new URLSearchParams();
      body.set('title', title);
      body.set('desp', content + desp);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      const data = (await res.json()) as {
        code: number;
        message?: string;
        data?: { error?: string };
      };

      if (data.code === 0 || data.data?.error === 'success') {
        return { channel: 'serverchan', success: true, message: 'Server酱 推送成功' };
      }

      return {
        channel: 'serverchan',
        success: false,
        message: `Server酱 推送失败: ${data.message || '未知错误'}`,
      };
    } catch (err) {
      return {
        channel: 'serverchan',
        success: false,
        message: `Server酱 推送异常: ${(err as Error).message}`,
      };
    }
  }
}

export async function sendServerchan(
  payload: ChannelPayload,
  config: Record<string, string>
): Promise<ChannelResult> {
  const channel = new ServerchanChannel('serverchan', config);
  return channel.sendWithRetry(payload);
}
