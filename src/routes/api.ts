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
import {
  uploadBackupToEndpoint, listBackupsFromEndpoint, restoreBackupFromEndpoint, deleteBackupFromEndpoint,
  getBackupEndpoints, saveBackupEndpoints, deleteBackupEndpoint, testBackupEndpoint,
  executeAllBackups, migrateOldS3Config, type BackupEndpoint, type EndpointType
} from '../services/backup';

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
      // 跳过非用户数据键（如 s3_config）
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
        } catch {}
      }
    }
    return c.json({ error: '无效的 API Key' }, 401);
  }

  // 2. 使用 Token
  const token = c.req.header('X-Token') || c.req.query('token');
  if (token) {
    const list = await c.env.SUBSCRIPTIONS.list({ prefix: 'user:' });
    for (const key of list.keys) {
      if (key.name.includes(':s3_config') || key.name.includes(':apikey')) continue;
      const data = await c.env.SUBSCRIPTIONS.get(key.name);
      if (data) {
        try {
          const user = JSON.parse(data);
          if (user.token === token && user.expiresAt > Date.now()) {
            c.set('username', key.name.replace('user:', ''));
            await next();
            return;
          }
        } catch {}
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
// 多备份端接口
// ============================================

/** 获取所有备份端 */
adminApi.get('/backup-endpoints', async (c) => {
  const username = c.get('username');
  await migrateOldS3Config(c.env, username);
  const endpoints = await getBackupEndpoints(c.env, username);
  return c.json({ endpoints });
});

/** 添加备份端 */
adminApi.post('/backup-endpoints', async (c) => {
  const username = c.get('username');
  const body = await c.req.json<BackupEndpoint>();
  
  if (!body.name || !body.type) {
    return c.json({ error: '请提供名称和类型' }, 400);
  }
  
  const endpoints = await getBackupEndpoints(c.env, username);
  const newEndpoint: BackupEndpoint = {
    ...body,
    id: crypto.randomUUID(),
    enabled: body.enabled ?? true,
    schedule: body.schedule || { enabled: false, interval: 24, startTime: '02:00' },
    retention: body.retention || 30,
  };
  
  endpoints.push(newEndpoint);
  await saveBackupEndpoints(c.env, username, endpoints);
  return c.json({ success: true, endpoint: newEndpoint });
});

/** 更新备份端 */
adminApi.put('/backup-endpoints/:id', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const body = await c.req.json<Partial<BackupEndpoint>>();
  
  const endpoints = await getBackupEndpoints(c.env, username);
  const index = endpoints.findIndex(e => e.id === id);
  if (index === -1) {
    return c.json({ error: '备份端不存在' }, 404);
  }
  
  // 合并更新
  endpoints[index] = { ...endpoints[index], ...body };
  await saveBackupEndpoints(c.env, username, endpoints);
  return c.json({ success: true, endpoint: endpoints[index] });
});

/** 删除备份端 */
adminApi.delete('/backup-endpoints/:id', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  
  const success = await deleteBackupEndpoint(c.env, username, id);
  if (!success) {
    return c.json({ error: '备份端不存在' }, 404);
  }
  return c.json({ success: true, message: '备份端已删除' });
});

/** 测试备份端连接 */
adminApi.post('/backup-endpoints/:id/test', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  
  console.log(`[Test Endpoint] id=${id}, body.type=${body.type}, body.config=`, body.config);
  
  let endpoint;
  
  if (id === 'new') {
    // 测试新配置的连接（必须传入 type 和 config）
    if (!body.type || !body.config) {
      return c.json({ error: '测试新配置需要传入 type 和 config' }, 400);
    }
    endpoint = {
      id: 'new',
      name: '新备份端',
      type: body.type,
      enabled: false,
      config: body.config,
      schedule: { enabled: false, interval: 24, startTime: '02:00' },
      retention: 30,
    };
  } else {
    // 测试已保存的配置
    const endpoints = await getBackupEndpoints(c.env, username);
    endpoint = endpoints.find(e => e.id === id);
    if (!endpoint) {
      return c.json({ error: '备份端不存在' }, 404);
    }
  }
  
  const result = await testBackupEndpoint(endpoint);
  return c.json(result);
});

/** 测试新配置（不需要 ID） */
adminApi.post('/backup-endpoints/test', async (c) => {
  const body = await c.req.json();
  
  console.log(`[Test New Endpoint] body=`, body);
  
  if (!body.type || !body.config) {
    return c.json({ error: '需要传入 type 和 config' }, 400);
  }
  
  const endpoint: BackupEndpoint = {
    id: 'new',
    name: '新备份端',
    type: body.type,
    enabled: false,
    config: body.config,
    schedule: { enabled: false, interval: 24, startTime: '02:00' },
    retention: 30,
  };
  
  const result = await testBackupEndpoint(endpoint);
  return c.json(result);
});

/** 列出指定备份端的备份 */
adminApi.get('/backup-endpoints/:id/backups', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  
  const endpoints = await getBackupEndpoints(c.env, username);
  const endpoint = endpoints.find(e => e.id === id);
  if (!endpoint) {
    return c.json({ error: '备份端不存在' }, 404);
  }
  
  try {
    const list = await listBackupsFromEndpoint(c.env, username, endpoint);
    return c.json({ backups: list });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/** 从指定备份端恢复 */
adminApi.post('/backup-endpoints/:id/restore', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const { key } = await c.req.json<{ key: string }>();
  
  if (!key) {
    return c.json({ error: '请提供备份文件 key' }, 400);
  }
  
  const endpoints = await getBackupEndpoints(c.env, username);
  const endpoint = endpoints.find(e => e.id === id);
  if (!endpoint) {
    return c.json({ error: '备份端不存在' }, 404);
  }
  
  const result = await restoreBackupFromEndpoint(c.env, username, endpoint, key);
  return c.json(result);
});

/** 删除指定备份端的备份 */
adminApi.delete('/backup-endpoints/:id/backups', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const { key } = await c.req.json<{ key: string }>();
  
  if (!key) {
    return c.json({ error: '请提供备份文件 key' }, 400);
  }
  
  const endpoints = await getBackupEndpoints(c.env, username);
  const endpoint = endpoints.find(e => e.id === id);
  if (!endpoint) {
    return c.json({ error: '备份端不存在' }, 404);
  }
  
  const result = await deleteBackupFromEndpoint(c.env, username, endpoint, key);
  return c.json(result);
});

/** 手动触发所有启用的备份 */
adminApi.post('/backup-all', async (c) => {
  const username = c.get('username');
  const results = await executeAllBackups(c.env, username);
  return c.json({ results });
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
