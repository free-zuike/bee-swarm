import type { Context, Next } from 'hono';
import type { Env } from '../types';
import { UserService } from '../services/userService';

/**
 * MCP 认证中间件
 * 支持 Authorization: Bearer 或查询参数认证
 * 不支持 X-Token（登录会话 Token，仅限 Web 使用）
 */
export async function mcpAuthMiddleware(
  c: Context<{ Bindings: Env; Variables: { username: string } }>,
  next: Next
) {
  const userService = new UserService(c.env);

  // MCP 接受 API Key（支持 Authorization: Bearer header 或查询参数）
  const apiKey = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '')
    || c.req.query('apikey');
  if (!apiKey) {
    return c.json(
      {
        error: 'MCP 接口仅支持 API Key 认证',
        hint: '请通过 Authorization: Bearer 请求头或 apikey 查询参数提供 API Key',
        code: 'AUTH_ERROR',
      },
      401
    );
  }

  const user = await userService.findByApiKey(apiKey);
  if (!user) {
    return c.json({ error: '无效的或已过期的 API Key', code: 'AUTH_ERROR' }, 401);
  }
  if (user.disabled) {
    return c.json({ error: '账号已被禁用' }, 403);
  }

  c.set('username', user.email);
  c.set('userId', user.id);
  c.set('userRole', user.role || 'user');
  await next();
}