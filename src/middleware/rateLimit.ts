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

// 登录失败计数器（用于暴力破解防护）
const loginFailStore = new Map<string, { count: number; lockUntil: number }>();

const IP_HEADER_PRIORITY = ['CF-Connecting-IP', 'X-Forwarded-For'];

function getClientIP(c: Context<{ Bindings: Env }>): string {
  for (const header of IP_HEADER_PRIORITY) {
    const value = c.req.header(header);
    if (value) {
      // CF-Connecting-IP 是 Cloudflare 直接设置的，最可信
      // X-Forwarded-For 取第一个值（最接近用户的 IP）
      return header === 'CF-Connecting-IP' ? value : value.split(',')[0].trim();
    }
  }
  return 'unknown';
}

export function rateLimit(config: RateLimitConfig = {}) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const windowMs = mergedConfig.windowMs!;
  const max = mergedConfig.max!;
  const message = mergedConfig.message!;
  const headers = mergedConfig.headers!;

  return async function rateLimitMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
    const ip = getClientIP(c);
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

// ============================================
// 登录专用限流 + 暴力破解防护
// ============================================

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 锁定 15 分钟
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 分钟窗口

export function recordLoginFailure(email: string, ip: string): boolean {
  const key = `login_fail:${email}:${ip}`;
  const now = Date.now();
  const entry = loginFailStore.get(key);

  if (entry && entry.lockUntil > now) {
    return false; // 已锁定
  }

  if (!entry || now > entry.lockUntil) {
    loginFailStore.set(key, { count: 1, lockUntil: 0 });
  } else {
    entry.count++;
    if (entry.count >= LOGIN_MAX_ATTEMPTS) {
      entry.lockUntil = now + LOGIN_LOCKOUT_MS;
    }
    loginFailStore.set(key, entry);
  }

  // 清理过期条目
  if (loginFailStore.size > 10000) {
    for (const [k, v] of loginFailStore.entries()) {
      if (now > v.lockUntil && v.lockUntil > 0) {
        loginFailStore.delete(k);
      }
    }
  }

  return true;
}

export function isLoginLocked(email: string, ip: string): { locked: boolean; retryAfter?: number } {
  const key = `login_fail:${email}:${ip}`;
  const entry = loginFailStore.get(key);
  const now = Date.now();

  if (entry && entry.lockUntil > now) {
    return {
      locked: true,
      retryAfter: Math.ceil((entry.lockUntil - now) / 1000),
    };
  }

  return { locked: false };
}

export function clearLoginFailure(email: string, ip: string): void {
  const key = `login_fail:${email}:${ip}`;
  loginFailStore.delete(key);
}
