import type { Context, Next } from 'hono';
import type { Env } from '../types';

export function securityHeaders() {
  return async function securityHeadersMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
    // 防止浏览器嗅探 Content-Type
    c.res.headers.set('X-Content-Type-Options', 'nosniff');

    // 防止 XSS 攻击
    c.res.headers.set('X-XSS-Protection', '1; mode=block');

    // 防止点击劫持
    c.res.headers.set('X-Frame-Options', 'DENY');

    // 内容安全策略（根据需要调整）
    c.res.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data: https:; font-src 'self' https://unpkg.com https://fonts.gstatic.com; connect-src 'self' https://unpkg.com;"
    );

    // 引用策略
    c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // 严格传输安全（HTTPS 环境）
    c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    // 允许的功能
    c.res.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    await next();
  };
}
