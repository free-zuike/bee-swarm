// ============================================
// KV 分布式限流中间件
// 使用 Cloudflare KV 实现跨实例共享的限流
// 免费额度：100,000 次读取/天，1,000 次写入/天
// ============================================

import type { Context, Next } from 'hono';
import type { Env } from '../types';
import { ErrorCode } from '../utils/errors';

export interface KVRateLimitConfig {
  /** 限流窗口时间（毫秒） */
  windowMs?: number;
  /** 窗口内最大请求数 */
  max?: number;
  /** 是否同时启用内存限流作为备用 */
  fallbackMemory?: boolean;
  /** 限流 Key 前缀 */
  keyPrefix?: string;
}

const DEFAULT_CONFIG: Required<KVRateLimitConfig> = {
  windowMs: 60 * 1000,
  max: 60,
  fallbackMemory: true,
  keyPrefix: 'ratelimit',
};

// 内存备用存储
const memoryStore = new Map<string, { count: number; resetTime: number }>();

/**
 * 创建基于 KV 的限流中间件
 */
export function createKVLimiter(config: KVRateLimitConfig = {}) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const { windowMs, max, fallbackMemory, keyPrefix } = mergedConfig;

  return async function kvRateLimitMiddleware(
    c: Context<{ Bindings: Env }>,
    next: Next
  ): Promise<Response | void> {
    const ip = c.req.header('X-Forwarded-For') || c.req.header('CF-Connecting-IP') || 'unknown';
    const path = new URL(c.req.raw.url).pathname;
    const key = `${keyPrefix}:${ip}:${path}`;
    const now = Date.now();

    try {
      if (c.env.RATE_LIMIT_KV) {
        return await handleKVRateLimit(c, next, key, now, windowMs, max);
      }
      if (fallbackMemory) {
        return await handleMemoryRateLimit(c, next, key, now, windowMs, max);
      }
      await next();
    } catch {
      if (fallbackMemory) {
        return await handleMemoryRateLimit(c, next, key, now, windowMs, max);
      }
      await next();
    }
  };
}

/**
 * KV 限流处理
 */
async function handleKVRateLimit(
  c: Context<{ Bindings: Env }>,
  next: Next,
  key: string,
  now: number,
  windowMs: number,
  max: number
): Promise<Response | void> {
  const kv = c.env.RATE_LIMIT_KV!;
  const windowSeconds = Math.ceil(windowMs / 1000);

  const currentStr = await kv.get(key, 'text');
  const current = currentStr ? JSON.parse(currentStr) : { count: 0, resetTime: now + windowMs };

  if (now > current.resetTime) {
    current.count = 1;
    current.resetTime = now + windowMs;
  } else {
    current.count++;
  }

  await kv.put(key, JSON.stringify(current), { expirationTtl: windowSeconds + 10 });

  const remaining = Math.max(0, max - current.count);

  if (current.count > max) {
    const retryAfter = Math.ceil((current.resetTime - now) / 1000);
    return c.json(
      {
        error: '请求过于频繁，请稍后重试',
        code: ErrorCode.RATE_LIMITED,
        timestamp: new Date().toISOString(),
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(max),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.floor(current.resetTime / 1000)),
          'Retry-After': String(retryAfter),
        },
      }
    );
  }

  await next();
  if (c.res) {
    c.res.headers.set('X-RateLimit-Limit', String(max));
    c.res.headers.set('X-RateLimit-Remaining', String(remaining));
    c.res.headers.set('X-RateLimit-Reset', String(Math.floor(current.resetTime / 1000)));
    c.res.headers.set('X-RateLimit-Source', 'kv');
  }
}

/**
 * 内存限流处理（备用方案）
 */
async function handleMemoryRateLimit(
  c: Context<{ Bindings: Env }>,
  next: Next,
  key: string,
  now: number,
  windowMs: number,
  max: number
): Promise<Response | void> {
  let entry = memoryStore.get(key);

  if (!entry || now > entry.resetTime) {
    entry = { count: 1, resetTime: now + windowMs };
  } else {
    entry.count++;
  }

  memoryStore.set(key, entry);

  if (memoryStore.size > 10000) {
    for (const [k, v] of memoryStore.entries()) {
      if (now > v.resetTime) {
        memoryStore.delete(k);
      }
    }
  }

  const remaining = Math.max(0, max - entry.count);

  if (entry.count > max) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return c.json(
      {
        error: '请求过于频繁，请稍后重试',
        code: ErrorCode.RATE_LIMITED,
        timestamp: new Date().toISOString(),
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(max),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.floor(entry.resetTime / 1000)),
          'Retry-After': String(retryAfter),
        },
      }
    );
  }

  await next();
  if (c.res) {
    c.res.headers.set('X-RateLimit-Limit', String(max));
    c.res.headers.set('X-RateLimit-Remaining', String(remaining));
    c.res.headers.set('X-RateLimit-Reset', String(Math.floor(entry.resetTime / 1000)));
    c.res.headers.set('X-RateLimit-Source', 'memory');
  }
}

/**
 * 全局限流 Key（不区分路径）
 */
export function createGlobalKVLimiter(config: KVRateLimitConfig = {}) {
  const mergedConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    keyPrefix: config.keyPrefix || 'global-ratelimit',
  };
  const { windowMs, max, fallbackMemory, keyPrefix } = mergedConfig;

  return async function globalKVRateLimitMiddleware(
    c: Context<{ Bindings: Env }>,
    next: Next
  ): Promise<Response | void> {
    const ip = c.req.header('X-Forwarded-For') || c.req.header('CF-Connecting-IP') || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    try {
      if (c.env.RATE_LIMIT_KV) {
        return await handleKVRateLimit(c, next, key, now, windowMs, max);
      }
      if (fallbackMemory) {
        return await handleMemoryRateLimit(c, next, key, now, windowMs, max);
      }
      await next();
    } catch {
      if (fallbackMemory) {
        return await handleMemoryRateLimit(c, next, key, now, windowMs, max);
      }
      await next();
    }
  };
}

/**
 * 滑动窗口限流器类
 */
export class SlidingWindowRateLimiter {
  private kv: KVNamespace | undefined;
  private keyPrefix: string;
  private windowMs: number;
  private max: number;

  constructor(
    kv: KVNamespace | undefined,
    options: { windowMs?: number; max?: number; keyPrefix?: string } = {}
  ) {
    this.kv = kv;
    this.windowMs = options.windowMs || 60000;
    this.max = options.max || 60;
    this.keyPrefix = options.keyPrefix || 'sw-ratelimit';
  }

  /**
   * 检查是否允许请求
   */
  async isAllowed(identifier: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
    currentCount: number;
  }> {
    if (!this.kv) {
      return {
        allowed: true,
        remaining: this.max,
        resetTime: Date.now() + this.windowMs,
        currentCount: 0,
      };
    }

    const key = `${this.keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowSeconds = Math.ceil(this.windowMs / 1000);

    const timestampsStr = await this.kv.get(key, 'text');
    const timestamps: number[] = timestampsStr ? JSON.parse(timestampsStr) : [];

    const cutoff = now - this.windowMs;
    const validTimestamps = timestamps.filter((t) => t > cutoff);
    const currentCount = validTimestamps.length;
    const allowed = currentCount < this.max;
    const remaining = Math.max(0, this.max - currentCount);

    let resetTime = now + this.windowMs;
    if (validTimestamps.length > 0) {
      resetTime = Math.min(...validTimestamps) + this.windowMs;
    }

    if (allowed) {
      validTimestamps.push(now);
      await this.kv.put(key, JSON.stringify(validTimestamps), {
        expirationTtl: windowSeconds + 10,
      });
    }

    return { allowed, remaining, resetTime, currentCount };
  }

  /**
   * 重置限流计数
   */
  async reset(identifier: string): Promise<void> {
    if (this.kv) {
      const key = `${this.keyPrefix}:${identifier}`;
      await this.kv.delete(key);
    }
  }
}
