import { BaseChannel, type ChannelPayload, type PushOptions } from './base';
import type { ChannelResult } from '../../../types';

export class WebhookChannel extends BaseChannel {
  constructor(config: Record<string, string>, options?: PushOptions) {
    super('webhook', config, options);
  }

  async send(payload: ChannelPayload): Promise<ChannelResult> {
    const startTime = Date.now();
    try {
      const url = this.config.webhookUrl;
      if (!url) {
        throw new Error('Webhook URL is required');
      }

      const method = this.config.method || 'POST';
      const contentType = this.config.contentType || 'application/json';
      const customHeaders = this.parseCustomHeaders();

      const body = this.buildPayload(payload);
      let requestBody: string | null | undefined;
      if (contentType.includes('json')) {
        requestBody = JSON.stringify(body);
      } else if (typeof body === 'string') {
        requestBody = body;
      } else {
        requestBody = JSON.stringify(body);
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': contentType,
          ...customHeaders,
        },
        body: requestBody,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
      }

      const latencyMs = Date.now() - startTime;
      return {
        channel: 'webhook',
        success: true,
        message: 'Webhook sent successfully',
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      return {
        channel: 'webhook',
        success: false,
        message: (error as Error).message,
        latencyMs,
      };
    }
  }

  protected async testConnection(): Promise<boolean> {
    const url = this.config.webhookUrl;
    if (!url) {
      return false;
    }

    try {
      const method = this.config.testMethod || 'HEAD';
      const response = await fetch(url, { method, redirect: 'manual' });
      return response.status < 500;
    } catch {
      return false;
    }
  }

  private buildPayload(payload: ChannelPayload): Record<string, unknown> {
    const template = this.config.payloadTemplate;
    if (template) {
      try {
        const parsed = JSON.parse(template) as unknown;
        return this.interpolateVariables(parsed, payload) as Record<string, unknown>;
      } catch {
        // Fallback if template is invalid
      }
    }

    return {
      title: payload.title,
      body: payload.body,
      url: payload.url,
      imageUrl: payload.imageUrl,
      icon: payload.icon,
      timestamp: new Date().toISOString(),
    };
  }

  private interpolateVariables(obj: unknown, payload: ChannelPayload): unknown {
    if (typeof obj === 'string') {
      return obj
        .replace(/{{title}}/g, payload.title || '')
        .replace(/{{body}}/g, payload.body || '')
        .replace(/{{url}}/g, payload.url || '')
        .replace(/{{imageUrl}}/g, payload.imageUrl || '')
        .replace(/{{icon}}/g, payload.icon || '')
        .replace(/{{timestamp}}/g, new Date().toISOString());
    } else if (Array.isArray(obj)) {
      return obj.map((item) => this.interpolateVariables(item, payload));
    } else if (typeof obj === 'object' && obj !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        result[key] = this.interpolateVariables(value, payload);
      }
      return result;
    }
    return obj;
  }

  private parseCustomHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const headerStr = this.config.headers;
    if (!headerStr) {
      return headers;
    }

    try {
      const parsed = JSON.parse(headerStr);
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') {
          headers[key] = value;
        }
      }
    } catch {
      // Parse failed, try line format
      const lines = headerStr.split('\n');
      for (const line of lines) {
        const [key, ...values] = line.split(':');
        if (key && values.length > 0) {
          headers[key.trim()] = values.join(':').trim();
        }
      }
    }

    return headers;
  }
}

export async function sendWebhook(
  config: Record<string, string>,
  payload: ChannelPayload,
  options?: PushOptions
): Promise<ChannelResult> {
  const channel = new WebhookChannel(config, options);
  return channel.sendWithRetry(payload);
}
