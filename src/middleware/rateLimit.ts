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

    let entry: RateLimitEntry | null = null;

    try {
      const stored = await c.env.SUBSCRIPTIONS.get(key);
      if (stored) {
        entry = JSON.parse(stored);
      }
    } catch {
      // KV 读取失败，继续使用内存逻辑
    }

    if (!entry || now > entry.resetTime) {
      entry = {
        count: 1,
        resetTime: now + windowMs,
      };
    } else {
      entry.count++;
    }

    // 异步保存到 KV（不阻塞请求）
    c.env.SUBSCRIPTIONS.put(key, JSON.stringify(entry), {
      expirationTtl: Math.ceil(windowMs / 1000),
    }).catch(() => {});

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

    // 响应头需要在 next() 之后设置（此时 c.res 已生成）
    if (headers && c.res) {
      c.res.headers.set('X-RateLimit-Limit', String(max));
      c.res.headers.set('X-RateLimit-Remaining', String(remaining));
      c.res.headers.set('X-RateLimit-Reset', String(Math.floor(entry.resetTime / 1000)));
    }
  };
}
