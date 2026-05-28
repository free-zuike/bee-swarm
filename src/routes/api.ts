// ============================================
// API 路由
// ============================================
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, PushRequest, PushChannel } from '../types';
import { hashPassword, verifyPassword } from '../utils/password';
import { authMiddleware } from '../middleware/auth';
import { validateBody, schemas } from '../middleware/validation';
import { filterSensitiveConfig } from '../utils/config';
import {
  dispatchPush,
  getChannelConfigs,
  loadUserChannelSettings,
  saveUserChannelSetting,
  CHANNEL_DEFINITIONS,
  getPushHistory,
} from '../services/dispatcher';
import {
  uploadBackupToEndpoint,
  listBackupsFromEndpoint,
  restoreBackupFromEndpoint,
  deleteBackupFromEndpoint,
  getBackupEndpoints,
  saveBackupEndpoints,
  saveBackupEndpoint,
  deleteBackupEndpoint,
  testBackupEndpoint,
  executeAllBackups,
  migrateOldS3Config,
  type BackupEndpoint,
  type S3Config,
  type WebDAVConfig,
} from '../services/backup';

type ValidatedContext = {
  validatedBody?: unknown;
  validatedQuery?: unknown;
};

export const api = new Hono<{ Bindings: Env; Variables: { username: string } }>();

api.use('/*', cors());

// ============================================
// 公开接口
// ============================================

api.post('/register', validateBody(schemas.register), async (c) => {
  const body = (c as ValidatedContext).validatedBody as { email: string; password: string };
  const { email, password } = body;

  const existing = await c.env.SUBSCRIPTIONS.get(`user:${email}`);
  if (existing) {
    return c.json({ error: '该邮箱已被注册', code: 'CONFLICT' }, 409);
  }

  const hashed = await hashPassword(password);
  await c.env.SUBSCRIPTIONS.put(`user:${email}`, JSON.stringify({ password: hashed }));

  return c.json({ success: true, message: '注册成功' });
});

api.post('/login', validateBody(schemas.login), async (c) => {
  const body = (c as ValidatedContext).validatedBody as { email: string; password: string };
  const { email, password } = body;

  const userData = await c.env.SUBSCRIPTIONS.get(`user:${email}`);
  if (!userData) {
    return c.json({ error: '邮箱或密码错误', code: 'AUTH_ERROR' }, 401);
  }

  const { password: hashed } = JSON.parse(userData);
  const valid = await verifyPassword(password, hashed);

  if (!valid) {
    return c.json({ error: '邮箱或密码错误', code: 'AUTH_ERROR' }, 401);
  }

  return c.json({ success: true, message: '登录成功', email });
});

/** 使用 Token 获取 API Key（推荐方式） */
api.get('/apikey', async (c) => {
  const token = c.req.header('X-Token') || c.req.query('token');

  if (!token) {
    return c.json(
      {
        error: '请使用 POST /api/apikey 或提供 Token',
        code: 'AUTH_ERROR',
        hint: 'GET 请求需要通过 X-Token header 或 token 查询参数认证',
      },
      401
    );
  }

  const indexedUser = await c.env.SUBSCRIPTIONS.get(`token_index:${token}`);
  if (!indexedUser) {
    return c.json({ error: '无效的 Token', code: 'AUTH_ERROR' }, 401);
  }

  const userData = await c.env.SUBSCRIPTIONS.get(`user:${indexedUser}`);
  if (!userData) {
    return c.json({ error: '用户不存在', code: 'AUTH_ERROR' }, 401);
  }

  let user;
  try {
    user = JSON.parse(userData);
  } catch (err) {
    console.error(`[APIKey] Failed to parse user data: ${(err as Error).message}`);
    return c.json({ error: '服务器错误', code: 'INTERNAL_ERROR' }, 500);
  }

  if (user.token !== token || user.expiresAt <= Date.now()) {
    return c.json({ error: 'Token 已过期', code: 'AUTH_ERROR' }, 401);
  }

  const forceRefresh = c.req.query('refresh') === 'true';

  if (user.apikey && !forceRefresh) {
    return c.json({ apikey: user.apikey });
  }

  const newApikey = crypto.randomUUID().replace(/-/g, '');

  if (user.apikey) {
    await c.env.SUBSCRIPTIONS.delete(`apikey_index:${user.apikey}`);
  }

  user.apikey = newApikey;
  await c.env.SUBSCRIPTIONS.put(`user:${indexedUser}`, JSON.stringify(user));
  await c.env.SUBSCRIPTIONS.put(`apikey_index:${newApikey}`, indexedUser, {
    expirationTtl: 365 * 24 * 60 * 60,
  });

  return c.json({ apikey: newApikey, message: 'API Key 已生成' });
});

/** 使用用户名密码获取 API Key（POST 方式，更安全） */
api.post('/apikey', validateBody(schemas.apikey), async (c) => {
  const body = (c as ValidatedContext).validatedBody as {
    username: string;
    password: string;
    refresh?: boolean;
  };
  const { username, password, refresh } = body;

  const userData = await c.env.SUBSCRIPTIONS.get(`user:${username}`);
  if (!userData) {
    return c.json({ error: '用户不存在', code: 'AUTH_ERROR' }, 401);
  }

  let user;
  try {
    user = JSON.parse(userData);
  } catch (err) {
    console.error(`[APIKey] Failed to parse user data: ${(err as Error).message}`);
    return c.json({ error: '服务器错误', code: 'INTERNAL_ERROR' }, 500);
  }

  const valid = await verifyPassword(password, user.password);
  if (!valid) {
    return c.json({ error: '密码错误', code: 'AUTH_ERROR' }, 401);
  }

  if (user.apikey && !refresh) {
    return c.json({ apikey: user.apikey });
  }

  const newApikey = crypto.randomUUID().replace(/-/g, '');

  if (user.apikey) {
    await c.env.SUBSCRIPTIONS.delete(`apikey_index:${user.apikey}`);
  }

  user.apikey = newApikey;
  await c.env.SUBSCRIPTIONS.put(`user:${username}`, JSON.stringify(user));
  await c.env.SUBSCRIPTIONS.put(`apikey_index:${newApikey}`, username, {
    expirationTtl: 365 * 24 * 60 * 60,
  });

  return c.json({ apikey: newApikey, message: 'API Key 已生成' });
});

api.post('/token', validateBody(schemas.token), async (c) => {
  const body = (c as ValidatedContext).validatedBody as { email: string; password: string };
  const { email, password } = body;

  const userData = await c.env.SUBSCRIPTIONS.get(`user:${email}`);
  if (!userData) {
    return c.json({ error: '用户不存在', code: 'AUTH_ERROR' }, 401);
  }

  const user = JSON.parse(userData);
  const valid = await verifyPassword(password, user.password);
  if (!valid) {
    return c.json({ error: '密码错误', code: 'AUTH_ERROR' }, 401);
  }

  const token = crypto.randomUUID().replace(/-/g, '');
  const refreshToken =
    crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const refreshExpiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

  if (user.token) {
    await c.env.SUBSCRIPTIONS.delete(`token_index:${user.token}`);
  }

  user.token = token;
  user.refreshToken = refreshToken;
  user.expiresAt = expiresAt;
  user.refreshExpiresAt = refreshExpiresAt;
  await c.env.SUBSCRIPTIONS.put(`user:${email}`, JSON.stringify(user));

  await c.env.SUBSCRIPTIONS.put(`token_index:${token}`, email, { expirationTtl: 7 * 24 * 60 * 60 });

  return c.json({ token, refreshToken, expiresAt });
});

api.post('/refresh', validateBody(schemas.refresh), async (c) => {
  const body = (c as ValidatedContext).validatedBody as { refreshToken: string };
  const { refreshToken } = body;

  const indexedUser = await c.env.SUBSCRIPTIONS.get(`token_index:${refreshToken}`);
  if (indexedUser) {
    const userData = await c.env.SUBSCRIPTIONS.get(`user:${indexedUser}`);
    if (userData) {
      try {
        const user = JSON.parse(userData);
        if (user.refreshToken === refreshToken) {
          if (!user.refreshExpiresAt || user.refreshExpiresAt < Date.now()) {
            return c.json({ error: 'Refresh token 已过期，请重新登录', code: 'AUTH_ERROR' }, 401);
          }

          const token = crypto.randomUUID().replace(/-/g, '');
          const newRefreshToken =
            crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
          const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
          const refreshExpiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

          await c.env.SUBSCRIPTIONS.delete(`token_index:${user.token}`);
          await c.env.SUBSCRIPTIONS.put(`token_index:${token}`, indexedUser, {
            expirationTtl: 7 * 24 * 60 * 60,
          });
          await c.env.SUBSCRIPTIONS.delete(`token_index:${user.refreshToken}`);
          await c.env.SUBSCRIPTIONS.put(`token_index:${newRefreshToken}`, indexedUser, {
            expirationTtl: 7 * 24 * 60 * 60,
          });

          user.token = token;
          user.refreshToken = newRefreshToken;
          user.expiresAt = expiresAt;
          user.refreshExpiresAt = refreshExpiresAt;
          await c.env.SUBSCRIPTIONS.put(`user:${indexedUser}`, JSON.stringify(user));

          return c.json({ token, refreshToken: newRefreshToken, expiresAt });
        }
      } catch (err) {
        console.error(`[Refresh] Failed to parse user data: ${(err as Error).message}`);
      }
    }
  }

  return c.json({ error: '无效的 refresh token', code: 'AUTH_ERROR' }, 401);
});

// ============================================
// 管理接口
// ============================================
const adminApi = new Hono<{ Bindings: Env; Variables: { username: string } }>();

adminApi.use('/*', authMiddleware);

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
    return c.json({ error: '无效的渠道 ID', code: 'VALIDATION_ERROR' }, 400);
  }

  const body = await c.req.json<{ fields: Record<string, string> }>();

  if (!body.fields || typeof body.fields !== 'object') {
    return c.json({ error: '无效的配置数据', code: 'VALIDATION_ERROR' }, 400);
  }

  await saveUserChannelSetting(username, channelId, body.fields, c.env);

  // 检查必填字段是否都清空了，如果是则自动禁用；如果填了则自动启用
  // 注意：只传 enabled 时不触发此逻辑
  const def = CHANNEL_DEFINITIONS.find((d) => d.id === channelId);
  if (def && Object.keys(body.fields).some((k) => k !== 'enabled')) {
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
    return c.json({ error: '请输入标题', code: 'VALIDATION_ERROR' }, 400);
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

  const safeEndpoints = endpoints.map((e) => ({
    ...e,
    config: filterSensitiveConfig(e.config as unknown as Record<string, unknown>),
  }));

  return c.json({ endpoints: safeEndpoints });
});

/** 添加备份端 */
adminApi.post('/backup-endpoints', async (c) => {
  const username = c.get('username');
  const body = await c.req.json<BackupEndpoint>();

  if (!body.name || !body.type) {
    return c.json({ error: '请提供名称和类型', code: 'VALIDATION_ERROR' }, 400);
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

  const returnedEndpoint = {
    ...newEndpoint,
    config: filterSensitiveConfig(newEndpoint.config as unknown as Record<string, unknown>),
  };
  return c.json({ success: true, endpoint: returnedEndpoint });
});

/** 更新备份端 */
adminApi.put('/backup-endpoints/:id', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const body = await c.req.json<Partial<BackupEndpoint>>();

  const endpoints = await getBackupEndpoints(c.env, username);
  const index = endpoints.findIndex((e) => e.id === id);
  if (index === -1) {
    return c.json({ error: '备份端不存在', code: 'NOT_FOUND' }, 404);
  }

  // 保留原有的密钥（如果新配置中没有提供）
  // 使用 'in' 操作符检查属性是否存在，而不是检查值是否falsy
  const existingConfig = endpoints[index].config;
  if (body.config && existingConfig) {
    const existingS3 = existingConfig as Partial<S3Config>;
    const existingWebDAV = existingConfig as Partial<WebDAVConfig>;
    const newConfig = body.config as Partial<S3Config & WebDAVConfig>;

    const hasOriginalSecret = !!existingS3.secretAccessKey;
    const hasNewSecret = !!newConfig.secretAccessKey;

    if (hasOriginalSecret && !hasNewSecret) {
      newConfig.secretAccessKey = existingS3.secretAccessKey;
    }

    const hasOriginalPassword = !!existingWebDAV.password;
    const hasNewPassword = !!newConfig.password;

    if (hasOriginalPassword && !hasNewPassword) {
      newConfig.password = existingWebDAV.password;
    }
  }

  // 合并更新
  endpoints[index] = { ...endpoints[index], ...body };
  await saveBackupEndpoints(c.env, username, endpoints);

  const returnedEndpoint = {
    ...endpoints[index],
    config: filterSensitiveConfig(endpoints[index].config as unknown as Record<string, unknown>),
  };
  return c.json({ success: true, endpoint: returnedEndpoint });
});

/** 删除备份端 */
adminApi.delete('/backup-endpoints/:id', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');

  const success = await deleteBackupEndpoint(c.env, username, id);
  if (!success) {
    return c.json({ error: '备份端不存在', code: 'NOT_FOUND' }, 404);
  }
  return c.json({ success: true, message: '备份端已删除' });
});

/** 测试备份端连接 */
adminApi.post('/backup-endpoints/:id/test', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  let endpoint;

  if (id === 'new') {
    // 测试新配置的连接（必须传入 type 和 config）
    if (!body.type || !body.config) {
      return c.json({ error: '测试新配置需要传入 type 和 config', code: 'VALIDATION_ERROR' }, 400);
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
    // 测试已保存的配置 - 从 KV 读取完整配置，忽略请求体
    const endpoints = await getBackupEndpoints(c.env, username);
    endpoint = endpoints.find((e) => e.id === id);
    if (!endpoint) {
      return c.json({ error: '备份端不存在', code: 'NOT_FOUND' }, 404);
    }

    // 检查是否有密钥
    const s3Config = endpoint.config as Partial<S3Config>;
    const webdavConfig = endpoint.config as Partial<WebDAVConfig>;
    const hasSecret = !!s3Config.secretAccessKey || !!webdavConfig.password;

    if (!hasSecret) {
      return c.json({
        success: false,
        message: '密钥未配置，请先编辑并保存密钥后重试',
      });
    }
  }

  const result = await testBackupEndpoint(endpoint);
  return c.json(result);
});

/** 列出指定备份端的备份 */
adminApi.get('/backup-endpoints/:id/backups', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');

  const endpoints = await getBackupEndpoints(c.env, username);
  const endpoint = endpoints.find((e) => e.id === id);
  if (!endpoint) {
    return c.json({ error: '备份端不存在', code: 'NOT_FOUND' }, 404);
  }

  try {
    const list = await listBackupsFromEndpoint(c.env, username, endpoint);
    return c.json({ backups: list });
  } catch (err) {
    return c.json({ error: (err as Error).message, code: 'INTERNAL_ERROR' }, 500);
  }
});

/** 从指定备份端恢复 */
adminApi.post('/backup-endpoints/:id/restore', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const { key } = await c.req.json<{ key: string }>();

  if (!key) {
    return c.json({ error: '请提供备份文件 key', code: 'VALIDATION_ERROR' }, 400);
  }

  const endpoints = await getBackupEndpoints(c.env, username);
  const endpoint = endpoints.find((e) => e.id === id);
  if (!endpoint) {
    return c.json({ error: '备份端不存在', code: 'NOT_FOUND' }, 404);
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
    return c.json({ error: '请提供备份文件 key', code: 'VALIDATION_ERROR' }, 400);
  }

  const endpoints = await getBackupEndpoints(c.env, username);
  const endpoint = endpoints.find((e) => e.id === id);
  if (!endpoint) {
    return c.json({ error: '备份端不存在', code: 'NOT_FOUND' }, 404);
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
  const endpoint = endpoints.find((e) => e.id === id);
  if (!endpoint) {
    return c.json({ error: '备份端不存在', code: 'NOT_FOUND' }, 404);
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
    return c.json({ error: '请提供 Bark Key', code: 'VALIDATION_ERROR' }, 400);
  }

  // 验证 server 必须是合法的 HTTPS URL，防止 SSRF
  try {
    const serverUrl = new URL(server);
    if (serverUrl.protocol !== 'https:') {
      return c.json({ error: 'Server 必须是 HTTPS URL', code: 'VALIDATION_ERROR' }, 400);
    }
  } catch {
    return c.json({ error: 'Server 必须是合法的 URL', code: 'VALIDATION_ERROR' }, 400);
  }

  // 验证 key 只允许字母数字字符
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
    return c.json({ error: 'Bark Key 包含非法字符', code: 'VALIDATION_ERROR' }, 400);
  }

  try {
    // 发送测试请求（不实际推送，只验证 key 是否有效）
    const testUrl = `${server}/${key}/测试标题/这是一条测试消息`;
    const res = await fetch(testUrl);
    const data = (await res.json()) as { code: number; message: string };

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
  } catch (err) {
    return c.json({
      success: false,
      message: `请求异常: ${(err as Error).message}`,
    });
  }
});

api.route('/admin', adminApi);
export default api;
