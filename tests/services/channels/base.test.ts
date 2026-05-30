import { describe, it, expect, vi } from 'vitest';
import { BaseChannel, type ChannelPayload } from '../../../src/services/channels/base';

class TestChannel extends BaseChannel {
  async send(_payload: ChannelPayload) {
    return {
      channel: 'test',
      success: true,
      message: 'Test success'
    };
  }

  async testConnection(): Promise<boolean> {
    return true;
  }
}

class FailingTestChannel extends BaseChannel {
  async send(_payload: ChannelPayload): Promise<never> {
    throw new Error('Send failed');
  }

  async testConnection(): Promise<boolean> {
    return false;
  }
}

describe('BaseChannel', () => {
  describe('constructor', () => {
    it('should set default options when not provided', () => {
      const channel = new TestChannel('test', {});
      // @ts-ignore - accessing private property for test
      expect(channel.options.timeout).toBe(10000);
      // @ts-ignore
      expect(channel.options.retries).toBe(3);
      // @ts-ignore
      expect(channel.options.retryDelay).toBe(1000);
    });

    it('should use provided options', () => {
      const channel = new TestChannel('test', {}, {
        timeout: 5000,
        retries: 1,
        retryDelay: 500
      });
      // @ts-ignore
      expect(channel.options.timeout).toBe(5000);
      // @ts-ignore
      expect(channel.options.retries).toBe(1);
      // @ts-ignore
      expect(channel.options.retryDelay).toBe(500);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy when testConnection succeeds', async () => {
      const channel = new TestChannel('test', {});
      const result = await channel.healthCheck();
      
      expect(result.healthy).toBe(true);
      expect(result.message).toBe('Connection OK');
    });

    it('should return unhealthy when testConnection fails', async () => {
      const channel = new FailingTestChannel('test', {});
      const result = await channel.healthCheck();
      
      expect(result.healthy).toBe(false);
    });
  });

  describe('sendWithRetry', () => {
    it('should send successfully without needing to retry', async () => {
      const channel = new TestChannel('test', {});
      const result = await channel.sendWithRetry({
        title: 'Test',
        body: 'Test body'
      });
      
      expect(result.success).toBe(true);
    });
  });
});
