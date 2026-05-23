// ============================================
// API 路由
// 所有 REST API 接口的集中定义
//
// 路由结构:
//   /api/vapid-key          GET   - 获取 VAPID 公钥（公开）
//   /api/subscribe          POST  - 订阅 Web Push（公开）
//   /api/unsubscribe        POST  - 取消订阅（公开）
//   /api/admin/channels     GET   - 获取渠道配置（需认证）
//   /api/admin/subscriptions GET  - 获取订阅列表（需认证）
//   /api/admin/push         POST  - 发送推送（需认证）
// ============================================
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, PushSubscription, PushRequest } from '../types';
import { addSubscription, removeSubscription, getAllSubscriptions } from '../services/webpush';
import { dispatchPush, getChannelConfigs } from '../services/dispatcher';

export const api = new Hono<{ Bindings: Env }>();

// 所有 API 允许跨域
api.use('/*', cors());

// ============================================
// 公开接口（无需认证）
// ============================================

/**
 * 获取 VAPID 公钥
 * 前端订阅页面需要此公钥来生成推送订阅
 */
api.get('/vapid-key', (c) => {
  return c.json({ publicKey: c.env.VAPID_PUBLIC_KEY });
});

/**
 * 订阅 Web Push
 * 浏览器生成订阅对象后，发送到此接口保存
 */
api.post('/subscribe', async (c) => {
  const subscription: PushSubscription = await c.req.json();

  if (!subscription.endpoint || !subscription.keys) {
    return c.json({ error: '无效的订阅对象' }, 400);
  }

  await addSubscription(subscription, c.env);
  return c.json({ success: true, message: '订阅成功' });
});

/**
 * 取消订阅 Web Push
 */
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

/**
 * 认证中间件
 * 支持 Authorization Bearer 和 URL 参数两种方式
 */
adminApi.use('/*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const urlPassword = c.req.query('password');
  const token = authHeader?.replace('Bearer ', '') || urlPassword;

  if (token !== c.env.ADMIN_PASSWORD) {
    return c.json({ error: '未授权' }, 401);
  }
  await next();
});

/**
 * 获取已配置的推送渠道列表
 * 前端管理后台用此接口展示哪些渠道可用
 */
adminApi.get('/channels', (c) => {
  const channels = getChannelConfigs(c.env);
  return c.json({ channels });
});

/**
 * 获取 Web Push 订阅列表
 */
adminApi.get('/subscriptions', async (c) => {
  const subscriptions = await getAllSubscriptions(c.env);
  return c.json({
    total: subscriptions.length,
    subscriptions,
  });
});

/**
 * 发送推送消息
 * 支持指定渠道或推送到所有已启用渠道
 *
 * 请求体:
 * {
 *   "title": "标题",          // 必填
 *   "body": "内容",           // 可选
 *   "url": "https://...",     // 可选
 *   "channels": ["wework"]    // 可选，不填则推送到所有已启用渠道
 * }
 */
adminApi.post('/push', async (c) => {
  const body: PushRequest = await c.req.json();

  if (!body.title) {
    return c.json({ error: '请输入标题' }, 400);
  }

  // 调用推送调度器，分发到各渠道
  const results = await dispatchPush(body, body.channels, c.env);

  // 汇总结果
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
