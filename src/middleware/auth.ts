import type { Context, Next } from 'hono';
import type { Env } from '../types';

/**
 * 认证中间件
 * 支持通过 X-API-Key、X-Token 或查询参数认证
 */
export async function authMiddleware(c: Context<{ Bindings: Env; Variables: { username: string } }>, next: Next) {
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
          }
        } catch { /* ignore */ }
      }
    }
    // 回退到遍历查找（兼容旧 apikey 无索引的情况）
    const list = await c.env.SUBSCRIPTIONS.list({ prefix: 'user:' });
    for (const key of list.keys) {
      if (key.name.includes(':s3_config') || key.name.includes(':apikey')) continue;
      const data = await c.env.SUBSCRIPTIONS.get(key.name);
      if (data) {
        try {
          const user = JSON.parse(data);
          if (user.apikey === apiKey) {
            c.set('username', key.name.replace('user:', ''));
            await next();
            return;
          }
        } catch { /* ignore */ }
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
          if (user.token === token && user.expiresAt > Date.now()) {
            c.set('username', indexedUser);
            await next();
            return;
          }
        } catch { /* ignore */ }
      }
    }
    // 回退到遍历查找（兼容旧 token 无索引的情况）
    const list = await c.env.SUBSCRIPTIONS.list({ prefix: 'user:' });
    for (const key of list.keys) {
      if (key.name.includes(':') && !key.name.startsWith('user:')) continue;
      const data = await c.env.SUBSCRIPTIONS.get(key.name);
      if (data) {
        try {
          const user = JSON.parse(data);
          if (user.token === token && user.expiresAt > Date.now()) {
            c.set('username', key.name.replace('user:', ''));
            await next();
            return;
          }
        } catch { /* ignore */ }
      }
    }
    return c.json({ error: '无效或已过期的 Token' }, 401);
  }

  return c.json({ error: '请提供认证信息' }, 401);
}
