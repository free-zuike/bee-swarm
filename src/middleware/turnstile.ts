// ============================================
// Turnstile 反爬虫验证中间件
// ============================================

import type { Context, Next } from 'hono';
import type { Env } from '../types';

/**
 * Turnstile 验证结果
 */
export interface TurnstileResult {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Turnstile 验证选项
 */
export interface TurnstileOptions {
  /**
   * 是否启用 Turnstile（可选）
   */
  enabled?: boolean;
  /**
   * 验证失败的消息
   */
  errorMessage?: string;
}

/**
 * 验证 Turnstile 响应
 * @param token Turnstile 响应令牌
 * @param secretKey Turnstile 密钥
 * @param remoteIp 客户端 IP（可选）
 */
async function verifyTurnstile(
  token: string,
  secretKey: string,
  remoteIp?: string
): Promise<TurnstileResult> {
  const formData = new FormData();
  formData.append('secret', secretKey);
  formData.append('response', token);

  if (remoteIp) {
    formData.append('remoteip', remoteIp);
  }

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: formData,
  });

  return await response.json();
}

/**
 * Turnstile 验证中间件
 * 用于保护管理后台和敏感接口
 */
export function turnstileMiddleware(options?: TurnstileOptions) {
  const config = {
    enabled: true,
    errorMessage: '验证失败，请重试',
    ...options,
  };

  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    // 如果 Turnstile 未配置或禁用，跳过验证
    if (!config.enabled || !c.env.TURNSTILE_SECRET_KEY) {
      return next();
    }

    // 只对 POST、PUT、DELETE 请求验证
    const method = c.req.method;
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return next();
    }

    let token: string | undefined;

    // 尝试从请求体获取
    if (c.req.header('Content-Type')?.includes('application/json')) {
      try {
        const body = await c.req.json();
        token = body.turnstileToken || body.cfTurnstileResponse;
      } catch {
        // JSON 解析失败，继续检查
      }
    }

    // 尝试从 FormData 获取
    if (!token) {
      try {
        const formData = await c.req.formData();
        token = (formData.get('turnstileToken') || formData.get('cf-turnstile-response')) as
          | string
          | undefined;
      } catch {
        // FormData 解析失败
      }
    }

    // 尝试从 Header 获取
    if (!token) {
      token = c.req.header('X-Turnstile-Token') || c.req.header('Cf-Turnstile-Response');
    }

    // 没有提供 Token
    if (!token) {
      return c.json(
        {
          error: config.errorMessage,
          code: 'MISSING_TURNSTILE_TOKEN',
          needsVerification: true,
        },
        400
      );
    }

    // 获取客户端 IP
    const clientIp = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For');

    // 验证 Token
    const result = await verifyTurnstile(token, c.env.TURNSTILE_SECRET_KEY, clientIp);

    if (!result.success) {
      console.warn('[Turnstile] Verification failed:', result['error-codes']);
      return c.json(
        {
          error: config.errorMessage,
          code: 'INVALID_TURNSTILE_TOKEN',
          needsVerification: true,
        },
        400
      );
    }

    // 验证成功，继续
    await next();
  };
}

/**
 * 可选的 Turnstile 验证中间件
 * 如果没有配置 Token，仍然放行
 */
export function optionalTurnstile(options?: TurnstileOptions) {
  const config = {
    enabled: true,
    ...options,
  };

  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    // 如果 Turnstile 未配置，跳过验证
    if (!config.enabled || !c.env.TURNSTILE_SECRET_KEY) {
      return next();
    }

    let token: string | undefined;

    // 尝试获取 Token（同上）
    if (c.req.header('Content-Type')?.includes('application/json')) {
      try {
        const body = await c.req.json();
        token = body.turnstileToken || body.cfTurnstileResponse;
      } catch {}
    }

    if (!token) {
      try {
        const formData = await c.req.formData();
        token = (formData.get('turnstileToken') || formData.get('cf-turnstile-response')) as
          | string
          | undefined;
      } catch {}
    }

    if (!token) {
      token = c.req.header('X-Turnstile-Token') || c.req.header('Cf-Turnstile-Response');
    }

    // 有 Token 就验证，没有就继续
    if (token) {
      const clientIp = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For');
      const result = await verifyTurnstile(token, c.env.TURNSTILE_SECRET_KEY, clientIp);

      if (!result.success) {
        console.warn('[Turnstile] Optional verification failed:', result['error-codes']);
        return c.json(
          {
            error: '验证失败，请重试',
            code: 'INVALID_TURNSTILE_TOKEN',
            needsVerification: true,
          },
          400
        );
      }
    }

    await next();
  };
}
