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
import { uploadBackup, listBackups, restoreBackup, deleteBackup } from '../services/backup';

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
  // 优先使用 Token 认证
  const token = c.req.header('X-Token') || c.req.query('token');
  let username: string | null = null;

  if (token) {
    const list = await c.env.SUBSCRIPTIONS.list({ prefix: 'user:' });
    for (const key of list.keys) {
      const data = await c.env.SUBSCRIPTIONS.get(key.name);
      if (data) {
        const user = JSON.parse(data);
        if (user.token === token && user.expiresAt > Date.now()) {
          username = key.name.replace('user:', '');
          break;
        }
      }
    }
  }

  // 回退到用户名密码认证
  if (!username) {
    const queryUsername = c.req.query('username');
    const queryPassword = c.req.query('password');

    if (!queryUsername || !queryPassword) {
      return c.json({ error: '请提供认证信息' }, 401);
    }

    const userData = await c.env.SUBSCRIPTIONS.get(`user:${queryUsername}`);
    if (!userData) {
      return c.json({ error: '用户不存在' }, 401);
    }

    const user = JSON.parse(userData);
    const inputHashed = await hashPassword(queryPassword);
    if (inputHashed !== user.password) {
      return c.json({ error: '密码错误' }, 401);
    }

    username = queryUsername;
  }

  if (!username) {
    return c.json({ error: '认证失败' }, 401);
  }

  // 获取或生成 API Key
  const userData = await c.env.SUBSCRIPTIONS.get(`user:${username}`);
  const user = JSON.parse(userData!);
  const { apikey } = user;

  const forceRefresh = c.req.query('refresh') === 'true';

  if (apikey && !forceRefresh) {
    return c.json({ apikey });
  }

  // 生成新的 API Key
  const newApikey = crypto.randomUUID().replace(/-/g, '');
  user.apikey = newApikey;
  await c.env.SUBSCRIPTIONS.put(`user:${username}`, JSON.stringify(user));
  return c.json({ apikey: newApikey });
});

/** 获取访问 Token */
api.post('/token', async (c) => {
  const { email, password } = await c.req.json();

  if (!email || !password) {
    return c.json({ error: '请提供邮箱和密码' }, 400);
  }

  const userData = await c.env.SUBSCRIPTIONS.get(`user:${email}`);
  if (!userData) {
    return c.json({ error: '用户不存在' }, 401);
  }

  const user = JSON.parse(userData);
  const inputHashed = await hashPassword(password);
  if (inputHashed !== user.password) {
    return c.json({ error: '密码错误' }, 401);
  }

  // 生成 token
  const token = crypto.randomUUID().replace(/-/g, '');
  const refreshToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 天后过期

  user.token = token;
  user.refreshToken = refreshToken;
  user.expiresAt = expiresAt;
  await c.env.SUBSCRIPTIONS.put(`user:${email}`, JSON.stringify(user));

  return c.json({ token, refreshToken, expiresAt });
});

/** 刷新 Token */
api.post('/refresh', async (c) => {
  const { refreshToken } = await c.req.json();

  if (!refreshToken) {
    return c.json({ error: '请提供 refresh token' }, 400);
  }

  // 查找用户
  const list = await c.env.SUBSCRIPTIONS.list({ prefix: 'user:' });
  for (const key of list.keys) {
    const data = await c.env.SUBSCRIPTIONS.get(key.name);
    if (data) {
      const user = JSON.parse(data);
      if (user.refreshToken === refreshToken) {
        // 生成新 token
        const token = crypto.randomUUID().replace(/-/g, '');
        const newRefreshToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
        const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

        user.token = token;
        user.refreshToken = newRefreshToken;
        user.expiresAt = expiresAt;
        await c.env.SUBSCRIPTIONS.put(key.name, JSON.stringify(user));

        return c.json({ token, refreshToken: newRefreshToken, expiresAt });
      }
    }
  }

  return c.json({ error: '无效的 refresh token' }, 401);
});

// ============================================
// 管理接口
// ============================================
const adminApi = new Hono<{ Bindings: Env; Variables: { username: string } }>();

adminApi.use('/*', async (c, next) => {
  // 1. 优先使用 API Key
  const apiKey = c.req.header('X-API-Key') || c.req.query('apikey');
  if (apiKey) {
    const list = await c.env.SUBSCRIPTIONS.list({ prefix: 'user:' });
    for (const key of list.keys) {
      const data = await c.env.SUBSCRIPTIONS.get(key.name);
      if (data) {
        const user = JSON.parse(data);
        if (user.apikey === apiKey) {
          c.set('username', key.name.replace('user:', ''));
          await next();
          return;
        }
      }
    }
    return c.json({ error: '无效的 API Key' }, 401);
  }

  // 2. 使用 Token
  const token = c.req.header('X-Token') || c.req.query('token');
  if (token) {
    const list = await c.env.SUBSCRIPTIONS.list({ prefix: 'user:' });
    for (const key of list.keys) {
      const data = await c.env.SUBSCRIPTIONS.get(key.name);
      if (data) {
        const user = JSON.parse(data);
        if (user.token === token && user.expiresAt > Date.now()) {
          c.set('username', key.name.replace('user:', ''));
          await next();
          return;
        }
      }
    }
    return c.json({ error: '无效或已过期的 Token' }, 401);
  }

  // 3. 回退到用户名密码
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

  // 检查必填字段是否都清空了，如果是则自动禁用；如果填了则自动启用
  // 注意：只传 enabled 时不触发此逻辑
  const def = CHANNEL_DEFINITIONS.find((d) => d.id === channelId);
  if (def && Object.keys(body.fields).some(k => k !== 'enabled')) {
    const requiredFields = def.fields.filter((f) => f.required);
    const allEmpty = requiredFields.every((f) => !body.fields[f.key]);
    const allFilled = requiredFields.every((f) => !!body.fields[f.key]);
    if (allEmpty) {
      await saveUserChannelSetting(username, channelId, { enabled: 'false' }, c.env);
    } else if (allFilled) {
      await saveUserChannelSetting(username, channelId, { enabled: 'true' }, c.env);
    }
  }

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
// 备份接口
// ============================================

/** 手动触发备份 */
adminApi.post('/backup', async (c) => {
  const result = await uploadBackup(c.env);
  return c.json(result);
});

/** 列出所有备份 */
adminApi.get('/backups', async (c) => {
  try {
    const list = await listBackups(c.env);
    return c.json({ backups: list });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/** 从备份恢复 */
adminApi.post('/backup/restore', async (c) => {
  const { key } = await c.req.json<{ key: string }>();

  if (!key) {
    return c.json({ error: '请提供备份文件 key' }, 400);
  }

  const result = await restoreBackup(c.env, key);
  const status = result.success ? 200 : 500;
  return c.json(result, status);
});

/** 删除指定备份 */
adminApi.delete('/backup', async (c) => {
  const { key } = await c.req.json<{ key: string }>();

  if (!key) {
    return c.json({ error: '请提供备份文件 key' }, 400);
  }

  const result = await deleteBackup(c.env, key);
  const status = result.success ? 200 : 500;
  return c.json(result, status);
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
