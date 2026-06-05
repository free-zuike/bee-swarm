// ============================================
// 安全增强模块
// 提供额外的安全保护层
// ============================================

import type { Context, Next } from 'hono';
import type { Env } from '../types';

/**
 * 安全配置
 */
export interface SecurityConfig {
  enableBruteForceProtection?: boolean;
  enableIPReputation?: boolean;
  maxLoginAttempts?: number;
  lockoutDuration?: number;
  requireVerificationForSensitiveOps?: boolean;
}

/**
 * 登录尝试记录
 */
interface LoginAttempt {
  count: number;
  lastAttempt: number;
  lockedUntil?: number;
}

const memoryStore = new Map<string, LoginAttempt>();

/**
 * 安全服务类
 */
export class SecurityService {
  private config: Required<SecurityConfig>;

  constructor(config: SecurityConfig = {}) {
    this.config = {
      enableBruteForceProtection: true,
      enableIPReputation: true,
      maxLoginAttempts: 5,
      lockoutDuration: 15 * 60,
      requireVerificationForSensitiveOps: true,
      ...config,
    };
  }

  /**
   * 检查登录是否被锁定
   */
  async isLoginLocked(identifier: string): Promise<{
    locked: boolean;
    remainingSeconds?: number;
    attempts?: number;
  }> {
    const attempt = memoryStore.get(identifier);

    if (attempt?.lockedUntil && attempt.lockedUntil > Date.now()) {
      return {
        locked: true,
        remainingSeconds: Math.ceil((attempt.lockedUntil - Date.now()) / 1000),
        attempts: attempt.count,
      };
    }

    return { locked: false, attempts: attempt?.count };
  }

  /**
   * 记录失败的登录尝试
   */
  async recordFailedAttempt(identifier: string): Promise<{
    attempts: number;
    locked: boolean;
    remainingSeconds?: number;
  }> {
    let attempt = memoryStore.get(identifier);

    if (!attempt) {
      attempt = { count: 0, lastAttempt: 0 };
    }

    attempt.count++;
    attempt.lastAttempt = Date.now();

    if (attempt.count >= this.config.maxLoginAttempts) {
      attempt.lockedUntil = Date.now() + this.config.lockoutDuration * 1000;
      memoryStore.set(identifier, attempt);

      return {
        attempts: attempt.count,
        locked: true,
        remainingSeconds: this.config.lockoutDuration,
      };
    }

    memoryStore.set(identifier, attempt);

    return {
      attempts: attempt.count,
      locked: false,
      remainingSeconds: this.config.maxLoginAttempts - attempt.count,
    };
  }

  /**
   * 清除登录尝试记录
   */
  async clearLoginAttempts(identifier: string): Promise<void> {
    memoryStore.delete(identifier);
  }

  /**
   * 检查 IP 信誉
   */
  async checkIPReputation(ip: string): Promise<{
    score: number;
    level: 'low' | 'medium' | 'high' | 'unknown';
    factors: string[];
  }> {
    const factors: string[] = [];
    let score = 100;

    if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.')) {
      return { score: 100, level: 'low', factors: ['Private network'] };
    }

    return { score, level: 'unknown', factors };
  }

  /**
   * 检查可疑请求
   */
  async isSuspiciousRequest(request: Request): Promise<{
    suspicious: boolean;
    reasons: string[];
  }> {
    const reasons: string[] = [];
    const headers = request.headers;

    if (!headers.get('User-Agent')) {
      reasons.push('Missing User-Agent');
    }

    const url = new URL(request.url);
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+=/i,
      /union\s+select/i,
      /drop\s+table/i,
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(url.pathname) || pattern.test(url.search)) {
        reasons.push('Suspicious URL pattern detected');
        break;
      }
    }

    return { suspicious: reasons.length > 0, reasons };
  }
}

/**
 * 暴力破解保护中间件
 */
export function bruteForceProtection(options?: SecurityConfig) {
  return async function bruteForceMiddleware(
    c: Context<{ Bindings: Env }>,
    next: Next
  ): Promise<Response | void> {
    const service = new SecurityService(options);
    const ip = c.req.header('X-Forwarded-For') || c.req.header('CF-Connecting-IP') || 'unknown';

    const lockStatus = await service.isLoginLocked(ip);

    if (lockStatus.locked) {
      return c.json(
        {
          error: `登录尝试次数过多，请 ${lockStatus.remainingSeconds} 秒后重试`,
          code: 'ACCOUNT_LOCKED',
          retryAfter: lockStatus.remainingSeconds,
        },
        { status: 429 }
      );
    }

    await next();

    if (c.res.status === 401) {
      const attempt = await service.recordFailedAttempt(ip);

      if (attempt.locked) {
        c.res.headers.set('X-RateLimit-Remaining', '0');
        c.res.headers.set('Retry-After', String(attempt.remainingSeconds));
      }
    }
  };
}

/**
 * IP 信誉检查中间件
 */
export function ipReputationCheck(options?: SecurityConfig) {
  return async function ipReputationMiddleware(
    c: Context<{ Bindings: Env }>,
    next: Next
  ): Promise<Response | void> {
    const service = new SecurityService(options);
    const ip = c.req.header('X-Forwarded-For') || c.req.header('CF-Connecting-IP') || 'unknown';

    const reputation = await service.checkIPReputation(ip);

    if (reputation.level === 'high') {
      console.warn(`[Security] High-risk IP: ${ip}`);
    }

    c.set('ipReputation', reputation);
    await next();
  };
}

/**
 * 可疑请求检查中间件
 */
export function suspiciousRequestCheck() {
  return async function suspiciousRequestMiddleware(
    c: Context<{ Bindings: Env }>,
    next: Next
  ): Promise<Response | void> {
    const service = new SecurityService();
    const check = await service.isSuspiciousRequest(c.req.raw);

    if (check.suspicious) {
      console.warn(
        `[Security] Suspicious request from ${c.req.header('CF-Connecting-IP')}:`,
        check.reasons
      );
    }

    await next();
  };
}

/**
 * 敏感操作保护中间件
 */
export function sensitiveOperationProtection(_options?: SecurityConfig) {
  return async function sensitiveOpMiddleware(
    c: Context<{ Bindings: Env }>,
    next: Next
  ): Promise<Response | void> {
    const sensitiveEndpoints = [
      '/api/admin/delete',
      '/api/admin/reset-password',
      '/api/admin/backup',
    ];

    const url = new URL(c.req.raw.url);
    const isSensitive = sensitiveEndpoints.some((endpoint) => url.pathname.includes(endpoint));

    if (isSensitive) {
      const verifyHeader = c.req.header('X-Verify-Operation');

      if (!verifyHeader) {
        return c.json(
          {
            error: '此操作需要额外验证',
            code: 'VERIFICATION_REQUIRED',
            requiresVerification: true,
          },
          { status: 403 }
        );
      }
    }

    await next();
  };
}

/**
 * 增强 CORS 中间件
 */
export function enhancedCORSMiddleware(options?: {
  allowedOrigins?: string[];
  allowedMethods?: string[];
  maxAge?: number;
}) {
  const allowedMethods = options?.allowedMethods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
  const maxAge = options?.maxAge || 86400;

  return async function enhancedCORSMiddleware(
    c: Context<{ Bindings: Env }>,
    next: Next
  ): Promise<Response | void> {
    const origin = c.req.header('Origin');
    const allowedOrigins = options?.allowedOrigins || [];

    let allowOrigin = false;
    if (origin) {
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        allowOrigin = true;
      }

      for (const allowed of allowedOrigins) {
        if (allowed.startsWith('*.') && origin.endsWith(allowed.slice(1))) {
          allowOrigin = true;
          break;
        }
      }
    }

    if (allowOrigin && c.res) {
      c.res.headers.set('Access-Control-Allow-Origin', origin || '*');
      c.res.headers.set('Access-Control-Allow-Methods', allowedMethods.join(', '));
      c.res.headers.set('Access-Control-Max-Age', String(maxAge));
      c.res.headers.set('Access-Control-Allow-Credentials', 'true');
      c.res.headers.set(
        'Access-Control-Expose-Headers',
        'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset'
      );
    }

    if (c.req.method === 'OPTIONS') {
      return c.newResponse(null, { status: 204 });
    }

    await next();
  };
}
