import type { Context, Next } from 'hono';
import type { Env } from '../types';
import { UserService } from '../services/userService';

/**
 * MCP 认证中间件
 * 仅支持 X-API-Key 认证（永久有效的密钥，适合程序化调用）
 * 不支持 X-Token（登录会话 Token，仅限 Web 使用）
 */
export async function mcpAuthMiddleware(
  c: Context<{ Bindings: Env; Variables: { username: string } }>,
  next: Next
) {
  const userService = new UserService(c.env);

  // MCP 仅接受 API Key（header 或查询参数）
  const apiKey = c.req.header('X-API-Key') || c.req.query('apikey');
  if (!apiKey) {
    return c.json(
      {
        error: 'MCP 接口仅支持 X-API-Key 认证，请使用永久有效的 API Key',
        hint: '请先在设置面板生成 API Key，然后通过 X-API-Key header 或 apikey 查询参数进行认证',
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