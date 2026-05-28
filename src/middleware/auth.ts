import type { Context, Next } from 'hono';
import type { Env } from '../types';

/**
 * 认证中间件
 * 支持通过 X-API-Key、X-Token 或查询参数认证
 * 使用索引查找，O(1) 时间复杂度
 */
export async function authMiddleware(
  c: Context<{ Bindings: Env; Variables: { username: string } }>,
  next: Next
) {
  const requestId = crypto.randomUUID().slice(0, 8);

  // 1. 优先使用 API Key
  const apiKey = c.req.header('X-API-Key') || c.req.query('apikey');
  if (apiKey) {
    const indexedUser = await c.env.SUBSCRIPTIONS.get(`apikey_index:${apiKey}`);
    if (indexedUser) {
      const userData = await c.env.SUBSCRIPTIONS.get(`user:${indexedUser}`);
      if (userData) {
        try {
          const user = JSON.parse(userData);
          if (user.apikey === apiKey) {
            c.set('username', indexedUser);
            await next();
            return;
          } else {
            console.warn(`[Auth-${requestId}] API Key mismatch for user: ${indexedUser}`);
          }
        } catch (err) {
          console.error(`[Auth-${requestId}] Failed to parse user data: ${(err as Error).message}`);
        }
      }
    }
    return c.json({ error: '无效的 API Key' }, 401);
  }

  // 2. 使用 Token（O(1) 查找）
  const token = c.req.header('X-Token') || c.req.query('token');
  if (token) {
    const indexedUser = await c.env.SUBSCRIPTIONS.get(`token_index:${token}`);
    if (indexedUser) {
      const userData = await c.env.SUBSCRIPTIONS.get(`user:${indexedUser}`);
      if (userData) {
        try {
          const user = JSON.parse(userData);
          if (user.token === token) {
            if (user.expiresAt > Date.now()) {
              c.set('username', indexedUser);
              await next();
              return;
            } else {
              console.warn(`[Auth-${requestId}] Token expired for user: ${indexedUser}`);
              return c.json({ error: 'Token 已过期，请重新登录' }, 401);
            }
          } else {
            console.warn(`[Auth-${requestId}] Token mismatch for user: ${indexedUser}`);
          }
        } catch (err) {
          console.error(`[Auth-${requestId}] Failed to parse user data: ${(err as Error).message}`);
        }
      }
    }
    return c.json({ error: '无效或已过期的 Token' }, 401);
  }

  return c.json({ error: '请提供认证信息' }, 401);
}
