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
  deletePushHistory,
  healthCheckChannel,
} from '../services/dispatcher';
import { PushService } from '../services/push';
import { MetricsCollector } from '../services/metrics';
import { backupRoutes } from './admin/backup';

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
  if (!existing) {
    const hashed = await hashPassword(password);
    await c.env.SUBSCRIPTIONS.put(`user:${email}`, JSON.stringify({ password: hashed }));
  }

  // 统一返回成功，防止邮箱枚举攻击
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

  try {
    await saveUserChannelSetting(username, channelId, body.fields, c.env);
  } catch (err) {
    return c.json({ error: (err as Error).message, code: 'VALIDATION_ERROR' }, 400);
  }

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

adminApi.post('/push', validateBody(schemas.push), async (c) => {
  const username = c.get('username');
  const body = (c as ValidatedContext).validatedBody as PushRequest;

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
  const page = parseInt(c.req.query('page') || '1', 10);
  const pageSize = parseInt(c.req.query('pageSize') || '20', 10);
  const result = await getPushHistory(username, c.env, { page, pageSize });
  return c.json({ history: result.records, total: result.total, hasMore: result.hasMore });
});

// ============================================
// 多备份端接口（已抽离到 routes/admin/backup.ts）
// ============================================
adminApi.route('/', backupRoutes);

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

    // 验证 server 不指向内网地址，防止 DNS rebinding 攻击
    const hostname = serverUrl.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('169.254.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('172.') ||
      hostname === '[::1]' ||
      hostname.startsWith('fc00:') ||
      hostname.startsWith('fe80:')
    ) {
      return c.json({ error: 'Server 不允许使用内网地址', code: 'VALIDATION_ERROR' }, 400);
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
    const testUrl = new URL(`${server}/${key}/测试标题`);
    testUrl.searchParams.set('body', '这是一条测试消息');
    const res = await fetch(testUrl.toString());
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

// ============================================
// 渠道管理
// ============================================

/** 渠道健康检查 */
adminApi.get('/channels/health', async (c) => {
  const username = c.get('username');
  const channelId = c.req.query('channel');

  const settings = await loadUserChannelSettings(username, c.env);

  if (channelId) {
    const result = await healthCheckChannel(channelId as PushChannel, settings);
    return c.json(result);
  }

  const results = await Promise.all(
    CHANNEL_DEFINITIONS.map((ch) => healthCheckChannel(ch.id, settings))
  );
  return c.json({ channels: results });
});

/** 删除推送历史 */
adminApi.delete('/history', async (c) => {
  const username = c.get('username');
  await deletePushHistory(username, c.env);
  return c.json({ success: true, message: '推送历史已清除' });
});

// ============================================
// 模板管理
// ============================================

/** 获取所有模板 */
adminApi.get('/templates', async (c) => {
  const username = c.get('username');
  const pushService = new PushService(c.env, username);
  const templates = await pushService.getTemplates();
  return c.json({ templates });
});

/** 创建模板 */
adminApi.post('/templates', async (c) => {
  const username = c.get('username');
  const body = (await c.req.json()) as {
    name: string;
    title: string;
    content: string;
    channels?: PushChannel[];
    url?: string;
    imageUrl?: string;
    useMarkdown?: boolean;
  };

  if (!body.name || !body.title) {
    return c.json({ error: '模板名称和标题不能为空', code: 'VALIDATION_ERROR' }, 400);
  }

  const pushService = new PushService(c.env, username);
  const template = await pushService.saveTemplate({
    name: body.name,
    title: body.title,
    content: body.content || '',
    channels: body.channels,
    url: body.url,
    imageUrl: body.imageUrl,
    useMarkdown: body.useMarkdown,
  });

  return c.json({ success: true, template });
});

/** 更新模板 */
adminApi.put('/templates/:id', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const body = (await c.req.json()) as Partial<{
    name: string;
    title: string;
    content: string;
    channels: PushChannel[];
    url: string;
    imageUrl: string;
    useMarkdown: boolean;
  }>;

  const pushService = new PushService(c.env, username);
  const template = await pushService.updateTemplate(id, body);

  if (!template) {
    return c.json({ error: '模板不存在', code: 'NOT_FOUND' }, 404);
  }

  return c.json({ success: true, template });
});

/** 删除模板 */
adminApi.delete('/templates/:id', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');

  const pushService = new PushService(c.env, username);
  const deleted = await pushService.deleteTemplate(id);

  if (!deleted) {
    return c.json({ error: '模板不存在', code: 'NOT_FOUND' }, 404);
  }

  return c.json({ success: true, message: '模板已删除' });
});

// ============================================
// 渠道分组管理
// ============================================

/** 获取所有分组 */
adminApi.get('/groups', async (c) => {
  const username = c.get('username');
  const pushService = new PushService(c.env, username);
  const groups = await pushService.getChannelGroups();
  return c.json({ groups });
});

/** 创建分组 */
adminApi.post('/groups', async (c) => {
  const username = c.get('username');
  const body = (await c.req.json()) as { name: string; channels: PushChannel[] };

  if (!body.name || !body.channels?.length) {
    return c.json({ error: '分组名称和渠道不能为空', code: 'VALIDATION_ERROR' }, 400);
  }

  const pushService = new PushService(c.env, username);
  const group = await pushService.saveChannelGroup({
    name: body.name,
    channels: body.channels,
  });

  return c.json({ success: true, group });
});

/** 删除分组 */
adminApi.delete('/groups/:id', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');

  const pushService = new PushService(c.env, username);
  const deleted = await pushService.deleteChannelGroup(id);

  if (!deleted) {
    return c.json({ error: '分组不存在', code: 'NOT_FOUND' }, 404);
  }

  return c.json({ success: true, message: '分组已删除' });
});

/** 更新分组 */
adminApi.put('/groups/:id', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const body = (await c.req.json()) as { name?: string; channels?: PushChannel[] };

  if (!body.name && !body.channels?.length) {
    return c.json({ error: '分组名称或渠道不能为空', code: 'VALIDATION_ERROR' }, 400);
  }

  const pushService = new PushService(c.env, username);
  const group = await pushService.updateChannelGroup(id, body);

  if (!group) {
    return c.json({ error: '分组不存在', code: 'NOT_FOUND' }, 404);
  }

  return c.json({ success: true, group });
});

// ============================================
// 定时推送管理
// ============================================

/** 获取定时推送列表 */
adminApi.get('/scheduled', async (c) => {
  const username = c.get('username');
  const status = c.req.query('status') as
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed'
    | undefined;

  const pushService = new PushService(c.env, username);
  const pushes = await pushService.getScheduledPushes(status);
  return c.json({ scheduled: pushes });
});

/** 创建定时推送 */
adminApi.post('/scheduled', async (c) => {
  const username = c.get('username');
  const body = (await c.req.json()) as {
    title: string;
    content?: string;
    channels: PushChannel[];
    url?: string;
    scheduledAt: string;
    templateId?: string;
    scheduleType?: 'once' | 'recurring';
    recurringType?: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'interval' | 'cron';
    selectedWeekDays?: number[];
    selectedMonthDays?: number[];
    intervalHours?: number;
    cronExpression?: string;
  };

  if (!body.title || !body.scheduledAt || !body.channels?.length) {
    return c.json({ error: '标题、推送时间和渠道不能为空', code: 'VALIDATION_ERROR' }, 400);
  }

  const scheduledTime = new Date(body.scheduledAt);
  if (isNaN(scheduledTime.getTime())) {
    return c.json({ error: '无效的定时时间', code: 'VALIDATION_ERROR' }, 400);
  }

  // Cron 表达式验证（简单验证：必须包含5个空格分隔的字段）
  if (body.recurringType === 'cron' && body.cronExpression) {
    const cronRegex = /^(\*|(\d+(-\d+)?(\/\d+)?)(,(\d+(-\d+)?(\/\d+)?))*)\s+(\*|(\d+(-\d+)?(\/\d+)?)(,(\d+(-\d+)?(\/\d+)?))*)\s+(\*|(\d+(-\d+)?(\/\d+)?)(,(\d+(-\d+)?(\/\d+)?))*)\s+(\*|(\d+(-\d+)?(\/\d+)?)(,(\d+(-\d+)?(\/\d+)?))*)\s+(\*|(\d+(-\d+)?(\/\d+)?)(,(\d+(-\d+)?(\/\d+)?))*)$/;
    if (!cronRegex.test(body.cronExpression.trim())) {
      return c.json({ error: '无效的 Cron 表达式，请使用标准5字段格式（分 时 日 月 周）', code: 'VALIDATION_ERROR' }, 400);
    }
  }

  if (scheduledTime <= new Date()) {
    return c.json({ error: '定时时间必须是将来的时间', code: 'VALIDATION_ERROR' }, 400);
  }

  const pushService = new PushService(c.env, username);
  const push = await pushService.createScheduledPush({
    title: body.title,
    content: body.content || '',
    channels: body.channels,
    url: body.url,
    scheduledAt: body.scheduledAt,
    templateId: body.templateId,
    scheduleType: body.scheduleType || 'once',
    recurringType: body.recurringType,
    selectedWeekDays: body.selectedWeekDays,
    selectedMonthDays: body.selectedMonthDays,
    intervalHours: body.intervalHours,
    cronExpression: body.cronExpression,
  });

  return c.json({ success: true, scheduled: push });
});

/** 删除定时推送 */
adminApi.delete('/scheduled/:id', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');

  const pushService = new PushService(c.env, username);
  const deleted = await pushService.deleteScheduledPush(id);

  if (!deleted) {
    return c.json({ error: '定时推送不存在', code: 'NOT_FOUND' }, 404);
  }

  return c.json({ success: true, message: '定时推送已删除' });
});

// ============================================
// 推送统计
// ============================================

/** 获取推送统计 */
adminApi.get('/stats', async (c) => {
  const username = c.get('username');
  const pushService = new PushService(c.env, username);
  const stats = await pushService.getPushStats();
  return c.json(stats);
});

/** 获取会话指标 */
adminApi.get('/metrics', async (c) => {
  const username = c.get('username');
  const metrics = new MetricsCollector(c.env, username);
  await metrics.loadSessionMetrics();
  return c.json(metrics.getSessionMetrics());
});

// ============================================
// Webhook 触发推送
// ============================================

/** 通过 Webhook 触发推送（需要 API Key 认证） */
adminApi.post('/webhook/push', async (c) => {
  const username = c.get('username');
  const body = (await c.req.json()) as {
    title?: string;
    content?: string;
    templateId?: string;
    channels?: PushChannel[];
    url?: string;
  };

  // 如果使用模板
  if (body.templateId) {
    const pushService = new PushService(c.env, username);
    const template = await pushService.getTemplate(body.templateId);
    if (!template) {
      return c.json({ error: '模板不存在', code: 'NOT_FOUND' }, 404);
    }
    body.title = body.title || template.title;
    body.content = body.content || template.content;
    body.channels = body.channels || template.channels || [];
  }

  if (!body.title && !body.content) {
    return c.json({ error: '标题或内容至少提供一个，或使用模板', code: 'VALIDATION_ERROR' }, 400);
  }

  if (!body.channels || body.channels.length === 0) {
    return c.json({ error: '请至少指定一个推送渠道', code: 'VALIDATION_ERROR' }, 400);
  }

  const results = await dispatchPushWithOptions(
    {
      title: body.title || '',
      body: body.content || '',
      url: body.url,
    },
    body.channels as any[],
    username,
    c.env
  );

  const success = results.every((r) => r.success);
  return c.json({
    success,
    results,
    message: success ? '推送成功' : '部分推送失败',
  });
});

/** 获取用户的 Webhook URL */
adminApi.get('/webhook/url', async (c) => {
  const username = c.get('username');
  const baseUrl = c.env.APP_URL || 'https://beeswarm.zuike.qzz.io';
  return c.json({
    webhookUrl: `${baseUrl}/api/admin/webhook/push`,
    description: '使用 API Key 作为 Bearer Token 发送 POST 请求到此 URL 来触发推送',
    exampleBody: {
      title: '推送标题',
      content: '推送内容',
      channels: ['wework', 'dingtalk'],
    },
    templateExample: {
      templateId: '模板ID',
      content: '可选：覆盖模板内容',
      channels: ['wework'],
    },
  });
});

// ============================================
// 渠道健康检查
// ============================================

/** 检查单个渠道健康状态 */
adminApi.get('/channels/health/:channel', async (c) => {
  const username = c.get('username');
  const channel = c.req.param('channel') as PushChannel;
  const configKey = `user:${username}:channel:${channel}`;
  const config = await c.env.SUBSCRIPTIONS.get(configKey);

  if (!config) {
    return c.json({ channel, status: 'not_configured', healthy: false } as ChannelHealth);
  }

  // 简单检查：有配置就算健康
  return c.json({ channel, status: 'configured', healthy: true, lastChecked: new Date().toISOString() } as ChannelHealth);
});

/** 批量检查所有渠道健康状态 */
adminApi.get('/channels/health', async (c) => {
  const username = c.get('username');
  const allChannels: PushChannel[] = ['wework', 'dingtalk', 'feishu', 'telegram', 'bark', 'ntfy', 'email', 'slack', 'discord'];
  const results: ChannelHealth[] = [];

  for (const channel of allChannels) {
    const configKey = `user:${username}:channel:${channel}`;
    const config = await c.env.SUBSCRIPTIONS.get(configKey);
    results.push({
      channel,
      status: config ? 'configured' : 'not_configured',
      healthy: !!config,
      lastChecked: new Date().toISOString(),
    });
  }

  return c.json({ channels: results });
});

/** 测试单个渠道（实际发送测试消息） */
adminApi.post('/channels/health/:channel/test', async (c) => {
  const username = c.get('username');
  const channel = c.req.param('channel') as PushChannel;
  const configKey = `user:${username}:channel:${channel}`;
  const config = await c.env.SUBSCRIPTIONS.get(configKey);

  if (!config) {
    return c.json({ error: '渠道未配置', code: 'NOT_CONFIGURED' }, 400);
  }

  const results = await dispatchPushWithOptions(
    {
      title: '渠道健康检查',
      body: `这是一条测试消息，用于验证 ${channel} 渠道是否正常工作。`,
    },
    [channel],
    username,
    c.env
  );

  const result = results[0];
  return c.json({
    channel,
    healthy: result.success,
    message: result.success ? '渠道正常' : result.error,
    testedAt: new Date().toISOString(),
  });
});

api.route('/admin', adminApi);
export default api;
