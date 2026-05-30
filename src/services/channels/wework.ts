import type { ChannelResult } from '../../types';
import { BaseChannel, type ChannelPayload } from './base';

export class WeworkChannel extends BaseChannel {
  protected async testConnection(): Promise<boolean> {
    const webhookUrl = this.config.webhook_url;
    if (!webhookUrl) return false;

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'text',
          text: { content: '🔔 Connection Test' },
        }),
      });

      const text = await res.text();
      try {
        const data = JSON.parse(text) as { errcode: number };
        return data.errcode === 0;
      } catch {
        return res.ok;
      }
    } catch {
      return false;
    }
  }

  async send(payload: ChannelPayload): Promise<ChannelResult> {
    const webhookUrl = this.config.webhook_url;
    if (!webhookUrl) {
      return { channel: 'wework', success: false, message: '未配置企业微信 Webhook URL' };
    }

    try {
      const content = [
        `## ${payload.title}`,
        payload.body || '',
        payload.url ? `[查看详情](${payload.url})` : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'markdown',
          markdown: { content },
        }),
      });

      const text = await res.text();
      let errcode = -1;
      let errmsg = text;

      try {
        const data = JSON.parse(text) as { errcode: number; errmsg: string };
        errcode = data.errcode;
        errmsg = data.errmsg;
      } catch {
        // 非 JSON 响应
      }

      if (errcode === 0) {
        return { channel: 'wework', success: true, message: '企业微信推送成功' };
      }

      return { channel: 'wework', success: false, message: `企业微信推送失败: ${errmsg}` };
    } catch (err) {
      return {
        channel: 'wework',
        success: false,
        message: `企业微信推送异常: ${(err as Error).message}`,
      };
    }
  }
}

export async function sendWework(
  payload: ChannelPayload,
  config: Record<string, string>
): Promise<ChannelResult> {
  const channel = new WeworkChannel('wework', config);
  return channel.sendWithRetry(payload);
}
