import type { ChannelResult } from '../../types';
import { BaseChannel, type ChannelPayload } from './base';

interface FeishuContentItem {
  tag: string;
  text?: string;
  href?: string;
}

type FeishuContentRow = FeishuContentItem[];

export class FeishuChannel extends BaseChannel {
  protected async testConnection(): Promise<boolean> {
    const webhookUrl = this.config.webhook_url;
    if (!webhookUrl) return false;

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msg_type: 'text',
          content: { text: '🔔 Connection Test' },
        }),
      });

      const data = (await res.json()) as { code: number };
      return data.code === 0;
    } catch {
      return false;
    }
  }

  async send(payload: ChannelPayload): Promise<ChannelResult> {
    const webhookUrl = this.config.webhook_url;
    if (!webhookUrl) {
      return { channel: 'feishu', success: false, message: '未配置飞书 Webhook URL' };
    }

    try {
      const content: FeishuContentRow[] = [[{ tag: 'text', text: payload.title }]];

      if (payload.body) {
        content.push([{ tag: 'text', text: `\n${payload.body}` }]);
      }

      if (payload.url) {
        content.push([{ tag: 'a', text: '查看详情', href: payload.url }]);
      }

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msg_type: 'post',
          content: {
            post: {
              zh_cn: { title: payload.title, content },
            },
          },
        }),
      });

      const data = (await res.json()) as { code: number; msg: string };

      if (data.code === 0) {
        return { channel: 'feishu', success: true, message: '飞书推送成功' };
      }

      return { channel: 'feishu', success: false, message: `飞书推送失败: ${data.msg}` };
    } catch (err) {
      return {
        channel: 'feishu',
        success: false,
        message: `飞书推送异常: ${(err as Error).message}`,
      };
    }
  }
}

export async function sendFeishu(
  payload: ChannelPayload,
  config: Record<string, string>
): Promise<ChannelResult> {
  const channel = new FeishuChannel('feishu', config);
  return channel.sendWithRetry(payload);
}
