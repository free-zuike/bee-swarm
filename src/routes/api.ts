// ============================================
// API 路由
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
  getPushHistory,
} from '../services/dispatcher';

export const api = new Hono<{ Bindings: Env; Variables: { username: string } }>();

api.use('/*', cors());

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ============================================
// 公开接口
// ============================================

api.post('/register', async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();
  const { email, password } = body;

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

api.post('/login', async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();
  const { email, password } = body;

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

/** 获取或生成 API Key */
api.get('/apikey', async (c) => {
  const username = c.req.query('username');
  const password = c.req.query('password');

  if (!username || !password) {
    return c.json({ error: '请提供用户名和密码' }, 401);
  }

  // 验证用户
  const userData = await c.env.SUBSCRIPTIONS.get(`user:${username}`);
  if (!userData) {
    return c.json({ error: '用户不存在' }, 401);
  }

  const { password: hashed, apikey } = JSON.parse(userData);
  const inputHashed = await hashPassword(password);
  if (inputHashed !== hashed) {
    return c.json({ error: '密码错误' }, 401);
  }

  // 如果已有 API Key 则返回，否则生成新的
  if (apikey) {
    return c.json({ apikey });
  }

  // 生成新的 API Key
  const newApikey = crypto.randomUUID().replace(/-/g, '');
  await c.env.SUBSCRIPTIONS.put(`user:${username}`, JSON.stringify({ password: hashed, apikey: newApikey }));
  return c.json({ apikey: newApikey });
});

// ============================================
// 管理接口
// ============================================
const adminApi = new Hono<{ Bindings: Env; Variables: { username: string } }>();

adminApi.use('/*', async (c, next) => {
  // 优先使用 API Key 认证
  const apiKey = c.req.header('X-API-Key') || c.req.query('apikey');
  if (apiKey) {
    // 遍历所有用户查找匹配的 API Key
    const list = await c.env.SUBSCRIPTIONS.list({ prefix: 'user:' });
    for (const key of list.keys) {
      const data = await c.env.SUBSCRIPTIONS.get(key.name);
      if (data) {
        const user = JSON.parse(data);
        if (user.apikey === apiKey) {
          const username = key.name.replace('user:', '');
          c.set('username', username);
          await next();
          return;
        }
      }
    }
    return c.json({ error: '无效的 API Key' }, 401);
  }

  // 回退到用户名密码认证
  const username = c.req.query('username');
  const password = c.req.query('password') || c.req.header('X-Password') || '';

  if (!username || !password) {
    return c.json({ error: '请提供认证信息' }, 401);
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

adminApi.get('/channels', async (c) => {
  const username = c.get('username');
  const settings = await loadUserChannelSettings(username, c.env);
  const channels = getChannelConfigs(settings);

  return c.json({ channels, settings, definitions: CHANNEL_DEFINITIONS });
});

adminApi.put('/channels/:id', async (c) => {
  const username = c.get('username');
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

adminApi.post('/push', async (c) => {
  const username = c.get('username');
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

/** 获取推送记录 */
adminApi.get('/history', async (c) => {
  const username = c.get('username');
  const history = await getPushHistory(username, c.env);
  return c.json({ history });
});

// ============================================
// 测试接口（无需认证）
// ============================================

/** 测试 Bark 配置 */
api.get('/test/bark', async (c) => {
  const key = c.req.query('key');
  const server = c.req.query('server') || 'https://api.day.app';

  if (!key) {
    return c.json({ error: '请提供 Bark Key' }, 400);
  }

  try {
    // 发送测试请求（不实际推送，只验证 key 是否有效）
    const testUrl = `${server}/${key}/测试标题/这是一条测试消息`;
    const res = await fetch(testUrl);
    const data = await res.json() as { code: number; message: string };

    if (data.code === 200) {
      return c.json({
        success: true,
        message: 'Bark Key 有效',
        note: '请确保 iOS 设备已安装 Bark App 并启用推送',
      });
    }

    return c.json({
      success: false,
      message: `Bark 测试失败: ${data.message}`,
      code: data.code,
    });
  } catch (err: any) {
    return c.json({
      success: false,
      message: `请求异常: ${err.message}`,
    });
  }
});

api.route('/admin', adminApi);
export default api;
