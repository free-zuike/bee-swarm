// ============================================
// API 路由
// 所有 REST API 接口的集中定义
//
// 路由结构:
//   /api/register           POST  - 注册账号（公开）
//   /api/login              POST  - 登录（公开）
//   /api/admin/channels     GET   - 获取渠道配置（需认证）
//   /api/admin/channels/:id PUT   - 保存单个渠道设置（需认证）
//   /api/admin/push         POST  - 发送推送（需认证）
// ============================================
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, PushRequest, PushChannel } from '../types';
import {
  dispatchPush,
  getChannelConfigs,
  loadUserChannelSettings,
  saveUserChannelSetting,
  CHANNEL_DEFINITIONS,
} from '../services/dispatcher';

export const api = new Hono<{ Bindings: Env }>();

api.use('/*', cors());

/** SHA-256 哈希 */
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 邮箱格式验证 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** 从请求中提取用户名 */
function getUsername(c: any): string {
  const authHeader = c.req.header('Authorization');
  const urlUser = c.req.query('username');
  return urlUser || authHeader?.replace('Bearer ', '') || '';
}

// ============================================
// 公开接口
// ============================================

/** 注册 */
api.post('/register', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();

  if (!email || !isValidEmail(email)) {
    return c.json({ error: '请输入有效的邮箱地址' }, 400);
  }
  if (!password || password.length < 4) {
    return c.json({ error: '密码长度至少 4 位' }, 400);
  }

  const existing = await c.env.SUBSCRIPTIONS.get(`user:${email}`);
  if (existing) {
    return c.json({ error: '该邮箱已被注册' }, 409);
  }

  const hashed = await hashPassword(password);
  await c.env.SUBSCRIPTIONS.put(`user:${email}`, JSON.stringify({ password: hashed }));

  return c.json({ success: true, message: '注册成功' });
});

/** 登录 */
api.post('/login', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();

  if (!email || !password) {
    return c.json({ error: '请输入邮箱和密码' }, 400);
  }

  const userData = await c.env.SUBSCRIPTIONS.get(`user:${email}`);
  if (!userData) {
    return c.json({ error: '邮箱或密码错误' }, 401);
  }

  const { password: hashed } = JSON.parse(userData);
  const inputHashed = await hashPassword(password);

  if (inputHashed !== hashed) {
    return c.json({ error: '邮箱或密码错误' }, 401);
  }

  return c.json({ success: true, message: '登录成功', email });
});

// ============================================
// 管理接口（需要用户认证）
// ============================================
const adminApi = new Hono<{ Bindings: Env }>();

/** 认证中间件 */
adminApi.use('/*', async (c, next) => {
  const username = getUsername(c);
  const password = c.req.query('password') || c.req.header('X-Password') || '';

  if (!username || !password) {
    return c.json({ error: '请提供用户名和密码' }, 401);
  }

  const userData = await c.env.SUBSCRIPTIONS.get(`user:${username}`);
  if (!userData) {
    return c.json({ error: '用户不存在' }, 401);
  }

  const { password: hashed } = JSON.parse(userData);
  const inputHashed = await hashPassword(password);

  if (inputHashed !== hashed) {
    return c.json({ error: '密码错误' }, 401);
  }

  c.set('username', username);
  await next();
});

/** 获取所有渠道配置 */
adminApi.get('/channels', async (c) => {
  const username = c.get('username') as string;
  const settings = await loadUserChannelSettings(username, c.env);
  const channels = getChannelConfigs(settings);

  return c.json({ channels, settings, definitions: CHANNEL_DEFINITIONS });
});

/** 保存单个渠道设置 */
adminApi.put('/channels/:id', async (c) => {
  const username = c.get('username') as string;
  const channelId = c.req.param('id') as PushChannel;

  if (!CHANNEL_DEFINITIONS.find((d) => d.id === channelId)) {
    return c.json({ error: '无效的渠道 ID' }, 400);
  }

  const body = await c.req.json<{ fields: Record<string, string> }>();

  if (!body.fields || typeof body.fields !== 'object') {
    return c.json({ error: '无效的配置数据' }, 400);
  }

  await saveUserChannelSetting(username, channelId, body.fields, c.env);

  const settings = await loadUserChannelSettings(username, c.env);
  const channels = getChannelConfigs(settings);

  return c.json({
    success: true,
    message: `${CHANNEL_DEFINITIONS.find((d) => d.id === channelId)?.name} 设置已保存`,
    channels,
  });
});

/** 发送推送 */
adminApi.post('/push', async (c) => {
  const username = c.get('username') as string;
  const body: PushRequest = await c.req.json();

  if (!body.title) {
    return c.json({ error: '请输入标题' }, 400);
  }

  const results = await dispatchPush(body, body.channels, username, c.env);

  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;

  return c.json({
    success: failedCount === 0,
    message: `推送完成: ${successCount} 成功, ${failedCount} 失败`,
    results,
  });
});

api.route('/admin', adminApi);
export default api;
