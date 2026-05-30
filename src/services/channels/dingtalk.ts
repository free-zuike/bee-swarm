import type { ChannelResult } from '../../types';
import { BaseChannel, type ChannelPayload } from './base';

export class DingtalkChannel extends BaseChannel {
  protected async testConnection(): Promise<boolean> {
    const webhookUrl = this.config.webhook_url;
    if (!webhookUrl) return false;

    try {
      let url = webhookUrl;
      if (this.config.secret) {
        const { timestamp, sign } = await this.generateSign(this.config.secret);
        url += `&timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'text',
          text: { content: '🔔 Connection Test' },
        }),
      });

      const data = (await res.json()) as { errcode: number };
      return data.errcode === 0;
    } catch {
      return false;
    }
  }

  async send(payload: ChannelPayload): Promise<ChannelResult> {
    const webhookUrl = this.config.webhook_url;
    if (!webhookUrl) {
      return { channel: 'dingtalk', success: false, message: '未配置钉钉 Webhook URL' };
    }

    try {
      let url = webhookUrl;
      if (this.config.secret) {
        const { timestamp, sign } = await this.generateSign(this.config.secret);
        url += `&timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
      }

      const text = [
        `### ${payload.title}`,
        payload.body || '',
        payload.url ? `[查看详情](${payload.url})` : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'markdown',
          markdown: { title: payload.title, text },
        }),
      });

      const data = (await res.json()) as { errcode: number; errmsg: string };

      if (data.errcode === 0) {
        return { channel: 'dingtalk', success: true, message: '钉钉推送成功' };
      }

      return { channel: 'dingtalk', success: false, message: `钉钉推送失败: ${data.errmsg}` };
    } catch (err) {
      return {
        channel: 'dingtalk',
        success: false,
        message: `钉钉推送异常: ${(err as Error).message}`,
      };
    }
  }

  private async generateSign(secret: string): Promise<{ timestamp: string; sign: string }> {
    const timestamp = String(Date.now());
    const encoder = new TextEncoder();
    const signData = encoder.encode(timestamp + '\n' + secret);

    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, signData);
    const sign = btoa(String.fromCharCode(...new Uint8Array(signature)));
    return { timestamp, sign };
  }
}

export async function sendDingtalk(
  payload: ChannelPayload,
  config: Record<string, string>
): Promise<ChannelResult> {
  const channel = new DingtalkChannel('dingtalk', config);
  return channel.sendWithRetry(payload);
}
