import type { ChannelResult } from '../../types';

export interface PushOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export interface ChannelPayload {
  title: string;
  body?: string;
  url?: string;
  imageUrl?: string;
  markdown?: boolean;
  icon?: string;
}

export abstract class BaseChannel {
  protected id: string;
  protected config: Record<string, string>;
  protected options: Required<PushOptions>;

  constructor(id: string, config: Record<string, string>, options: PushOptions = {}) {
    this.id = id;
    this.config = config;
    this.options = {
      timeout: options.timeout ?? 10000,
      retries: options.retries ?? 3,
      retryDelay: options.retryDelay ?? 1000,
    };
  }

  abstract send(payload: ChannelPayload): Promise<ChannelResult>;

  protected async withRetry<T>(fn: () => Promise<T>, retries?: number): Promise<T> {
    const maxRetries = retries ?? this.options.retries;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        if (attempt < maxRetries) {
          await this.delay(this.options.retryDelay * Math.pow(2, attempt));
        }
      }
    }

    throw lastError;
  }

  protected async withTimeout<T>(promise: Promise<T>, timeout?: number): Promise<T> {
    const ms = timeout ?? this.options.timeout;
    let timeoutId: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Request timeout after ${ms}ms`));
      }, ms);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId!);
      return result;
    } catch (err) {
      clearTimeout(timeoutId!);
      throw err;
    }
  }

  public async sendWithRetry(payload: ChannelPayload): Promise<ChannelResult> {
    return this.withRetry(async () => {
      return this.withTimeout(this.send(payload));
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    try {
      const result = await this.withTimeout(this.testConnection(), 5000);
      return { healthy: result, message: 'Connection OK' };
    } catch (err) {
      return {
        healthy: false,
        message: (err as Error).message,
      };
    }
  }

  protected abstract testConnection(): Promise<boolean>;
}

export function parseMarkdown(text: string): { text: string; html?: string } {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  let html = escaped
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');

  return { text, html };
}
