import type { ChannelResult } from '../../types';
import { BaseChannel, type ChannelPayload } from './base';

export class EmailChannel extends BaseChannel {
  protected async testConnection(): Promise<boolean> {
    const apiKey = this.config.api_key;
    const from = this.config.from;
    const to = this.config.to;
    if (!apiKey || !from || !to) return false;

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: to.split(',').map((e) => e.trim()),
          subject: '🔔 Connection Test',
          text: 'This is a connection test from Bee Swarm.',
        }),
      });

      const data = (await res.json()) as { id?: string };
      return res.ok && !!data.id;
    } catch {
      return false;
    }
  }

  async send(payload: ChannelPayload): Promise<ChannelResult> {
    const apiKey = this.config.api_key;
    const from = this.config.from;
    const to = this.config.to;
    if (!apiKey || !from || !to) {
      return {
        channel: 'email',
        success: false,
        message: '未配置 Email（需要 RESEND_API_KEY、EMAIL_FROM、EMAIL_TO）',
      };
    }

    try {
      const text = [
        payload.title,
        '─'.repeat(payload.title.length),
        payload.body || '',
        payload.url ? `\n查看详情: ${payload.url}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const bodyHtml = this.escapeHtml(payload.body || '').replace(/\n/g, '<br>');

      const html = `
        <div style="max-width: 600px; margin: 0 auto; font-family: -apple-system, sans-serif;">
          <div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 24px; border-radius: 12px 12px 0 0;">
            <h2 style="color: white; margin: 0;">${this.escapeHtml(payload.title)}</h2>
          </div>
          <div style="background: #f9f9f9; padding: 24px; border-radius: 0 0 12px 12px;">
            <p style="color: #333; line-height: 1.8; white-space: pre-wrap;">${bodyHtml}</p>
            ${payload.url ? `<a href="${this.escapeUrl(payload.url)}" style="display: inline-block; margin-top: 16px; padding: 10px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 8px;">查看详情</a>` : ''}
          </div>
        </div>
      `;

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: to.split(',').map((e) => e.trim()),
          subject: payload.title,
          html,
          text,
        }),
      });

      const data = (await res.json()) as { id?: string; error?: { message: string } };

      if (res.ok && data.id) {
        return { channel: 'email', success: true, message: `邮件发送成功 (${to})` };
      }

      return {
        channel: 'email',
        success: false,
        message: `邮件发送失败: ${data.error?.message || '未知错误'}`,
      };
    } catch (err) {
      return {
        channel: 'email',
        success: false,
        message: `邮件发送异常: ${(err as Error).message}`,
      };
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private escapeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return '#';
      }
      return url;
    } catch {
      return '#';
    }
  }
}

export async function sendEmail(
  payload: ChannelPayload,
  config: Record<string, string>
): Promise<ChannelResult> {
  const channel = new EmailChannel('email', config);
  return channel.sendWithRetry(payload);
}
