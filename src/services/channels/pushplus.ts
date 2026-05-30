import type { ChannelResult } from '../../types';
import { BaseChannel, type ChannelPayload } from './base';

export class PushplusChannel extends BaseChannel {
  protected async testConnection(): Promise<boolean> {
    const token = this.config.token;
    if (!token) return false;

    try {
      const url = 'https://www.pushplus.plus/send';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          title: 'Connection Test',
          content: '这是一条测试消息',
        }),
      });

      const data = (await res.json()) as { code: number };
      return data.code === 200;
    } catch {
      return false;
    }
  }

  async send(payload: ChannelPayload): Promise<ChannelResult> {
    const token = this.config.token;
    if (!token) {
      return { channel: 'pushplus', success: false, message: '未配置 PushPlus Token' };
    }

    try {
      const url = 'https://www.pushplus.plus/send';

      const content = payload.body || '';
      const link = payload.url ? `\n\n🔗 [点击查看](${payload.url})` : '';

      const body = {
        token,
        title: payload.title,
        content: content + link,
        template: 'txt',
      };

      if (this.config.topic) {
        body.token = this.config.token;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as { code: number; msg?: string };

      if (data.code === 200) {
        return { channel: 'pushplus', success: true, message: 'PushPlus 推送成功' };
      }

      return {
        channel: 'pushplus',
        success: false,
        message: `PushPlus 推送失败: ${data.msg || '未知错误'}`,
      };
    } catch (err) {
      return {
        channel: 'pushplus',
        success: false,
        message: `PushPlus 推送异常: ${(err as Error).message}`,
      };
    }
  }
}

export async function sendPushplus(
  payload: ChannelPayload,
  config: Record<string, string>
): Promise<ChannelResult> {
  const channel = new PushplusChannel('pushplus', config);
  return channel.sendWithRetry(payload);
}
