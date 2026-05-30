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

  private getErrorMessage(code: number, msg?: string): string {
    const errorMessages: Record<number, string> = {
      400: '请求参数错误',
      401: 'Token 无效',
      403: '接口调用被拒绝',
      404: 'Token 不存在',
      429: '请求过于频繁，请稍后重试',
      500: 'PushPlus 服务器错误',
      600: '通道不支持该模板',
      601: '模板不存在',
      700: '积分不足',
    };
    return errorMessages[code] || msg || `未知错误 (code: ${code})`;
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
        message: `PushPlus 推送失败: ${this.getErrorMessage(data.code, data.msg)}`,
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
