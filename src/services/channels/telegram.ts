import type { ChannelResult } from '../../types';
import { BaseChannel, type ChannelPayload } from './base';

export class TelegramChannel extends BaseChannel {
  protected async testConnection(): Promise<boolean> {
    const botToken = this.config.bot_token;
    const chatId = this.config.chat_id;
    if (!botToken || !chatId) return false;

    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: '🔔 Connection Test',
        }),
      });

      const data = (await res.json()) as { ok: boolean };
      return data.ok;
    } catch {
      return false;
    }
  }

  async send(payload: ChannelPayload): Promise<ChannelResult> {
    const botToken = this.config.bot_token;
    const chatId = this.config.chat_id;
    if (!botToken || !chatId) {
      return {
        channel: 'telegram',
        success: false,
        message: '未配置 Telegram Bot Token 或 Chat ID',
      };
    }

    try {
      let text = `<b>${this.escapeHtml(payload.title)}</b>`;

      if (payload.body) {
        text += `\n\n${this.escapeHtml(payload.body)}`;
      }

      if (payload.url && this.isValidUrl(payload.url)) {
        text += `\n\n<a href="${this.escapeHtml(payload.url)}">查看详情</a>`;
      }

      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: false,
        }),
      });

      const data = (await res.json()) as { ok: boolean; description?: string };

      if (data.ok) {
        return { channel: 'telegram', success: true, message: 'Telegram 推送成功' };
      }

      return {
        channel: 'telegram',
        success: false,
        message: `Telegram 推送失败: ${data.description}`,
      };
    } catch (err) {
      return {
        channel: 'telegram',
        success: false,
        message: `Telegram 推送异常: ${(err as Error).message}`,
      };
    }
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }
}

export async function sendTelegram(
  payload: ChannelPayload,
  config: Record<string, string>
): Promise<ChannelResult> {
  const channel = new TelegramChannel('telegram', config);
  return channel.sendWithRetry(payload);
}
