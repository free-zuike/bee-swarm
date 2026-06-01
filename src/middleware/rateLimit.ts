import type { Context, Next } from 'hono';
import type { Env } from '../types';
import { ErrorCode } from '../utils/errors';

interface RateLimitConfig {
  windowMs?: number;
  max?: number;
  message?: string;
  headers?: boolean;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000,
  max: 60,
  message: '请求过于频繁，请稍后重试',
  headers: true,
};

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// 内存存储（Workers 实例间不共享，需注意）
const memoryStore = new Map<string, RateLimitEntry>();

export function rateLimit(config: RateLimitConfig = {}) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const windowMs = mergedConfig.windowMs!;
  const max = mergedConfig.max!;
  const message = mergedConfig.message!;
  const headers = mergedConfig.headers!;

  return async function rateLimitMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
    const ip = c.req.header('X-Forwarded-For') || c.req.header('CF-Connecting-IP') || 'unknown';
    const key = `rate_limit:${ip}`;
    const now = Date.now();

    let entry = memoryStore.get(key);

    if (!entry || now > entry.resetTime) {
      entry = {
        count: 1,
        resetTime: now + windowMs,
      };
    } else {
      entry.count++;
    }

    memoryStore.set(key, entry);

    // 定期清理过期条目
    if (memoryStore.size > 10000) {
      for (const [k, v] of memoryStore.entries()) {
        if (now > v.resetTime) {
          memoryStore.delete(k);
        }
      }
    }

    const remaining = Math.max(0, max - entry.count);
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

    if (entry.count > max) {
      const responseHeaders = new Headers();
      if (headers) {
        responseHeaders.set('X-RateLimit-Limit', String(max));
        responseHeaders.set('X-RateLimit-Remaining', '0');
        responseHeaders.set('X-RateLimit-Reset', String(Math.floor(entry.resetTime / 1000)));
        responseHeaders.set('Retry-After', String(retryAfter));
      }
      return c.json(
        {
          error: message,
          code: ErrorCode.RATE_LIMITED,
          timestamp: new Date().toISOString(),
        },
        { status: 429, headers: responseHeaders }
      );
    }

    await next();

    if (headers && c.res) {
      c.res.headers.set('X-RateLimit-Limit', String(max));
      c.res.headers.set('X-RateLimit-Remaining', String(remaining));
      c.res.headers.set('X-RateLimit-Reset', String(Math.floor(entry.resetTime / 1000)));
    }
  };
}
