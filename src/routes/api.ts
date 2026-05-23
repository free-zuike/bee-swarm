// ============================================
// API 路由
// 所有 REST API 接口的集中定义
//
// 路由结构:
//   /api/vapid-key          GET   - 获取 VAPID 公钥（公开）
//   /api/subscribe          POST  - 订阅 Web Push（公开）
//   /api/unsubscribe        POST  - 取消订阅（公开）
//   /api/register           POST  - 注册账号（公开）
//   /api/login              POST  - 登录（公开）
//   /api/admin/channels     GET   - 获取渠道配置（需认证）
//   /api/admin/channels/:id PUT   - 保存单个渠道设置（需认证）
//   /api/admin/subscriptions GET  - 获取订阅列表（需认证）
//   /api/admin/push         POST  - 发送推送（需认证）
// ============================================
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, PushSubscription, PushRequest, PushChannel, ChannelSettings } from '../types';
import { addSubscription, removeSubscription, getAllSubscriptions } from '../services/webpush';
import {
  dispatchPush,
  getChannelConfigs,
  loadUserChannelSettings,
  saveUserChannelSetting,
  CHANNEL_DEFINITIONS,
} from '../services/dispatcher';

export const api = new Hono<{ Bindings: Env }>();

api.use('/*', cors());

// ============================================
// 工具函数
// ============================================

/** SHA-256 哈希 */
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
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

api.get('/vapid-key', (c) => {
  return c.json({ publicKey: c.env.VAPID_PUBLIC_KEY });
});

/** 注册 */
api.post('/register', async (c) => {
  const { username, password } = await c.req.json<{ username: string; password: string }>();

  if (!username || username.length < 2) {
    return c.json({ error: '用户名至少 2 个字符' }, 400);
  }
  if (!password || password.length < 4) {
    return c.json({ error: '密码长度至少 4 位' }, 400);
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return c.json({ error: '用户名只能包含字母、数字和下划线' }, 400);
  }

  // 检查用户名是否已存在
  const existing = await c.env.SUBSCRIPTIONS.get(`user:${username}`);
  if (existing) {
    return c.json({ error: '用户名已存在' }, 409);
  }

  // 存储用户（密码哈希）
  const hashed = await hashPassword(password);
  await c.env.SUBSCRIPTIONS.put(`user:${username}`, JSON.stringify({ password: hashed }));

  return c.json({ success: true, message: '注册成功' });
});

/** 登录 */
api.post('/login', async (c) => {
  const { username, password } = await c.req.json<{ username: string; password: string }>();

  if (!username || !password) {
    return c.json({ error: '请输入用户名和密码' }, 400);
  }

  const userData = await c.env.SUBSCRIPTIONS.get(`user:${username}`);
  if (!userData) {
    return c.json({ error: '用户名或密码错误' }, 401);
  }

  const { password: hashed } = JSON.parse(userData);
  const inputHashed = await hashPassword(password);

  if (inputHashed !== hashed) {
    return c.json({ error: '用户名或密码错误' }, 401);
  }

  return c.json({ success: true, message: '登录成功', username });
});

/** 订阅 Web Push */
api.post('/subscribe', async (c) => {
  const subscription: PushSubscription = await c.req.json();
  if (!subscription.endpoint || !subscription.keys) {
    return c.json({ error: '无效的订阅对象' }, 400);
  }
  await addSubscription(subscription, c.env);
  return c.json({ success: true, message: '订阅成功' });
});

/** 取消订阅 */
api.post('/unsubscribe', async (c) => {
  const { endpoint } = await c.req.json();
  if (!endpoint) {
    return c.json({ error: '缺少 endpoint' }, 400);
  }
  await removeSubscription(endpoint, c.env);
  return c.json({ success: true, message: '取消订阅成功' });
});

// ============================================
// 管理接口（需要用户认证）
// ============================================
const adminApi = new Hono<{ Bindings: Env }>();

/** 认证中间件：验证用户名+密码 */
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

  // 将用户名存入上下文
  c.set('username', username);
  await next();
});

/** 获取所有渠道配置 */
adminApi.get('/channels', async (c) => {
  const username = c.get('username') as string;
  const settings = await loadUserChannelSettings(username, c.env);
  const channels = getChannelConfigs(settings);

  return c.json({
    channels,
    settings,
    definitions: CHANNEL_DEFINITIONS,
  });
});

/** 保存单个渠道设置 */
adminApi.put('/channels/:id', async (c) => {
  const username = c.get('username') as string;
  const channelId = c.req.param('id') as PushChannel;

  // 验证渠道 ID 合法
  if (!CHANNEL_DEFINITIONS.find((d) => d.id === channelId)) {
    return c.json({ error: '无效的渠道 ID' }, 400);
  }

  const body = await c.req.json<{ fields: Record<string, string> }>();

  if (!body.fields || typeof body.fields !== 'object') {
    return c.json({ error: '无效的配置数据' }, 400);
  }

  // 保存该渠道的配置
  await saveUserChannelSetting(username, channelId, body.fields, c.env);

  // 返回更新后的状态
  const settings = await loadUserChannelSettings(username, c.env);
  const channels = getChannelConfigs(settings);

  return c.json({
    success: true,
    message: `${CHANNEL_DEFINITIONS.find((d) => d.id === channelId)?.name} 设置已保存`,
    channels,
  });
});

/** 获取订阅列表 */
adminApi.get('/subscriptions', async (c) => {
  const subscriptions = await getAllSubscriptions(c.env);
  return c.json({ total: subscriptions.length, subscriptions });
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
