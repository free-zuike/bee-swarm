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

  private getErrorMessage(code: number, data?: { error?: string }): string {
    const errorMessages: Record<number, string> = {
      400: '请求参数错误',
      401: 'SendKey 无效',
      403: '接口调用被拒绝',
      404: 'SendKey 不存在',
      429: '推送频率超限，请稍后重试',
      500: 'Server酱 服务器错误',
      550: '该通道消息发送功能被禁用',
      552: '群发消息超过限制',
      553: '该消息被判定为无效',
    };
    return errorMessages[code] || data?.error || `未知错误 (code: ${code})`;
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
        message: `Server酱 推送失败: ${this.getErrorMessage(data.code, data.data)}`,
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
