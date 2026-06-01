import type { Context, Next } from 'hono';
import type { Env } from '../types';
import { UserService } from '../services/userService';

/**
 * 认证中间件
 * 支持通过 X-API-Key、X-Token 或查询参数认证
 * 使用 D1 数据库
 */
export async function authMiddleware(
  c: Context<{ Bindings: Env; Variables: { username: string } }>,
  next: Next
) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const userService = new UserService(c.env);

  // 1. 优先使用 API Key
  const apiKey = c.req.header('X-API-Key') || c.req.query('apikey');
  if (apiKey) {
    const user = await userService.findByApiKey(apiKey);
    if (user) {
      if (user.disabled) {
        return c.json({ error: '账号已被禁用' }, 403);
      }
      c.set('username', user.email);
      c.set('userId', user.id);
      c.set('userRole', user.role || 'user');
      await next();
      return;
    }
    return c.json({ error: '无效的 API Key' }, 401);
  }

  // 2. 使用 Token
  const token = c.req.header('X-Token') || c.req.query('token');
  if (token) {
    const user = await userService.findByToken(token);
    if (user && user.token_expires_at && user.token_expires_at > Date.now()) {
      if (user.disabled) {
        return c.json({ error: '账号已被禁用' }, 403);
      }
      c.set('username', user.email);
      c.set('userId', user.id);
      c.set('userRole', user.role || 'user');
      await next();
      return;
    } else if (user) {
      console.warn(`[Auth-${requestId}] Token expired for user: ${user.email}`);
      return c.json({ error: 'Token 已过期，请重新登录' }, 401);
    }
    return c.json({ error: '无效或已过期的 Token' }, 401);
  }

  return c.json({ error: '请提供认证信息' }, 401);
}
