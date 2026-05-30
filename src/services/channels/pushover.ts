import type { ChannelResult } from '../../types';
import { BaseChannel, type ChannelPayload } from './base';

export class PushoverChannel extends BaseChannel {
  protected async testConnection(): Promise<boolean> {
    const user = this.config.user;
    const token = this.config.token;
    if (!user || !token) return false;
    // Pushover 没有专门的健康检查 API，我们在实际推送时验证
    return true;
  }

  async send(payload: ChannelPayload): Promise<ChannelResult> {
    const user = this.config.user;
    const token = this.config.token;

    if (!user || !token) {
      return { channel: 'pushover', success: false, message: '未配置 Pushover User 或 Token' };
    }

    try {
      const formData = new URLSearchParams();
      formData.append('token', token);
      formData.append('user', user);
      formData.append('title', payload.title);
      formData.append('message', payload.body || '');

      if (payload.url) {
        formData.append('url', payload.url);
        formData.append('url_title', '查看详情');
      }

      if (this.config.priority) {
        formData.append('priority', this.config.priority);
      }

      if (this.config.sound) {
        formData.append('sound', this.config.sound);
      }

      const res = await fetch('https://api.pushover.net/1/messages.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
      });

      if (res.ok) {
        return { channel: 'pushover', success: true, message: 'Pushover 推送成功' };
      }

      const errorData = await res.json().catch(() => ({ message: res.statusText }));
      const errorMsg = (errorData as { message?: string })?.message || res.statusText;
      return {
        channel: 'pushover',
        success: false,
        message: `Pushover 推送失败: ${errorMsg}`,
      };
    } catch (err) {
      return {
        channel: 'pushover',
        success: false,
        message: `Pushover 推送异常: ${(err as Error).message}`,
      };
    }
  }
}

export async function sendPushover(
  payload: ChannelPayload,
  config: Record<string, string>
): Promise<ChannelResult> {
  const channel = new PushoverChannel('pushover', config);
  return channel.sendWithRetry(payload);
}
