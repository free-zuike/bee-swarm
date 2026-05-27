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
  getBackupEndpoints, saveBackupEndpoints, saveBackupEndpoint, deleteBackupEndpoint, testBackupEndpoint,
  executeAllBackups, migrateOldS3Config, type BackupEndpoint, type EndpointType
} from '../services/backup';

export const api = new Hono<{ Bindings: Env; Variables: { username: string } }>();

api.use('/*', cors());

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  // 生成随机 salt
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  
  // PBKDF2 哈希（100,000 次迭代）
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const hashHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) {
    // 兼容旧版 SHA-256 格式（无 salt）
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const inputHashed = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return inputHashed === stored;
  }
  
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const computedHash = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return computedHash === hashHex;
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
  if (!password || password.length < 8) {
    return c.json({ error: '密码长度至少 8 位' }, 400);
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
  const valid = await verifyPassword(password, hashed);

  if (!valid) {
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
    const indexedUser = await c.env.SUBSCRIPTIONS.get(`token_index:${token}`);
    if (indexedUser) {
      const userData = await c.env.SUBSCRIPTIONS.get(`user:${indexedUser}`);
      if (userData) {
        try {
          const user = JSON.parse(userData);
          if (user.token === token && user.expiresAt > Date.now()) {
            username = indexedUser;
          }
        } catch {}
      }
    }
    // 回退到遍历查找（兼容旧 token 无索引的情况）
    if (!username) {
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
    const valid = await verifyPassword(queryPassword, user.password);
    if (!valid) {
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

  // 如果有旧 apikey，删除旧索引
  if (user.apikey) {
    await c.env.SUBSCRIPTIONS.delete(`apikey_index:${user.apikey}`);
  }

  user.apikey = newApikey;
  await c.env.SUBSCRIPTIONS.put(`user:${username}`, JSON.stringify(user));

  // 创建 apikey 索引
  await c.env.SUBSCRIPTIONS.put(`apikey_index:${newApikey}`, username, { expirationTtl: 365 * 24 * 60 * 60 });

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
  const valid = await verifyPassword(password, user.password);
  if (!valid) {
    return c.json({ error: '密码错误' }, 401);
  }

  // 生成 token
  const token = crypto.randomUUID().replace(/-/g, '');
  const refreshToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 天后过期
  const refreshExpiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30天

  // 如果有旧 token，删除旧索引
  if (user.token) {
    await c.env.SUBSCRIPTIONS.delete(`token_index:${user.token}`);
  }

  user.token = token;
  user.refreshToken = refreshToken;
  user.expiresAt = expiresAt;
  user.refreshExpiresAt = refreshExpiresAt;
  await c.env.SUBSCRIPTIONS.put(`user:${email}`, JSON.stringify(user));

  // 创建 token 索引
  await c.env.SUBSCRIPTIONS.put(`token_index:${token}`, email, { expirationTtl: 7 * 24 * 60 * 60 });

  return c.json({ token, refreshToken, expiresAt });
});

/** 刷新 Token */
api.post('/refresh', async (c) => {
  const { refreshToken } = await c.req.json();

  if (!refreshToken) {
    return c.json({ error: '请提供 refresh token' }, 400);
  }

  // 使用 token_index 快速查找
  const indexedUser = await c.env.SUBSCRIPTIONS.get(`token_index:${refreshToken}`);
  if (indexedUser) {
    const userData = await c.env.SUBSCRIPTIONS.get(`user:${indexedUser}`);
    if (userData) {
      try {
        const user = JSON.parse(userData);
        if (user.refreshToken === refreshToken) {
          // 检查 refreshToken 是否过期（refreshToken 有效期 30 天）
          if (!user.refreshExpiresAt || user.refreshExpiresAt < Date.now()) {
            return c.json({ error: 'Refresh token 已过期，请重新登录' }, 401);
          }

          // 生成新 token
          const token = crypto.randomUUID().replace(/-/g, '');
          const newRefreshToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
          const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
          const refreshExpiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30天

          // 删除旧索引，创建新索引
          await c.env.SUBSCRIPTIONS.delete(`token_index:${user.token}`);
          await c.env.SUBSCRIPTIONS.put(`token_index:${token}`, indexedUser, { expirationTtl: 7 * 24 * 60 * 60 });
          await c.env.SUBSCRIPTIONS.delete(`token_index:${user.refreshToken}`);
          await c.env.SUBSCRIPTIONS.put(`token_index:${newRefreshToken}`, indexedUser, { expirationTtl: 7 * 24 * 60 * 60 });

          user.token = token;
          user.refreshToken = newRefreshToken;
          user.expiresAt = expiresAt;
          user.refreshExpiresAt = refreshExpiresAt;
          await c.env.SUBSCRIPTIONS.put(`user:${indexedUser}`, JSON.stringify(user));

          return c.json({ token, refreshToken: newRefreshToken, expiresAt });
        }
      } catch {}
    }
  }

  // 回退到遍历查找（兼容旧 token 无索引的情况）
  const list = await c.env.SUBSCRIPTIONS.list({ prefix: 'user:' });
  for (const key of list.keys) {
    const data = await c.env.SUBSCRIPTIONS.get(key.name);
    if (data) {
      const user = JSON.parse(data);
      if (user.refreshToken === refreshToken) {
        // 检查 refreshToken 是否过期（refreshToken 有效期 30 天）
        if (!user.refreshExpiresAt || user.refreshExpiresAt < Date.now()) {
          return c.json({ error: 'Refresh token 已过期，请重新登录' }, 401);
        }

        // 生成新 token
        const token = crypto.randomUUID().replace(/-/g, '');
        const newRefreshToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
        const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
        const refreshExpiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30天

        // 删除旧索引，创建新索引
        await c.env.SUBSCRIPTIONS.delete(`token_index:${user.token}`);
        await c.env.SUBSCRIPTIONS.put(`token_index:${token}`, key.name.replace('user:', ''), { expirationTtl: 7 * 24 * 60 * 60 });
        await c.env.SUBSCRIPTIONS.delete(`token_index:${user.refreshToken}`);
        await c.env.SUBSCRIPTIONS.put(`token_index:${newRefreshToken}`, key.name.replace('user:', ''), { expirationTtl: 7 * 24 * 60 * 60 });

        user.token = token;
        user.refreshToken = newRefreshToken;
        user.expiresAt = expiresAt;
        user.refreshExpiresAt = refreshExpiresAt;
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
    // 使用 apikey_index 快速查找
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
        } catch {}
      }
    }
    // 回退到遍历查找（兼容旧 apikey 无索引的情况）
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
        } catch {}
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
        } catch {}
      }
    }
    return c.json({ error: '无效或已过期的 Token' }, 401);
  }

  return c.json({ error: '请提供认证信息' }, 401);
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
  
  // 返回时隐藏密钥
  const safeEndpoints = endpoints.map(e => {
    const safe = { ...e, config: { ...e.config } };
    if (safe.config) {
      if ('secretAccessKey' in safe.config) {
        delete (safe.config as any).secretAccessKey;
      }
      if ('password' in safe.config) {
        delete (safe.config as any).password;
      }
    }
    return safe;
  });
  
  return c.json({ endpoints: safeEndpoints });
});

/** 添加备份端 */
adminApi.post('/backup-endpoints', async (c) => {
  const username = c.get('username');
  const body = await c.req.json<BackupEndpoint>();
  
  console.log(`[Add Endpoint] Adding endpoint: ${body.name}, type=${body.type}`);
  
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
  
  // 返回时不包含密钥
  const returnedEndpoint = { ...newEndpoint, config: { ...newEndpoint.config } };
  if (returnedEndpoint.config) {
    if ('secretAccessKey' in returnedEndpoint.config) {
      delete (returnedEndpoint.config as any).secretAccessKey;
    }
    if ('password' in returnedEndpoint.config) {
      delete (returnedEndpoint.config as any).password;
    }
  }
  return c.json({ success: true, endpoint: returnedEndpoint });
});

/** 更新备份端 */
adminApi.put('/backup-endpoints/:id', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const body = await c.req.json<Partial<BackupEndpoint>>();
  
  console.log(`[Update Endpoint] id=${id}`);
  
  const endpoints = await getBackupEndpoints(c.env, username);
  const index = endpoints.findIndex(e => e.id === id);
  if (index === -1) {
    return c.json({ error: '备份端不存在' }, 404);
  }
  
  // 保留原有的密钥（如果新配置中没有提供）
  // 使用 'in' 操作符检查属性是否存在，而不是检查值是否falsy
  const existingConfig = endpoints[index].config;
  if (body.config && existingConfig) {
    // 检查 secretAccessKey 是否存在于原配置中
    const hasOriginalSecret = 'secretAccessKey' in existingConfig && (existingConfig as any).secretAccessKey;
    const hasNewSecret = 'secretAccessKey' in (body.config || {}) && (body.config as any).secretAccessKey;
    
    if (hasOriginalSecret && !hasNewSecret) {
      // 原配置有密钥，新配置没有，保留原密钥
      (body.config as any).secretAccessKey = (existingConfig as any).secretAccessKey;
    }
    
    // 同样处理 password
    const hasOriginalPassword = 'password' in existingConfig && (existingConfig as any).password;
    const hasNewPassword = 'password' in (body.config || {}) && (body.config as any).password;
    
    if (hasOriginalPassword && !hasNewPassword) {
      (body.config as any).password = (existingConfig as any).password;
    }
  }
  
  // 合并更新
  endpoints[index] = { ...endpoints[index], ...body };
  await saveBackupEndpoints(c.env, username, endpoints);
  
  // 返回时不包含密钥
  const returnedEndpoint = { ...endpoints[index], config: { ...endpoints[index].config } };
  if (returnedEndpoint.config) {
    if ('secretAccessKey' in returnedEndpoint.config) {
      delete (returnedEndpoint.config as any).secretAccessKey;
    }
    if ('password' in returnedEndpoint.config) {
      delete (returnedEndpoint.config as any).password;
    }
  }
  return c.json({ success: true, endpoint: returnedEndpoint });
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
  
    console.log(`[Test Endpoint] id=${id}, type=${body.type}`);
  
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
    console.log(`[Test Endpoint] Testing NEW config, type=${endpoint.type}`);
  } else {
    // 测试已保存的配置 - 从 KV 读取完整配置，忽略请求体
    const endpoints = await getBackupEndpoints(c.env, username);
    endpoint = endpoints.find(e => e.id === id);
    if (!endpoint) {
      return c.json({ error: '备份端不存在' }, 404);
    }
    
    // 检查是否有密钥
    const hasSecret = (endpoint.config as any)?.secretAccessKey || (endpoint.config as any)?.password;
    console.log(`[Test Endpoint] Testing SAVED config, hasSecret=${!!hasSecret}`);
    
    if (!hasSecret) {
      return c.json({ 
        success: false, 
        message: '密钥未配置，请先编辑并保存密钥后重试' 
      });
    }
  }
  
  const result = await testBackupEndpoint(endpoint);
  console.log(`[Test Endpoint] Result: success=${result.success}`);
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

/** 手动触发单个备份端备份 */
adminApi.post('/backup-endpoints/:id/backup', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  
  const endpoints = await getBackupEndpoints(c.env, username);
  const endpoint = endpoints.find(e => e.id === id);
  if (!endpoint) {
    return c.json({ error: '备份端不存在' }, 404);
  }
  
  const result = await uploadBackupToEndpoint(c.env, username, endpoint);
  result.endpointName = endpoint.name;
  
  // 更新最后备份状态
  endpoint.lastBackup = {
    time: new Date().toISOString(),
    status: result.success ? 'success' : 'failed',
    message: result.message,
  };
  await saveBackupEndpoint(c.env, username, endpoint);
  
  return c.json(result);
});

// ============================================
// 测试接口（需要认证）
// ============================================

/** 测试 Bark 配置 */
adminApi.get('/test/bark', async (c) => {
  const key = c.req.query('key');
  const server = c.req.query('server') || 'https://api.day.app';

  if (!key) {
    return c.json({ error: '请提供 Bark Key' }, 400);
  }

  // 验证 server 必须是合法的 HTTPS URL，防止 SSRF
  try {
    const serverUrl = new URL(server);
    if (serverUrl.protocol !== 'https:') {
      return c.json({ error: 'Server 必须是 HTTPS URL' }, 400);
    }
  } catch {
    return c.json({ error: 'Server 必须是合法的 URL' }, 400);
  }

  // 验证 key 只允许字母数字字符
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
    return c.json({ error: 'Bark Key 包含非法字符' }, 400);
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
