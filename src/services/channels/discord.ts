import type { ChannelResult } from '../../types';
import { BaseChannel, type ChannelPayload } from './base';

interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  image?: { url: string };
  thumbnail?: { url: string };
  footer?: { text: string; icon_url?: string };
  timestamp?: string;
}

interface DiscordPayload {
  content?: string;
  embeds?: DiscordEmbed[];
  username?: string;
  avatar_url?: string;
}

export class DiscordChannel extends BaseChannel {
  protected async testConnection(): Promise<boolean> {
    const webhookUrl = this.config.webhook_url;
    if (!webhookUrl) return false;

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '🔔 Connection Test' }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async send(payload: ChannelPayload): Promise<ChannelResult> {
    const webhookUrl = this.config.webhook_url;
    if (!webhookUrl) {
      return { channel: 'discord', success: false, message: 'Webhook URL not configured' };
    }

    const message = this.buildMessage(payload);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (response.ok) {
      return { channel: 'discord', success: true, message: 'Discord notification sent' };
    }

    const errorText = await response.text();
    return { channel: 'discord', success: false, message: `Discord error: ${errorText}` };
  }

  private buildMessage(payload: ChannelPayload): DiscordPayload {
    const embeds: DiscordEmbed[] = [];

    const embed: DiscordEmbed = {
      title: payload.title,
      url: payload.url,
      color: 0x5865f2,
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Bee Swarm',
      },
    };

    if (payload.body) {
      if (payload.markdown) {
        embed.description = payload.body;
      } else {
        embed.description = payload.body;
      }
    }

    if (payload.imageUrl) {
      embed.image = { url: payload.imageUrl };
    }

    if (this.config.avatar_url) {
      embed.footer = {
        text: embed.footer?.text || 'Bee Swarm',
        icon_url: this.config.avatar_url,
      };
    }

    embeds.push(embed);

    return {
      username: this.config.username || 'Bee Swarm',
      avatar_url: this.config.avatar_url,
      embeds,
    };
  }
}

export async function sendDiscord(
  webhookUrl: string,
  payload: ChannelPayload,
  options?: { username?: string; avatarUrl?: string }
): Promise<ChannelResult> {
  const channel = new DiscordChannel('discord', {
    webhook_url: webhookUrl,
    username: options?.username || '',
    avatar_url: options?.avatarUrl || '',
  });
  return channel.sendWithRetry(payload);
}
