// ============================================
// API 路由
// ============================================
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, PushRequest, PushChannel, ChannelResult } from '../types';
import { hashPassword, verifyPassword } from '../utils/password';
import { authMiddleware } from '../middleware/auth';
import { validateBody, schemas } from '../middleware/validation';
import { createAuditLogger, type AuditAction } from '../utils/audit';
import { rateLimit } from '../middleware/rateLimit';
import { UserService } from '../services/userService';
import {
  dispatchPush,
  dispatchPushWithOptions,
  getChannelConfigs,
  loadUserChannelSettings,
  saveUserChannelSetting,
  CHANNEL_DEFINITIONS,
  getPushHistory,
  deletePushHistory,
  batchDeletePushHistory,
  batchDeletePushHistoryByFilter,
} from '../services/dispatcher';
import { QueueService } from '../services/queueService';
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

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: '注册操作过于频繁，请稍后再试',
});

api.post('/register', registerLimiter, validateBody(schemas.register), async (c) => {
  const body = (c as ValidatedContext).validatedBody as { email: string; password: string };
  const { email, password } = body;
  const userService = new UserService(c.env);

  const existing = await userService.findByEmail(email);
  if (existing) {
    return c.json({ success: false, message: '操作失败，请稍后重试' }, 400);
  }

  // 混合模式：第一个用户或指定邮箱自动成为管理员
  const userCountResult = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
  const isFirstUser = !userCountResult || userCountResult.count === 0;
  const isAdminEmail = c.env.ADMIN_EMAIL && email.toLowerCase() === c.env.ADMIN_EMAIL.toLowerCase();
  
  const role = isFirstUser || isAdminEmail ? 'admin' : 'user';

  const hashed = await hashPassword(password);
  await userService.createUser(email, hashed, role);

  try {
    const auditLogger = createAuditLogger(c.env, email);
    await auditLogger.log('register', { role });
  } catch {
    // 审计日志失败不影响主流程
  }

  return c.json({ success: true, message: '注册成功', isAdmin: role === 'admin' });
});

api.post('/login', validateBody(schemas.login), async (c) => {
  const body = (c as ValidatedContext).validatedBody as { email: string; password: string };
  const { email, password } = body;
  const userService = new UserService(c.env);

  const user = await userService.findByEmail(email);
  if (!user) {
    return c.json({ error: '邮箱或密码错误', code: 'AUTH_ERROR' }, 401);
  }

  const valid = await verifyPassword(password, user.password);

  if (!valid) {
    return c.json({ error: '邮箱或密码错误', code: 'AUTH_ERROR' }, 401);
  }

  // 记录登录日志
  try {
    const auditLogger = createAuditLogger(c.env, email);
    await auditLogger.log('login', {});
  } catch {
    // 审计日志失败不影响主流程
  }

  return c.json({ success: true, message: '登录成功', email });
});

/** 使用 Token 获取 API Key（推荐方式） */
api.get('/apikey', async (c) => {
  const token = c.req.header('X-Token') || c.req.query('token');
  const userService = new UserService(c.env);

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

  const user = await userService.findByToken(token);
  if (!user) {
    return c.json({ error: '无效的 Token', code: 'AUTH_ERROR' }, 401);
  }

  if (user.token !== token || !user.token_expires_at || user.token_expires_at <= Date.now()) {
    return c.json({ error: 'Token 已过期', code: 'AUTH_ERROR' }, 401);
  }

  const forceRefresh = c.req.query('refresh') === 'true';

  if (user.apikey && !forceRefresh) {
    return c.json({ apikey: user.apikey });
  }

  const newApikey = crypto.randomUUID().replace(/-/g, '');

  await userService.updateUser(user.id, { apikey: newApikey });

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
  const userService = new UserService(c.env);

  const user = await userService.findByEmail(username);
  if (!user) {
    return c.json({ error: '用户不存在', code: 'AUTH_ERROR' }, 401);
  }

  const valid = await verifyPassword(password, user.password);
  if (!valid) {
    return c.json({ error: '密码错误', code: 'AUTH_ERROR' }, 401);
  }

  if (user.apikey && !refresh) {
    return c.json({ apikey: user.apikey });
  }

  const newApikey = crypto.randomUUID().replace(/-/g, '');

  await userService.updateUser(user.id, { apikey: newApikey });

  return c.json({ apikey: newApikey, message: 'API Key 已生成' });
});

api.post('/token', validateBody(schemas.token), async (c) => {
  const body = (c as ValidatedContext).validatedBody as { email: string; password: string };
  const { email, password } = body;
  const userService = new UserService(c.env);

  const user = await userService.findByEmail(email);
  if (!user) {
    return c.json({ error: '用户不存在', code: 'AUTH_ERROR' }, 401);
  }

  const valid = await verifyPassword(password, user.password);
  if (!valid) {
    return c.json({ error: '密码错误', code: 'AUTH_ERROR' }, 401);
  }

  const token = crypto.randomUUID().replace(/-/g, '');
  const refreshToken =
    crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const refreshExpiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

  await userService.updateUser(user.id, {
    token,
    token_expires_at: expiresAt,
    refresh_token: refreshToken,
    refresh_token_expires_at: refreshExpiresAt
  });

  return c.json({ token, refreshToken, expiresAt });
});

api.post('/refresh', validateBody(schemas.refresh), async (c) => {
  const body = (c as ValidatedContext).validatedBody as { refreshToken: string };
  const { refreshToken } = body;
  const userService = new UserService(c.env);

  const user = await userService.findByRefreshToken(refreshToken);
  if (!user) {
    return c.json({ error: '无效的 refresh token', code: 'AUTH_ERROR' }, 401);
  }

  if (user.refresh_token !== refreshToken) {
    return c.json({ error: '无效的 refresh token', code: 'AUTH_ERROR' }, 401);
  }

  if (!user.refresh_token_expires_at || user.refresh_token_expires_at < Date.now()) {
    return c.json({ error: 'Refresh token 已过期，请重新登录', code: 'AUTH_ERROR' }, 401);
  }

  const token = crypto.randomUUID().replace(/-/g, '');
  const newRefreshToken =
    crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const newRefreshExpiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

  await userService.updateUser(user.id, {
    token,
    token_expires_at: expiresAt,
    refresh_token: newRefreshToken,
    refresh_token_expires_at: newRefreshExpiresAt
  });

  return c.json({ token, refreshToken: newRefreshToken, expiresAt });
});

// ============================================
// 管理接口
// ============================================
const adminApi = new Hono<{ Bindings: Env; Variables: { username: string } }>();

adminApi.use('/*', authMiddleware);

adminApi.get('/channels', async (c) => {
  const username = c.get('username');
  
  try {
    const settings = await loadUserChannelSettings(username, c.env);
    const channels = getChannelConfigs(settings);
    return c.json({ channels, settings, definitions: CHANNEL_DEFINITIONS });
  } catch (error) {
    console.error('[Channels] Error:', error);
    return c.json({ channels: [], settings: {}, definitions: CHANNEL_DEFINITIONS });
  }
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

  // 记录渠道更新日志
  try {
    const auditLogger = createAuditLogger(c.env, username);
    await auditLogger.log('channel_updated', { channelId });
  } catch {
    // 审计日志失败不影响主流程
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
  const body = (c as ValidatedContext).validatedBody as PushRequest & { async?: boolean };
  
  // 检查是否使用队列异步推送
  const useQueue = body.async === true;
  
  if (useQueue) {
    const queueService = new QueueService(c.env);
    if (!queueService.isAvailable()) {
      return c.json({
        success: false,
        message: '队列服务不可用，请使用同步模式或配置队列',
        code: 'QUEUE_NOT_AVAILABLE'
      }, 503);
    }

    const requestId = crypto.randomUUID();
    await queueService.sendPushTask({
      requestId,
      userId: username,
      payload: body,
      createdAt: new Date().toISOString(),
    });

    // 记录异步推送日志
    try {
      const auditLogger = createAuditLogger(c.env, username);
      await auditLogger.log('push_queued', {
        channels: body.channels,
        requestId,
      });
    } catch {
      // 审计日志失败不影响主流程
    }

    return c.json({
      success: true,
      message: '推送已加入队列',
      requestId,
      async: true,
    });
  }

  // 同步推送（原有逻辑）
  const results = await dispatchPush(body, body.channels, username, c.env);

  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;

  // 记录推送日志
  try {
    const auditLogger = createAuditLogger(c.env, username);
    if (failedCount > 0) {
      await auditLogger.log('push_failed', {
        channels: body.channels,
        successCount,
        failedCount,
      });
    } else {
      await auditLogger.log('push_sent', {
        channels: body.channels,
        successCount,
      });
    }
  } catch {
    // 审计日志失败不影响主流程
  }

  return c.json({
    success: failedCount === 0,
    message: `推送完成: ${successCount} 成功, ${failedCount} 失败`,
    results,
    async: false,
  });
});

/** 获取推送记录 */
adminApi.get('/history', async (c) => {
  const username = c.get('username');
  const page = parseInt(c.req.query('page') || '1', 10);
  const pageSize = parseInt(c.req.query('pageSize') || '20', 10);
  const channel = c.req.query('channel');
  const status = c.req.query('status');
  const keyword = c.req.query('keyword');
  
  try {
    const result = await getPushHistory(username, c.env, {
      page,
      pageSize,
      channel,
      status,
      keyword,
    });
    return c.json({ history: result.records, total: result.total, hasMore: result.hasMore });
  } catch (error) {
    console.error('[History] Error:', error);
    return c.json({ history: [], total: 0, hasMore: false });
  }
});

// ============================================
// 审计日志接口
// ============================================

/** 获取审计日志列表 */
adminApi.get('/audit', async (c) => {
  const username = c.get('username');
  const userRole = c.get('userRole') as 'admin' | 'user' | 'viewer' | undefined;
  if (userRole !== 'admin') {
    return c.json({ error: '无权限访问审计日志', code: 'FORBIDDEN' }, 403);
  }
  const auditLogger = createAuditLogger(c.env, username);

  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);
  const action = c.req.query('action') as AuditAction | undefined;
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  const logs = await auditLogger.getLogs({
    limit,
    offset,
    action,
    startDate,
    endDate,
    allUsers: true,
  });

  return c.json({ logs });
});

/** 清除审计日志 */
adminApi.delete('/audit', async (c) => {
  const username = c.get('username');
  const userRole = c.get('userRole') as 'admin' | 'user' | 'viewer' | undefined;
  if (userRole !== 'admin') {
    return c.json({ error: '无权限清除审计日志', code: 'FORBIDDEN' }, 403);
  }
  const auditLogger = createAuditLogger(c.env, username);
  await auditLogger.clearLogs({ allUsers: true });

  return c.json({ success: true, message: '审计日志已清除' });
});

// ============================================
// 用户管理接口（仅管理员）
// ============================================
function requireAdmin(c: any) {
  const userRole = c.get('userRole') as 'admin' | 'user' | 'viewer' | undefined;
  if (userRole !== 'admin') {
    return c.json({ error: '无权限操作用户管理', code: 'FORBIDDEN' }, 403);
  }
  return null;
}

/** 获取用户列表 */
adminApi.get('/users', async (c) => {
  const env = c.env as Env;
  const guard = requireAdmin(c);
  if (guard) return guard;

  const svc = new UserService(env);
  let users: Array<{ id: string; email: string; role: string | null; disabled: number | null; disabled_reason: string | null; created_at: string }> = [];
  
  try {
    const result = await svc['env'].DB.prepare(
      'SELECT id, email, role, disabled, disabled_reason, created_at FROM users ORDER BY created_at ASC'
    ).all<{ id: string; email: string; role: string | null; disabled: number | null; disabled_reason: string | null; created_at: string }>();
    users = result.results || [];
  } catch {
    const result = await svc['env'].DB.prepare(
      'SELECT id, email, role, created_at FROM users ORDER BY created_at ASC'
    ).all<{ id: string; email: string; role: string | null; created_at: string }>();
    users = (result.results || []).map(u => ({
      ...u,
      disabled: 0,
      disabled_reason: ''
    }));
  }

  return c.json({ users });
});

/** 获取当前用户信息 */
adminApi.get('/me', async (c) => {
  const env = c.env as Env;
  const username = c.get('username');
  const svc = new UserService(env);
  const user = await svc.findByEmail(username);
  if (!user) {
    return c.json({ error: '用户不存在' }, 404);
  }
  return c.json({
    id: user.id,
    email: user.email,
    role: user.role || 'user',
    disabled: user.disabled || 0,
    disabled_reason: user.disabled_reason || '',
    avatar_url: user.avatar_url || '',
    use_avatar_as_popup: user.use_avatar_as_popup || 0,
  });
});

/** 设置用户头像 */
adminApi.put('/me/avatar', async (c) => {
  const env = c.env as Env;
  const username = c.get('username');
  const svc = new UserService(env);
  const user = await svc.findByEmail(username);
  if (!user) {
    return c.json({ error: '用户不存在' }, 404);
  }

  const body = await c.req.json<{ avatar_url?: string; use_avatar_as_popup?: number }>();
  
  const updates: Record<string, unknown> = {};
  if (body.avatar_url !== undefined) {
    updates.avatar_url = body.avatar_url;
  }
  if (body.use_avatar_as_popup !== undefined) {
    updates.use_avatar_as_popup = body.use_avatar_as_popup;
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: '没有提供需要更新的字段', code: 'VALIDATION_ERROR' }, 400);
  }

  const updated = await svc.updateUser(user.id, updates);
  if (!updated) {
    return c.json({ error: '更新失败' }, 500);
  }

  return c.json({
    success: true,
    message: '头像设置已更新',
    avatar_url: updated.avatar_url || '',
    use_avatar_as_popup: updated.use_avatar_as_popup || 0,
  });
});

/** 上传头像文件 */
adminApi.post('/me/avatar/upload', async (c) => {
  const env = c.env as Env;
  const username = c.get('username');
  const svc = new UserService(env);
  const user = await svc.findByEmail(username);
  if (!user) {
    return c.json({ error: '用户不存在' }, 404);
  }

  // 检查 R2 是否可用
  if (!env.AVATAR_BUCKET) {
    return c.json({ error: '头像存储服务不可用', code: 'STORAGE_NOT_AVAILABLE' }, 503);
  }

  try {
    const formData = await c.req.formData();
    const file = formData.get('avatar') as File | null;
    
    if (!file) {
      return c.json({ error: '请选择要上传的文件', code: 'VALIDATION_ERROR' }, 400);
    }

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      return c.json({ error: '无效的图片格式', code: 'VALIDATION_ERROR' }, 400);
    }

    // 验证文件大小（最大 2MB）
    if (file.size > 2 * 1024 * 1024) {
      return c.json({ error: '图片大小超过限制（最大 2MB）', code: 'VALIDATION_ERROR' }, 400);
    }

    // 生成唯一文件名
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `avatars/${user.id}-${Date.now()}.${ext}`;
    
    // 读取文件内容
    const bytes = await file.arrayBuffer();
    
    // 上传到 R2
    await env.AVATAR_BUCKET.put(fileName, bytes, {
      httpMetadata: {
        contentType: file.type,
      },
      customMetadata: {
        userId: user.id,
        uploadedAt: new Date().toISOString(),
      },
    });

    // 生成预览 URL（临时签名 URL）
    const url = await (env.AVATAR_BUCKET as unknown as {
      createSignedUrl: (key: string, options: { method: string; expiresIn: number }) => Promise<{ href: string }>;
    }).createSignedUrl(fileName, {
      method: 'GET',
      expiresIn: 60 * 60 * 24 * 365, // 1 年
    });

    // 更新用户头像 URL
    await svc.updateUser(user.id, { avatar_url: url.href });

    return c.json({
      success: true,
      message: '头像上传成功',
      avatar_url: url.href,
    });
  } catch (err) {
    console.error('Avatar upload error:', err);
    return c.json({ error: '上传失败', code: 'UPLOAD_ERROR' }, 500);
  }
});

/** 创建用户 */
adminApi.post('/users', validateBody(schemas.register), async (c) => {
  const env = c.env as Env;
  const guard = requireAdmin(c);
  if (guard) return guard;

  const body = (c as ValidatedContext).validatedBody as { email: string; password: string };
  const { email, password } = body;

  const svc = new UserService(env);
  const existing = await svc.findByEmail(email);
  if (existing) {
    return c.json({ error: '用户已存在', code: 'USER_EXISTS' }, 409);
  }

  const hashed = await hashPassword(password);
  const newUser = await svc.createUser(email, hashed);

  try {
    const username = c.get('username') as string;
    if (username) {
      const auditLogger = createAuditLogger(env, username);
      await auditLogger.log('user_created', { email, role: 'user' });
    }
  } catch {}

  return c.json({
    id: newUser.id,
    email: newUser.email,
    role: newUser.role || 'user',
    disabled: newUser.disabled || 0,
    created_at: newUser.created_at,
  });
});

/** 更新用户角色 */
adminApi.put('/users/:id/role', validateBody(schemas.userRole), async (c) => {
  const env = c.env as Env;
  const guard = requireAdmin(c);
  if (guard) return guard;

  const userId = c.req.param('id') as string;
  const body = (c as ValidatedContext).validatedBody as { role?: string; refresh?: boolean };
  const { role } = body;

  if (!role || !['admin', 'user', 'viewer'].includes(role)) {
    return c.json({ error: '无效的角色', code: 'VALIDATION_ERROR' }, 400);
  }

  const svc = new UserService(env);
  const target = await svc.findById(userId);
  if (!target) {
    return c.json({ error: '用户不存在', code: 'NOT_FOUND' }, 404);
  }

  // 防止管理员降级自己
  const currentUserId = c.get('userId') as string | undefined;
  if (currentUserId && currentUserId === userId && role !== 'admin') {
    return c.json({ error: '不能修改自己的角色', code: 'SELF_DEMOTE' }, 400);
  }

  await svc.updateUser(userId, { role: role as 'admin' | 'user' | 'viewer' });

  try {
    const username = c.get('username') as string;
    if (username) {
      const auditLogger = createAuditLogger(env, username);
      await auditLogger.log('user_role_updated', { targetUserId: userId, newRole: role });
    }
  } catch {}

  return c.json({ success: true, message: '角色已更新' });
});

/** 禁用用户 */
adminApi.post('/users/:id/disable', async (c) => {
  const env = c.env as Env;
  const guard = requireAdmin(c);
  if (guard) return guard;

  const userId = c.req.param('id') as string;
  let body: { reason?: string } = {};
  try {
    body = await c.req.json<{ reason?: string }>();
  } catch {
    body = { reason: undefined };
  }

  const currentUserId = c.get('userId') as string;
  if (currentUserId === userId) {
    return c.json({ error: '不能禁用自己', code: 'SELF_DISABLE' }, 400);
  }

  const svc = new UserService(env);
  const target = await svc.findById(userId);
  if (!target) {
    return c.json({ error: '用户不存在', code: 'NOT_FOUND' }, 404);
  }

  const reason = body.reason || '';
  
  try {
    await svc.updateUser(userId, {
      disabled: 1,
      disabled_reason: reason,
    });
  } catch {
    return c.json({ error: '用户表不支持禁用功能，请升级数据库', code: 'DB_NOT_SUPPORTED' }, 400);
  }

  try {
    const username = c.get('username') as string;
    if (username) {
      const auditLogger = createAuditLogger(env, username);
      await auditLogger.log('user_disabled', { targetUserId: userId, reason });
    }
  } catch {}

  return c.json({ success: true, message: '用户已禁用' });
});

/** 启用用户 */
adminApi.post('/users/:id/enable', async (c) => {
  const env = c.env as Env;
  const guard = requireAdmin(c);
  if (guard) return guard;

  const userId = c.req.param('id') as string;

  const svc = new UserService(env);
  const target = await svc.findById(userId);
  if (!target) {
    return c.json({ error: '用户不存在', code: 'NOT_FOUND' }, 404);
  }

  await svc.updateUser(userId, { disabled: 0, disabled_reason: '' });

  try {
    const username = c.get('username') as string;
    if (username) {
      const auditLogger = createAuditLogger(env, username);
      await auditLogger.log('user_enabled', { targetUserId: userId });
    }
  } catch {}

  return c.json({ success: true, message: '用户已启用' });
});

/** 删除用户 */
adminApi.delete('/users/:id', async (c) => {
  const env = c.env as Env;
  const guard = requireAdmin(c);
  if (guard) return guard;

  const userId = c.req.param('id') as string;

  const currentUserId = c.get('userId') as string;
  if (currentUserId && currentUserId === userId) {
    return c.json({ error: '不能删除自己', code: 'SELF_DELETE' }, 400);
  }

  const svc = new UserService(env);
  const target = await svc.findById(userId);
  if (!target) {
    return c.json({ error: '用户不存在', code: 'NOT_FOUND' }, 404);
  }

  await svc.deleteUser(userId);

  try {
    const username = c.get('username') as string;
    if (username) {
      const auditLogger = createAuditLogger(env, username);
      await auditLogger.log('user_deleted', { email: target.email });
    }
  } catch {}

  return c.json({ success: true, message: '用户已删除' });
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

/** 批量渠道健康检查（真实发送测试消息） */
adminApi.get('/channels/health', async (c) => {
  const username = c.get('username');
  const settings = await loadUserChannelSettings(username, c.env);

  const results = await Promise.all(
    CHANNEL_DEFINITIONS.map(async (ch) => {
      // settings 的键格式是 "channel:bark:webhook_url", "channel:ntfy:topic" 等
      const channelPrefix = `channel:${ch.id}:`;
      const isConfigured = Object.keys(settings).some((key) => key.startsWith(channelPrefix));

      if (!isConfigured) {
        return {
          channel: ch.id as PushChannel,
          healthy: false,
          message: '渠道未配置',
          testedAt: new Date().toISOString(),
        };
      }

      // 实际发送测试消息
      const results = await dispatchPushWithOptions(
        {
          title: '渠道健康检查',
          body: `这是一条测试消息，用于验证 ${ch.id} 渠道是否正常工作。`,
        },
        [ch.id as PushChannel],
        username,
        c.env
      );

      const result = results[0];
      return {
        channel: ch.id as PushChannel,
        healthy: result.success,
        message: result.success ? '渠道正常' : result.message,
        testedAt: new Date().toISOString(),
      };
    })
  );

  return c.json({ channels: results });
});

/** 测试单个渠道（真实发送测试消息） */
adminApi.post('/channels/health/:channel/test', async (c) => {
  const username = c.get('username');
  const channel = c.req.param('channel') as PushChannel;
  const settings = await loadUserChannelSettings(username, c.env);

  // settings 的键格式是 "channel:bark:webhook_url", "channel:ntfy:topic" 等
  const channelPrefix = `channel:${channel}:`;
  const isConfigured = Object.keys(settings).some((key) => key.startsWith(channelPrefix));

  if (!isConfigured) {
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
    message: result.success ? '渠道正常' : result.message,
    testedAt: new Date().toISOString(),
  });
});

/** 删除推送历史 */
adminApi.delete('/history', async (c) => {
  const username = c.get('username');
  await deletePushHistory(username, c.env);
  return c.json({ success: true, message: '推送历史已清除' });
});

/** 批量删除推送历史（按 ID） */
adminApi.post('/history/batch-delete', async (c) => {
  const username = c.get('username');
  const body = (await c.req.json()) as { ids?: string[] };

  if (!body.ids || !Array.isArray(body.ids)) {
    return c.json({ error: '请提供要删除的记录 ID 列表', code: 'VALIDATION_ERROR' }, 400);
  }

  const result = await batchDeletePushHistory(username, c.env, body.ids);
  return c.json(result);
});

/** 按条件批量删除推送历史 */
adminApi.post('/history/batch-delete-filter', async (c) => {
  const username = c.get('username');
  const body = (await c.req.json()) as {
    olderThan?: string;
    channel?: string;
    status?: string;
  };

  const result = await batchDeletePushHistoryByFilter(username, c.env, body);
  return c.json(result);
});

// ============================================
// 模板管理
// ============================================

/** 获取所有模板 */
adminApi.get('/templates', async (c) => {
  const username = c.get('username');
  
  try {
    const pushService = new PushService(c.env, username);
    const templates = await pushService.getTemplates();
    return c.json({ templates });
  } catch (error) {
    console.error('[Templates] Error:', error);
    return c.json({ templates: [] });
  }
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

  // 记录模板创建日志
  try {
    const auditLogger = createAuditLogger(c.env, username);
    await auditLogger.log('template_created', { templateId: template.id, name: template.name });
  } catch {
    // 审计日志失败不影响主流程
  }

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

  // 记录模板更新日志
  try {
    const auditLogger = createAuditLogger(c.env, username);
    await auditLogger.log('template_updated', { templateId: id });
  } catch {
    // 审计日志失败不影响主流程
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

  // 记录模板删除日志
  try {
    const auditLogger = createAuditLogger(c.env, username);
    await auditLogger.log('template_deleted', { templateId: id });
  } catch {
    // 审计日志失败不影响主流程
  }

  return c.json({ success: true, message: '模板已删除' });
});

/** 预览模板变量替换结果 */
adminApi.post('/templates/:id/preview', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const body = (await c.req.json()) as {
    variables?: Record<string, string>;
    autoVars?: boolean;
  };

  const pushService = new PushService(c.env, username);
  const templates = await pushService.getTemplates();
  const template = templates.find((t) => t.id === id);

  if (!template) {
    return c.json({ error: '模板不存在', code: 'NOT_FOUND' }, 404);
  }

  const { replaceTemplateVariables } = await import('../services/push');

  // 合并用户变量和默认变量
  const vars: Record<string, string> = { ...body.variables };

  // 使用模板中定义的默认值
  if (template.variables) {
    for (const v of template.variables) {
      if (vars[v.key] === undefined && v.defaultValue) {
        vars[v.key] = v.defaultValue;
      }
    }
  }

  const result = {
    title: replaceTemplateVariables(template.title, vars, body.autoVars !== false),
    content: replaceTemplateVariables(template.content, vars, body.autoVars !== false),
    url: template.url
      ? replaceTemplateVariables(template.url, vars, body.autoVars !== false)
      : undefined,
  };

  return c.json(result);
});

/** 提取模板中的变量列表 */
adminApi.get('/templates/:id/variables', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');

  const pushService = new PushService(c.env, username);
  const templates = await pushService.getTemplates();
  const template = templates.find((t) => t.id === id);

  if (!template) {
    return c.json({ error: '模板不存在', code: 'NOT_FOUND' }, 404);
  }

  const { extractVariables } = await import('../services/push');

  // 从标题和内容中提取变量
  const titleVars = extractVariables(template.title);
  const contentVars = extractVariables(template.content);
  const urlVars = template.url ? extractVariables(template.url) : [];
  const allVars = [...new Set([...titleVars, ...contentVars, ...urlVars])];

  // 过滤掉自动变量
  const autoVars = new Set(['date', 'time', 'datetime', 'timestamp', 'year', 'month', 'day']);
  const customVars = allVars.filter((v) => !autoVars.has(v));

  return c.json({ variables: customVars, templateVariables: template.variables || [] });
});

// ============================================
// 渠道分组管理
// ============================================

/** 获取所有分组 */
adminApi.get('/groups', async (c) => {
  const username = c.get('username');
  
  try {
    const pushService = new PushService(c.env, username);
    const groups = await pushService.getChannelGroups();
    return c.json({ groups });
  } catch (error) {
    console.error('[Groups] Error:', error);
    return c.json({ groups: [] });
  }
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

/** 批量删除分组 */
adminApi.post('/groups/batch-delete', async (c) => {
  const username = c.get('username');
  const body = (await c.req.json()) as { ids?: string[] };

  if (!body.ids || !Array.isArray(body.ids)) {
    return c.json({ error: '请提供要删除的分组 ID 列表', code: 'VALIDATION_ERROR' }, 400);
  }

  const pushService = new PushService(c.env, username);
  let deleted = 0;
  for (const id of body.ids) {
    if (await pushService.deleteChannelGroup(id)) {
      deleted++;
    }
  }

  return c.json({ success: true, message: `已删除 ${deleted} 个分组`, deleted });
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

  try {
    const pushService = new PushService(c.env, username);
    const pushes = await pushService.getScheduledPushes(status);
    return c.json({ scheduled: pushes });
  } catch (error) {
    console.error('[Scheduled] Error:', error);
    return c.json({ scheduled: [] });
  }
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
    const cronRegex =
      /^(\*|(\d+(-\d+)?(\/\d+)?)(,(\d+(-\d+)?(\/\d+)?))*)\s+(\*|(\d+(-\d+)?(\/\d+)?)(,(\d+(-\d+)?(\/\d+)?))*)\s+(\*|(\d+(-\d+)?(\/\d+)?)(,(\d+(-\d+)?(\/\d+)?))*)\s+(\*|(\d+(-\d+)?(\/\d+)?)(,(\d+(-\d+)?(\/\d+)?))*)\s+(\*|(\d+(-\d+)?(\/\d+)?)(,(\d+(-\d+)?(\/\d+)?))*)$/;
    if (!cronRegex.test(body.cronExpression.trim())) {
      return c.json(
        {
          error: '无效的 Cron 表达式，请使用标准5字段格式（分 时 日 月 周）',
          code: 'VALIDATION_ERROR',
        },
        400
      );
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

  // 记录定时推送创建日志
  try {
    const auditLogger = createAuditLogger(c.env, username);
    await auditLogger.log('scheduled_push_created', {
      scheduledPushId: push.id,
      scheduledAt: push.scheduledAt,
    });
  } catch {
    // 审计日志失败不影响主流程
  }

  return c.json({ success: true, scheduled: push });
});

/** 更新定时推送 */
adminApi.put('/scheduled/:id', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const body = (await c.req.json()) as {
    title?: string;
    content?: string;
    channels?: PushChannel[];
    url?: string;
    scheduledAt?: string;
    templateId?: string;
    scheduleType?: 'once' | 'recurring';
    recurringType?: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'interval' | 'cron';
    selectedWeekDays?: number[];
    selectedMonthDays?: number[];
    intervalHours?: number;
    cronExpression?: string;
  };

  const pushService = new PushService(c.env, username);
  const updated = await pushService.updateScheduledPush(id, body);

  if (!updated) {
    return c.json({ error: '定时推送不存在或状态不允许编辑', code: 'NOT_FOUND' }, 404);
  }

  return c.json({ success: true, scheduled: updated });
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

/** 批量取消定时任务 */
adminApi.post('/scheduled/batch-cancel', async (c) => {
  const username = c.get('username');
  const body = (await c.req.json()) as { ids?: string[] };

  if (!body.ids || !Array.isArray(body.ids)) {
    return c.json({ error: '请提供要取消的任务 ID 列表', code: 'VALIDATION_ERROR' }, 400);
  }

  const pushService = new PushService(c.env, username);
  const result = await pushService.batchCancelScheduledPushes(body.ids);

  // 记录批量取消日志
  try {
    const auditLogger = createAuditLogger(c.env, username);
    await auditLogger.log('scheduled_push_cancelled', {
      cancelled: result.cancelled,
      count: body.ids.length,
    });
  } catch {
    // 审计日志失败不影响主流程
  }

  return c.json({ success: true, message: `已取消 ${result.cancelled} 个任务`, ...result });
});

/** 批量启用定时任务 */
adminApi.post('/scheduled/batch-enable', async (c) => {
  const username = c.get('username');
  const body = (await c.req.json()) as { ids?: string[] };

  if (!body.ids || !Array.isArray(body.ids)) {
    return c.json({ error: '请提供要启用的任务 ID 列表', code: 'VALIDATION_ERROR' }, 400);
  }

  const pushService = new PushService(c.env, username);
  const result = await pushService.batchEnableScheduledPushes(body.ids);
  return c.json({ success: true, message: `已启用 ${result.enabled} 个任务`, ...result });
});

/** 批量删除定时任务 */
adminApi.post('/scheduled/batch-delete', async (c) => {
  const username = c.get('username');
  const body = (await c.req.json()) as { ids?: string[] };

  if (!body.ids || !Array.isArray(body.ids)) {
    return c.json({ error: '请提供要删除的任务 ID 列表', code: 'VALIDATION_ERROR' }, 400);
  }

  const pushService = new PushService(c.env, username);
  let deleted = 0;
  for (const id of body.ids) {
    if (await pushService.deleteScheduledPush(id)) {
      deleted++;
    }
  }

  return c.json({ success: true, message: `已删除 ${deleted} 个任务`, deleted });
});

/** 获取超时任务列表 */
adminApi.get('/scheduled/overdue', async (c) => {
  const username = c.get('username');
  const pushService = new PushService(c.env, username);
  const overdueTasks = await pushService.getOverdueTasks();
  return c.json({ overdue: overdueTasks });
});

/** 重新安排超时任务 */
adminApi.post('/scheduled/:id/reschedule', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const body = (await c.req.json()) as { scheduledAt: string };

  if (!body.scheduledAt) {
    return c.json({ error: '请提供新的定时时间', code: 'VALIDATION_ERROR' }, 400);
  }

  const newScheduledTime = new Date(body.scheduledAt);
  if (isNaN(newScheduledTime.getTime())) {
    return c.json({ error: '无效的定时时间', code: 'VALIDATION_ERROR' }, 400);
  }

  if (newScheduledTime <= new Date()) {
    return c.json({ error: '定时时间必须是将来的时间', code: 'VALIDATION_ERROR' }, 400);
  }

  const pushService = new PushService(c.env, username);
  const rescheduled = await pushService.rescheduleOverdueTask(id, body.scheduledAt);

  if (!rescheduled) {
    return c.json({ error: '定时推送不存在或状态不允许重新安排', code: 'NOT_FOUND' }, 404);
  }

  // 记录重新安排日志
  try {
    const auditLogger = createAuditLogger(c.env, username);
    await auditLogger.log('scheduled_push_rescheduled', {
      scheduledPushId: id,
      newScheduledAt: body.scheduledAt,
    });
  } catch {
    // 审计日志失败不影响主流程
  }

  return c.json({ success: true, scheduled: rescheduled, message: '任务已重新安排' });
});

// ============================================
// 推送统计
// ============================================

/** 获取推送统计 */
adminApi.get('/stats', async (c) => {
  const username = c.get('username');
  
  try {
    const pushService = new PushService(c.env, username);
    const stats = await pushService.getPushStats();

    // 获取推送历史用于渠道使用统计
    const { records } = await getPushHistory(username, c.env, { pageSize: 1000 });

    // 渠道使用统计
    const channelUsage: Record<
      string,
      { count: number; success: number; failed: number; avgLatency: number }
    > = {};
    for (const record of records) {
      for (const result of record.results) {
        if (!channelUsage[result.channel]) {
          channelUsage[result.channel] = { count: 0, success: 0, failed: 0, avgLatency: 0 };
        }
        channelUsage[result.channel].count++;
        if (result.success) {
          channelUsage[result.channel].success++;
        } else {
          channelUsage[result.channel].failed++;
        }
        if (result.latencyMs !== undefined) {
          const prev = channelUsage[result.channel];
          prev.avgLatency = (prev.avgLatency * (prev.count - 1) + result.latencyMs) / prev.count;
        }
      }
    }

    return c.json({
      ...stats,
      channelUsage,
    });
  } catch (error) {
    console.error('[Stats] Error:', error);
    return c.json({
      session: { total: 0, success: 0, failed: 0 },
      trend: { rate: 0, direction: 'stable' as const },
      recent: [],
      channelUsage: {},
    });
  }
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
    const templates = await pushService.getTemplates();
    const template = templates.find((t) => t.id === body.templateId);
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
    body.channels,
    username,
    c.env
  );

  const success = results.every((r: ChannelResult) => r.success);

  // 记录 Webhook 推送日志
  try {
    const auditLogger = createAuditLogger(c.env, username);
    await auditLogger.log('push_sent', {
      source: 'webhook',
      channels: body.channels,
      success,
    });
  } catch {
    // 审计日志失败不影响主流程
  }

  return c.json({
    success,
    results,
    message: success ? '推送成功' : '部分推送失败',
  });
});

/** 获取用户的 Webhook URL */
adminApi.get('/webhook/url', async (c) => {
  c.get('username'); // 保留用于中间件验证
  const baseUrl =
    (c.env as unknown as Record<string, string>).APP_URL || 'https://beeswarm.zuike.qzz.io';
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
// 备份相关审计日志
// ============================================

// 在备份路由中添加审计日志会更复杂，这里我们先完成当前的集成
// 以后可以在 backupRoutes 中进一步集成

api.route('/admin', adminApi);
export default api;
