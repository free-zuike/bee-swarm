import type { ChannelResult } from '../../types';
import { BaseChannel, type ChannelPayload } from './base';

export class LineNotifyChannel extends BaseChannel {
  protected async testConnection(): Promise<boolean> {
    const token = this.config.token;
    if (!token) return false;
    // LINE Notify 没有专门的健康检查 API，我们在实际推送时验证
    return true;
  }

  async send(payload: ChannelPayload): Promise<ChannelResult> {
    const token = this.config.token;
    if (!token) {
      return { channel: 'line', success: false, message: '未配置 LINE Notify Token' };
    }

    try {
      const formData = new FormData();
      formData.append('message', `${payload.title}\n${payload.body || ''}`);

      if (payload.imageUrl) {
        formData.append('imageThumbnail', payload.imageUrl);
        formData.append('imageFullsize', payload.imageUrl);
      }

      if (payload.url) {
        formData.append('notificationDisabled', 'false');
      }

      const res = await fetch('https://notify-api.line.me/api/notify', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (res.ok) {
        return { channel: 'line', success: true, message: 'LINE Notify 推送成功' };
      }

      const errorData = await res.json().catch(() => ({ message: res.statusText }));
      const errorMsg = (errorData as { message?: string })?.message || res.statusText;
      return {
        channel: 'line',
        success: false,
        message: `LINE Notify 推送失败: ${errorMsg}`,
      };
    } catch (err) {
      return {
        channel: 'line',
        success: false,
        message: `LINE Notify 推送异常: ${(err as Error).message}`,
      };
    }
  }
}

export async function sendLineNotify(
  payload: ChannelPayload,
  config: Record<string, string>
): Promise<ChannelResult> {
  const channel = new LineNotifyChannel('line', config);
  return channel.sendWithRetry(payload);
}
