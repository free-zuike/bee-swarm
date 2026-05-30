import type { ChannelResult } from '../../types';
import { BaseChannel, type ChannelPayload } from './base';

export class TeamsChannel extends BaseChannel {
  protected async testConnection(): Promise<boolean> {
    const webhookUrl = this.config.webhook_url;
    if (!webhookUrl) return false;
    // Microsoft Teams 没有专门的健康检查 API，我们在实际推送时验证
    return true;
  }

  async send(payload: ChannelPayload): Promise<ChannelResult> {
    const webhookUrl = this.config.webhook_url;
    if (!webhookUrl) {
      return { channel: 'teams', success: false, message: '未配置 Microsoft Teams Webhook' };
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adaptiveCard: any = {
        type: 'message',
        attachments: [
          {
            contentType: 'application/vnd.microsoft.card.adaptive',
            contentUrl: null,
            content: {
              $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
              type: 'AdaptiveCard',
              version: '1.2',
              body: [
                {
                  type: 'TextBlock',
                  size: 'Large',
                  weight: 'Bolder',
                  text: payload.title,
                },
              ],
            },
          },
        ],
      };

      if (payload.body) {
        adaptiveCard.attachments[0].content.body.push({
          type: 'TextBlock',
          text: payload.body,
          wrap: true,
        });
      }

      if (payload.url) {
        adaptiveCard.attachments[0].content.actions = [
          {
            type: 'Action.OpenUrl',
            title: '查看详情',
            url: payload.url,
          },
        ];
      }

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adaptiveCard),
      });

      if (res.ok) {
        return { channel: 'teams', success: true, message: 'Microsoft Teams 推送成功' };
      }

      const errorText = await res.text();
      return {
        channel: 'teams',
        success: false,
        message: `Microsoft Teams 推送失败: ${res.status} ${errorText || res.statusText}`,
      };
    } catch (err) {
      return {
        channel: 'teams',
        success: false,
        message: `Microsoft Teams 推送异常: ${(err as Error).message}`,
      };
    }
  }
}

export async function sendTeams(
  payload: ChannelPayload,
  config: Record<string, string>
): Promise<ChannelResult> {
  const channel = new TeamsChannel('teams', config);
  return channel.sendWithRetry(payload);
}
