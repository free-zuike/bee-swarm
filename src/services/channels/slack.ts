import type { ChannelResult } from '../../types';
import { BaseChannel, type ChannelPayload } from './base';

interface SlackMessage {
  text?: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
}

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: Array<{ type: string; text?: string; url?: string }>;
  image_url?: string;
  alt_text?: string;
}

interface SlackAttachment {
  color?: string;
  title?: string;
  text?: string;
  fields?: Array<{ title: string; value: string; short?: boolean }>;
}

export class SlackChannel extends BaseChannel {
  protected async testConnection(): Promise<boolean> {
    const webhookUrl = this.config.webhook_url;
    if (!webhookUrl) return false;

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '🔔 Connection Test' }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async send(payload: ChannelPayload): Promise<ChannelResult> {
    const webhookUrl = this.config.webhook_url;
    if (!webhookUrl) {
      return { channel: 'slack', success: false, message: 'Webhook URL not configured' };
    }

    const message = this.buildMessage(payload);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (response.ok) {
      return { channel: 'slack', success: true, message: 'Slack notification sent' };
    }

    const errorText = await response.text();
    return { channel: 'slack', success: false, message: `Slack error: ${errorText}` };
  }

  private buildMessage(payload: ChannelPayload): SlackMessage {
    const blocks: SlackBlock[] = [];

    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: payload.title,
        emoji: true,
      },
    });

    if (payload.body) {
      if (payload.markdown) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: payload.body,
          },
        });
      } else {
        blocks.push({
          type: 'section',
          text: {
            type: 'plain_text',
            text: payload.body,
            emoji: false,
          },
        });
      }
    }

    if (payload.url) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `<${payload.url}|View Details>`,
        },
      });
    }

    if (payload.imageUrl) {
      blocks.push({
        type: 'image',
        image_url: payload.imageUrl,
        alt_text: payload.title,
      });
    }

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Sent via Bee Swarm • ${new Date().toLocaleString()}`,
        },
      ],
    });

    return { blocks };
  }
}

export async function sendSlack(
  webhookUrl: string,
  payload: ChannelPayload
): Promise<ChannelResult> {
  const channel = new SlackChannel('slack', { webhook_url: webhookUrl });
  return channel.sendWithRetry(payload);
}
