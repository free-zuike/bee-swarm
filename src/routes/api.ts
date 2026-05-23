// ============================================
// API 路由
// 所有 REST API 接口的集中定义
//
// 路由结构:
//   /api/vapid-key          GET   - 获取 VAPID 公钥（公开）
//   /api/subscribe          POST  - 订阅 Web Push（公开）
//   /api/unsubscribe        POST  - 取消订阅（公开）
//   /api/setup              POST  - 首次设置密码（公开，仅一次）
//   /api/status             GET   - 检查是否已初始化（公开）
//   /api/admin/channels     GET   - 获取渠道配置（需认证）
//   /api/admin/channels     PUT   - 保存渠道设置（需认证）
//   /api/admin/subscriptions GET  - 获取订阅列表（需认证）
//   /api/admin/push         POST  - 发送推送（需认证）
// ============================================
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, PushSubscription, PushRequest, ChannelSettings } from '../types';
import { addSubscription, removeSubscription, getAllSubscriptions } from '../services/webpush';
import {
  dispatchPush,
  getChannelConfigs,
  loadChannelSettings,
  saveChannelSettings,
  CHANNEL_DEFINITIONS,
} from '../services/dispatcher';

export const api = new Hono<{ Bindings: Env }>();

// 所有 API 允许跨域
api.use('/*', cors());

// ============================================
// 公开接口（无需认证）
// ============================================

/** 获取 VAPID 公钥 */
api.get('/vapid-key', (c) => {
  return c.json({ publicKey: c.env.VAPID_PUBLIC_KEY });
});

/** 检查是否已初始化 */
api.get('/status', async (c) => {
  const password = await c.env.SUBSCRIPTIONS.get('config:admin_password');
  return c.json({ initialized: !!password });
});

/** 首次设置管理密码 */
api.post('/setup', async (c) => {
  const { password } = await c.req.json<{ password: string }>();

  if (!password || password.length < 4) {
    return c.json({ error: '密码长度至少 4 位' }, 400);
  }

  const existing = await c.env.SUBSCRIPTIONS.get('config:admin_password');
  if (existing) {
    return c.json({ error: '密码已设置，无法重复初始化' }, 403);
  }

  await c.env.SUBSCRIPTIONS.put('config:admin_password', password);
  return c.json({ success: true, message: '密码设置成功' });
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
// 管理接口（需要密码认证）
// ============================================
const adminApi = new Hono<{ Bindings: Env }>();

/** 认证中间件 */
adminApi.use('/*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const urlPassword = c.req.query('password');
  const token = authHeader?.replace('Bearer ', '') || urlPassword;

  const storedPassword = await c.env.SUBSCRIPTIONS.get('config:admin_password');

  if (!storedPassword) {
    return c.json({ error: '系统未初始化，请先设置密码' }, 403);
  }

  if (token !== storedPassword) {
    return c.json({ error: '密码错误' }, 401);
  }
  await next();
});

/**
 * 获取渠道配置（包含当前设置值和渠道定义）
 */
adminApi.get('/channels', async (c) => {
  const settings = await loadChannelSettings(c.env);
  const channels = getChannelConfigs(settings);

  return c.json({
    channels,
    settings,
    definitions: CHANNEL_DEFINITIONS,
  });
});

/**
 * 保存渠道设置
 */
adminApi.put('/channels', async (c) => {
  const body = await c.req.json<{ settings: ChannelSettings }>();

  if (!body.settings || typeof body.settings !== 'object') {
    return c.json({ error: '无效的设置数据' }, 400);
  }

  await saveChannelSettings(c.env, body.settings);

  // 返回更新后的渠道状态
  const channels = getChannelConfigs(body.settings);
  return c.json({
    success: true,
    message: '渠道设置已保存',
    channels,
  });
});

/** 获取 Web Push 订阅列表 */
adminApi.get('/subscriptions', async (c) => {
  const subscriptions = await getAllSubscriptions(c.env);
  return c.json({
    total: subscriptions.length,
    subscriptions,
  });
});

/** 发送推送消息 */
adminApi.post('/push', async (c) => {
  const body: PushRequest = await c.req.json();

  if (!body.title) {
    return c.json({ error: '请输入标题' }, 400);
  }

  const results = await dispatchPush(body, body.channels, c.env);

  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;

  return c.json({
    success: failedCount === 0,
    message: `推送完成: ${successCount} 成功, ${failedCount} 失败`,
    results,
  });
});

// 挂载管理路由到 /api/admin
api.route('/admin', adminApi);

export default api;
