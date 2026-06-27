// ============================================
// API 路由
// ============================================
import { Hono } from 'hono';
import type { Env, PushRequest, PushChannel, ChannelResult } from '../types';
import { hashPassword, verifyPassword } from '../utils/password';
import { authMiddleware } from '../middleware/auth';
import { validateBody, schemas } from '../middleware/validation';
import { createAuditLogger, type AuditAction } from '../utils/audit';
import {
  rateLimit,
  isLoginLocked,
  recordLoginFailure,
  clearLoginFailure,
} from '../middleware/rateLimit';
import { UserService } from '../services/userService';
import type { AITool } from '../services/userService';
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
import { userCacheMiddleware } from '../services/cacheService';
import { getBackupEndpoints } from '../services/backup';
import {
  sendEmail,
  generatePasswordResetEmail,
  generateWelcomeEmail,
  generateVerificationEmail,
} from '../services/emailService';
import { generateTOTPSecret, verifyTOTP, generateQRCodeDataURL } from '../utils/totp';
import {
  cleanupExpiredData,
  getDatabaseStats,
  getAllTables,
  deleteTable,
  cleanupOrphanTablesForce,
} from '../services/cleanupService';
import { archivePushHistory, listArchives, restoreArchivedData } from '../services/archiveService';
import { AIService } from '../services/aiService';
import { SystemSettingsService } from '../services/systemSettingsService';

type ValidatedContext = {
  validatedBody?: unknown;
  validatedQuery?: unknown;
};

function errResponse(
  c: { json: (data: unknown, status?: number) => Response },
  message: string,
  code: string,
  status = 400
) {
  return c.json({ error: message, code }, status);
}

function ipToLong(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isIPInCIDR(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits)) - 1) >>> 0;
  return (ipToLong(ip) & mask) === (ipToLong(range) & mask);
}

async function getSystemSettings(env: Env) {
  const svc = new SystemSettingsService(env);
  await svc.ensureTable();
  return svc;
}

export const api = new Hono<{ Bindings: Env; Variables: { username: string } }>();

// CORS 已在 index.ts 中全局配置，这里不需要重复

// ============================================
// 公开接口
// ============================================

// Turnstile 配置端点（公开）
api.get('/turnstile/config', async (c) => {
  const systemSettings = await getSystemSettings(c.env);
  const turnstileConfig = await systemSettings.getTurnstileConfig();

  if (turnstileConfig.enabled && turnstileConfig.siteKey) {
    return c.json({ success: true, siteKey: turnstileConfig.siteKey });
  }
  return errResponse(c, 'Turnstile 未配置', 'NOT_CONFIGURED');
});

// Turnstile 验证函数
async function verifyTurnstile(token: string, secretKey: string, ip?: string): Promise<boolean> {
  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (ip) formData.append('remoteip', ip);

    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });

    const outcome = (await result.json()) as { success: boolean };
    return outcome.success;
  } catch {
    return false;
  }
}

api.post('/register', validateBody(schemas.register), async (c) => {
  const body = (c as ValidatedContext).validatedBody as {
    email: string;
    password: string;
    turnstileToken?: string;
  };
  const { email, password, turnstileToken } = body;

  // 如果配置了 Turnstile，验证 token
  const systemSettings = await getSystemSettings(c.env);
  const turnstileConfig = await systemSettings.getTurnstileConfig();

  if (turnstileConfig.enabled && turnstileConfig.secretKey) {
    if (!turnstileToken) {
      return errResponse(c, '请完成人机验证', 'VALIDATION_ERROR');
    }
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For');
    const valid = await verifyTurnstile(turnstileToken, turnstileConfig.secretKey, ip);
    if (!valid) {
      return errResponse(c, '人机验证失败，请重试', 'VALIDATION_ERROR');
    }
  }

  const userService = new UserService(c.env);

  const existing = await userService.findByEmail(email);
  if (existing) {
    return errResponse(c, '操作失败，请稍后重试', 'VALIDATION_ERROR');
  }

  // 混合模式：第一个用户或指定邮箱自动成为管理员
  const userCountResult = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{
    count: number;
  }>();
  const isFirstUser = !userCountResult || userCountResult.count === 0;
  const isAdminEmail = c.env.ADMIN_EMAIL && email.toLowerCase() === c.env.ADMIN_EMAIL.toLowerCase();

  // 发送验证邮件（如果配置了 SMTP）
  let emailSent = false;
  let smtpConfigured = false;
  try {
    const smtpConfig = await systemSettings.getSMTPConfig();
    smtpConfigured = !!(smtpConfig.host && smtpConfig.username && smtpConfig.password);
    if (smtpConfigured) {
      // 生成验证码
      const verificationCode = await userService.generateVerificationCode(email);
      if (verificationCode) {
        const url = new URL(c.req.url);
        const baseUrl = `${url.protocol}//${url.host}`;
        const emailContent = generateVerificationEmail(email, verificationCode, baseUrl);

        emailSent = await sendEmail(c.env, {
          to: email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        });
      }
    }
  } catch {
    // 邮件发送失败不影响注册
  }

  // 角色逻辑：第一个用户或管理员邮箱 → admin，SMTP已配置且发送了邮件 → viewer（未验证），否则 → user
  const role = isFirstUser || isAdminEmail ? 'admin' : smtpConfigured && emailSent ? 'viewer' : 'user';

  const hashed = await hashPassword(password);
  await userService.createUser(email, hashed, role);

  try {
    const auditLogger = createAuditLogger(c.env, email);
    await auditLogger.log('register', { role });
  } catch (error) {
    console.error('[Register] Audit log failed:', error);
  }

  const message = emailSent
    ? '注册成功，验证码已发送到您的邮箱（如未收到请检查垃圾邮件）'
    : '注册成功';

  return c.json({ success: true, message, isAdmin: role === 'admin', needVerification: emailSent });
});

/** 验证邮箱验证码 */
api.post('/verify-email', async (c) => {
  try {
    const body = await c.req.json<{ email: string; code: string }>();
    const { email, code } = body;

    if (!email || !code) {
      return errResponse(c, '邮箱和验证码不能为空', 'VALIDATION_ERROR');
    }

    const userService = new UserService(c.env);
    const success = await userService.verifyEmail(email, code);

    if (success) {
      return c.json({ success: true, message: '邮箱验证成功' });
    } else {
      return errResponse(c, '验证码无效或已过期', 'VALIDATION_ERROR');
    }
  } catch (error) {
    console.error('[Verify Email] Error:', error);
    return errResponse(c, '验证失败，请稍后重试', 'INTERNAL_ERROR', 500);
  }
});

/** 重新发送验证邮件 */
api.post('/resend-verification', async (c) => {
  try {
    const body = await c.req.json<{ email: string }>();
    const { email } = body;

    if (!email) {
      return errResponse(c, '邮箱不能为空', 'VALIDATION_ERROR');
    }

    const userService = new UserService(c.env);
    const user = await userService.findByEmail(email);
    if (!user) {
      return errResponse(c, '用户不存在', 'NOT_FOUND', 404);
    }

    if (user.email_verified) {
      return errResponse(c, '邮箱已验证', 'VALIDATION_ERROR');
    }

    // 速率限制：每小时最多 3 次
    const systemSettings = await getSystemSettings(c.env);
    const lastVerifyKey = `verify_last_${email}`;
    const lastVerifyTime = await systemSettings.getSetting(lastVerifyKey);
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;

    if (lastVerifyTime) {
      const lastTime = parseInt(lastVerifyTime, 10);
      if (now - lastTime < ONE_HOUR) {
        const remaining = Math.ceil((ONE_HOUR - (now - lastTime)) / 60000);
        return errResponse(c, `发送过于频繁，请 ${remaining} 分钟后再试`, 'RATE_LIMITED', 429);
      }
    }

    await systemSettings.setSetting(lastVerifyKey, String(now));

    // 生成验证码
    const verificationCode = await userService.generateVerificationCode(email);
    if (!verificationCode) {
      return errResponse(c, '生成验证码失败', 'INTERNAL_ERROR', 500);
    }

    // 发送邮件
    const smtpConfig = await systemSettings.getSMTPConfig();
    if (smtpConfig.host && smtpConfig.username && smtpConfig.password) {
      const url = new URL(c.req.url);
      const baseUrl = `${url.protocol}//${url.host}`;
      const emailContent = generateVerificationEmail(email, verificationCode, baseUrl);

      await sendEmail(c.env, {
        to: email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });
    }

    return c.json({ success: true, message: '验证码已发送' });
  } catch (error) {
    console.error('[Resend Verification] Error:', error);
    return errResponse(c, '发送失败，请稍后重试', 'INTERNAL_ERROR', 500);
  }
});

api.post('/login', validateBody(schemas.login), async (c) => {
  const body = (c as ValidatedContext).validatedBody as {
    email: string;
    password: string;
    turnstileToken?: string;
  };
  const { email, password, turnstileToken } = body;

  // 如果配置了 Turnstile，验证 token
  const systemSettings = await getSystemSettings(c.env);
  const turnstileConfig = await systemSettings.getTurnstileConfig();

  if (turnstileConfig.enabled && turnstileConfig.secretKey) {
    if (!turnstileToken) {
      return errResponse(c, '请完成人机验证', 'VALIDATION_ERROR');
    }
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For');
    const valid = await verifyTurnstile(turnstileToken, turnstileConfig.secretKey, ip);
    if (!valid) {
      return errResponse(c, '人机验证失败，请重试', 'VALIDATION_ERROR');
    }
  }

  // 登录限流 + 暴力破解防护
  const loginIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
  const lockStatus = isLoginLocked(email, loginIP);
  if (lockStatus.locked) {
    return c.json(
      {
        error: `登录尝试次数过多，请 ${Math.ceil(lockStatus.retryAfter! / 60)} 分钟后重试`,
        code: 'ACCOUNT_LOCKED',
      },
      429
    );
  }

  const userService = new UserService(c.env);

  const user = await userService.findByEmail(email);
  if (!user) {
    recordLoginFailure(email, loginIP);
    // 记录失败尝试
    try {
      const auditLogger = createAuditLogger(c.env, email);
      await auditLogger.log('login_failed', { reason: 'user_not_found' });
    } catch (error) {
      console.error('[Login] Audit log failed:', error);
    }
    return c.json({ error: '邮箱或密码错误', code: 'AUTH_ERROR' }, 401);
  }

  const valid = await verifyPassword(password, user.password);

  if (!valid) {
    recordLoginFailure(email, loginIP);
    // 记录失败尝试
    try {
      const auditLogger = createAuditLogger(c.env, email);
      await auditLogger.log('login_failed', { reason: 'wrong_password' });
    } catch (error) {
      console.error('[Login] Audit log failed:', error);
    }
    return c.json({ error: '邮箱或密码错误', code: 'AUTH_ERROR' }, 401);
  }

  // 登录成功，清除失败计数
  clearLoginFailure(email, loginIP);

  // 检查 IP 白名单
  const allowedIPs = await userService.getAllowedIPs(user.id);
  if (allowedIPs.length > 0) {
    const isAllowed = allowedIPs.some((allowed) => {
      if (allowed.includes('/')) {
        // CIDR 格式检查
        return isIPInCIDR(loginIP, allowed);
      }
      return loginIP === allowed;
    });
    if (!isAllowed) {
      return c.json({ error: 'IP 不在白名单中', code: 'IP_NOT_ALLOWED' }, 403);
    }
  }

  // 检查是否启用了 2FA
  if (user.totp_enabled) {
    return c.json({ success: true, need2FA: true, message: '需要验证码', email });
  }

  // 记录登录日志
  try {
    const auditLogger = createAuditLogger(c.env, email);
    await auditLogger.log('login', {});
  } catch (error) {
    console.error('[Login] Audit log failed:', error);
  }

  return c.json({ success: true, message: '登录成功', email });
});

/** 2FA 验证码校验（登录时使用） */
api.post('/login/2fa', validateBody(schemas.login), async (c) => {
  const body = (c as ValidatedContext).validatedBody as {
    email: string;
    password: string;
    code: string;
  };
  const { email, password, code } = body;

  if (!code || code.length !== 6) {
    return errResponse(c, '请输入6位验证码', 'VALIDATION_ERROR');
  }

  const userService = new UserService(c.env);
  const user = await userService.findByEmail(email);
  if (!user) {
    return c.json({ error: '用户不存在', code: 'AUTH_ERROR' }, 401);
  }

  const valid = await verifyPassword(password, user.password);
  if (!valid) {
    return c.json({ error: '邮箱或密码错误', code: 'AUTH_ERROR' }, 401);
  }

  if (!user.totp_enabled || !user.totp_secret) {
    return c.json({ error: '2FA 未启用', code: 'NOT_ENABLED' }, 400);
  }

  const totpValid = verifyTOTP(user.totp_secret, code);
  if (!totpValid) {
    try {
      const auditLogger = createAuditLogger(c.env, email);
      await auditLogger.log('login_failed', { reason: 'invalid_totp' });
    } catch (error) {
      console.error('[Login 2FA] Audit log failed:', error);
    }
    return c.json({ error: '验证码无效', code: 'AUTH_ERROR' }, 401);
  }

  // 记录登录日志
  try {
    const auditLogger = createAuditLogger(c.env, email);
    await auditLogger.log('login', { twoFactor: true });
  } catch (error) {
    console.error('[Login 2FA] Audit log failed:', error);
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
    refresh_token_expires_at: refreshExpiresAt,
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
    refresh_token_expires_at: newRefreshExpiresAt,
  });

  return c.json({ token, refreshToken: newRefreshToken, expiresAt });
});

/** 请求密码重置 */
api.post('/password-reset', async (c) => {
  try {
    const body = await c.req.json<{ email: string }>();
    const { email } = body;

    if (!email) {
      return errResponse(c, '邮箱不能为空', 'VALIDATION_ERROR');
    }

    // 速率限制：同一邮箱每小时最多 3 次
    const systemSettings = await getSystemSettings(c.env);
    const lastResetKey = `password_reset_last_${email}`;
    const lastResetTime = await systemSettings.getSetting(lastResetKey);
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;

    if (lastResetTime) {
      const lastTime = parseInt(lastResetTime, 10);
      if (now - lastTime < ONE_HOUR) {
        const remaining = Math.ceil((ONE_HOUR - (now - lastTime)) / 60000);
        return errResponse(c, `发送过于频繁，请 ${remaining} 分钟后再试`, 'RATE_LIMITED', 429);
      }
    }

    // 记录本次请求时间
    await systemSettings.setSetting(lastResetKey, String(now));

    // 全局限制：每分钟最多 10 次
    const globalResetKey = 'password_reset_global_count';
    const globalResetTimeKey = 'password_reset_global_time';
    const globalTime = await systemSettings.getSetting(globalResetTimeKey);
    const globalCount = parseInt((await systemSettings.getSetting(globalResetKey)) || '0', 10);

    if (globalTime && now - parseInt(globalTime, 10) < 60000) {
      if (globalCount >= 10) {
        return errResponse(c, '系统繁忙，请稍后再试', 'RATE_LIMITED', 429);
      }
      await systemSettings.setSetting(globalResetKey, String(globalCount + 1));
    } else {
      await systemSettings.setSetting(globalResetTimeKey, String(now));
      await systemSettings.setSetting(globalResetKey, '1');
    }

    const userService = new UserService(c.env);

    // 生成重置令牌
    const resetToken = await userService.generatePasswordResetToken(email);

    if (!resetToken) {
      // 为了安全，即使邮箱不存在也返回成功
      return c.json({ success: true, message: '密码重置链接已发送' });
    }

    // 生成重置链接
    const url = new URL(c.req.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    // 生成邮件内容
    const emailContent = generatePasswordResetEmail(email, resetToken, baseUrl);

    // 尝试发送邮件
    const emailSent = await sendEmail(c.env, {
      to: email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    if (emailSent) {
      return c.json({
        success: true,
        message: '密码重置链接已发送到您的邮箱',
      });
    } else {
      // 邮件发送失败，返回提示信息（开发模式下）
      return c.json({
        success: true,
        message: '密码重置请求已生成（邮件服务未配置，请查看控制台获取令牌）',
        resetToken, // 仅在邮件发送失败时返回，便于调试
      });
    }
  } catch (error) {
    console.error('[Password Reset] Error:', error);
    return errResponse(c, '请求失败，请稍后重试', 'INTERNAL_ERROR', 500);
  }
});

/** 验证重置令牌 */
api.get('/password-reset/:token', async (c) => {
  const token = c.req.param('token');
  const userService = new UserService(c.env);

  const user = await userService.verifyPasswordResetToken(token);

  if (!user) {
    return c.json({ valid: false, message: '无效或已过期的重置链接' }, 400);
  }

  return c.json({ valid: true, email: user.email });
});

/** 重置密码 */
api.post('/password-reset/:token', async (c) => {
  try {
    const token = c.req.param('token');
    const body = await c.req.json<{ password: string }>();
    const { password } = body;

    if (!password || password.length < 8) {
      return errResponse(c, '密码长度至少为8位', 'VALIDATION_ERROR');
    }

    const userService = new UserService(c.env);

    // 先验证令牌
    const user = await userService.verifyPasswordResetToken(token);
    if (!user) {
      return errResponse(c, '无效或已过期的重置链接', 'VALIDATION_ERROR');
    }

    // 加密新密码
    const hashedPassword = await hashPassword(password);

    // 更新密码
    const success = await userService.resetPasswordWithToken(token, hashedPassword);

    if (success) {
      return c.json({ success: true, message: '密码重置成功' });
    } else {
      return errResponse(c, '密码重置失败，请重试', 'INTERNAL_ERROR', 500);
    }
  } catch (error) {
    console.error('[Password Reset] Error:', error);
    return errResponse(c, '请求失败，请稍后重试', 'INTERNAL_ERROR', 500);
  }
});

/** 检查 AI 是否可用（公开接口） */
api.get('/ai/available', async (c) => {
  const aiService = new AIService(c.env);
  return c.json({
    available: aiService.isAvailable(),
  });
});

// ============================================
// 管理接口
// ============================================
const adminApi = new Hono<{ Bindings: Env; Variables: { username: string } }>();

adminApi.use('/*', authMiddleware);

// 应用用户配置的缓存设置
adminApi.use('/*', userCacheMiddleware());

// ============================================
// 系统设置接口（需要 admin 权限）
// ============================================
adminApi.get('/system/settings', async (c) => {
  const username = c.get('username');
  const userService = new UserService(c.env);
  const user = await userService.findByEmail(username);

  if (!user || user.role !== 'admin') {
    return errResponse(c, '权限不足', 'AUTH_ERROR', 403);
  }

  const systemSettings = await getSystemSettings(c.env);
  const settings = await systemSettings.getAllSettings();

  return c.json({ success: true, settings });
});

adminApi.put('/system/settings', async (c) => {
  const username = c.get('username');
  const userService = new UserService(c.env);
  const user = await userService.findByEmail(username);

  if (!user || user.role !== 'admin') {
    return errResponse(c, '权限不足', 'AUTH_ERROR', 403);
  }

  const body = await c.req.json();
  const systemSettings = await getSystemSettings(c.env);
  await systemSettings.saveSettings(body);

  // 记录审计日志
  try {
    const auditLogger = createAuditLogger(c.env, username);
    await auditLogger.log('system_settings_updated', {});
  } catch (error) {
    console.error('[System Settings] Audit log failed:', error);
  }

  return c.json({ success: true, message: '系统设置已保存' });
});

// ============================================
// 数据库管理接口（需要 admin 权限）
// ============================================

// 获取数据库统计
adminApi.get('/database/stats', async (c) => {
  const userService = new UserService(c.env);
  const currentUser = await userService.findByEmail(c.get('username'));

  if (!currentUser || currentUser.role !== 'admin') {
    return c.json({ error: '权限不足', code: 'AUTH_ERROR' }, 403);
  }

  const stats = await getDatabaseStats(c.env);
  return c.json({ success: true, stats });
});

// 执行数据清理
adminApi.post('/database/cleanup', async (c) => {
  const userService = new UserService(c.env);
  const currentUser = await userService.findByEmail(c.get('username'));

  if (!currentUser || currentUser.role !== 'admin') {
    return c.json({ error: '权限不足', code: 'AUTH_ERROR' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const result = await cleanupExpiredData(c.env, {
    pushHistoryRetentionDays: body.pushHistoryRetentionDays || 30,
    auditLogRetentionDays: body.auditLogRetentionDays || 90,
    batchSize: body.batchSize || 100,
  });

  // 记录审计日志
  try {
    const auditLogger = createAuditLogger(c.env, currentUser.email);
    await auditLogger.log('database_cleanup', result);
  } catch (error) {
    console.error('[Database Cleanup] Audit log failed:', error);
  }

  return c.json({ success: true, ...result });
});

// 归档推送历史
adminApi.post('/database/archive', async (c) => {
  const username = c.get('username');
  const userService = new UserService(c.env);
  const currentUser = await userService.findByEmail(username);

  if (!currentUser || currentUser.role !== 'admin') {
    return c.json({ error: '权限不足', code: 'AUTH_ERROR' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const result = await archivePushHistory(c.env, username, {
    archiveAfterDays: body.archiveAfterDays || 30,
    batchSize: body.batchSize || 50,
  });

  // 记录审计日志
  try {
    const auditLogger = createAuditLogger(c.env, username);
    await auditLogger.log('database_archive', result);
  } catch (error) {
    console.error('[Database Archive] Audit log failed:', error);
  }

  return c.json({ success: true, ...result });
});

// 获取归档列表
adminApi.get('/database/archives', async (c) => {
  const username = c.get('username');
  const userService = new UserService(c.env);
  const currentUser = await userService.findByEmail(username);

  if (!currentUser || currentUser.role !== 'admin') {
    return c.json({ error: '权限不足', code: 'AUTH_ERROR' }, 403);
  }

  const archives = await listArchives(c.env, username);
  return c.json({ success: true, archives });
});

// 恢复归档数据
adminApi.post('/database/archives/:key/restore', async (c) => {
  const username = c.get('username');
  const archiveKey = c.req.param('key');
  const userService = new UserService(c.env);
  const currentUser = await userService.findByEmail(username);

  if (!currentUser || currentUser.role !== 'admin') {
    return c.json({ error: '权限不足', code: 'AUTH_ERROR' }, 403);
  }

  const result = await restoreArchivedData(c.env, username, decodeURIComponent(archiveKey));

  // 记录审计日志
  try {
    const auditLogger = createAuditLogger(c.env, username);
    await auditLogger.log('database_archive_restore', { archiveKey, restored: result.restored });
  } catch (error) {
    console.error('[Archive Restore] Audit log failed:', error);
  }

  return c.json({ success: true, ...result });
});

// 获取所有数据库表
adminApi.get('/database/tables', async (c) => {
  const userService = new UserService(c.env);
  const currentUser = await userService.findByEmail(c.get('username'));

  if (!currentUser || currentUser.role !== 'admin') {
    return c.json({ error: '权限不足', code: 'AUTH_ERROR' }, 403);
  }

  const result = await getAllTables(c.env);
  return c.json({ success: true, ...result });
});

// 删除指定表
adminApi.delete('/database/tables/:name', async (c) => {
  const userService = new UserService(c.env);
  const currentUser = await userService.findByEmail(c.get('username'));

  if (!currentUser || currentUser.role !== 'admin') {
    return c.json({ error: '权限不足', code: 'AUTH_ERROR' }, 403);
  }

  const tableName = decodeURIComponent(c.req.param('name'));
  const result = await deleteTable(c.env, tableName);

  // 记录审计日志
  try {
    const auditLogger = createAuditLogger(c.env, currentUser.email);
    await auditLogger.log('table_deleted', { tableName, success: result.success });
  } catch (error) {
    console.error('[Table Delete] Audit log failed:', error);
  }

  return c.json({ success: result.success, error: result.error });
});

// 强制清理所有应该删除的表
adminApi.post('/database/cleanup-tables', async (c) => {
  const userService = new UserService(c.env);
  const currentUser = await userService.findByEmail(c.get('username'));

  if (!currentUser || currentUser.role !== 'admin') {
    return c.json({ error: '权限不足', code: 'AUTH_ERROR' }, 403);
  }

  const result = await cleanupOrphanTablesForce(c.env);

  // 记录审计日志
  try {
    const auditLogger = createAuditLogger(c.env, currentUser.email);
    await auditLogger.log('tables_cleanup', result);
  } catch (error) {
    console.error('[Tables Cleanup] Audit log failed:', error);
  }

  return c.json({ success: true, ...result });
});

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

  // 准备要保存的字段
  const fieldsToSave = { ...body.fields };

  // 检查必填字段是否都清空了，如果是则自动禁用；如果填了则自动启用
  // 注意：只传 enabled 时不触发此逻辑
  const def = CHANNEL_DEFINITIONS.find((d) => d.id === channelId);
  if (def && Object.keys(body.fields).some((k) => k !== 'enabled')) {
    const requiredFields = def.fields.filter((f) => f.required);
    const allEmpty = requiredFields.every((f) => !body.fields[f.key]);
    const allFilled = requiredFields.every((f) => !!body.fields[f.key]);
    if (allEmpty) {
      fieldsToSave.enabled = 'false';
    } else if (allFilled) {
      fieldsToSave.enabled = 'true';
    }
  }

  try {
    await saveUserChannelSetting(username, channelId, fieldsToSave, c.env);
  } catch (err) {
    return c.json({ error: (err as Error).message, code: 'VALIDATION_ERROR' }, 400);
  }

  // 记录渠道更新日志
  try {
    const auditLogger = createAuditLogger(c.env, username);
    await auditLogger.log('channel_updated', { channelId });
  } catch (error) {
    console.error('[Channel Update] Audit log failed:', error);
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

  // 强制使用队列异步推送
  const queueService = new QueueService(c.env);
  if (!queueService.isAvailable()) {
    return c.json(
      {
        success: false,
        message: '队列服务不可用，请配置 Cloudflare Queues',
        code: 'QUEUE_NOT_AVAILABLE',
      },
      503
    );
  }

  const requestId = crypto.randomUUID();
  try {
    await queueService.sendPushTask({
      requestId,
      userId: username,
      payload: body,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Push API] Failed to send task to queue:', error);
    return c.json(
      {
        success: false,
        message: '发送到队列失败: ' + (error as Error).message,
        code: 'QUEUE_SEND_FAILED',
      },
      500
    );
  }

  // 记录异步推送日志
  try {
    const auditLogger = createAuditLogger(c.env, username);
    await auditLogger.log('push_queued', {
      channels: body.channels,
      requestId,
    });
  } catch (error) {
    console.error('[Push Queue] Audit log failed:', error);
  }

  return c.json({
    success: true,
    message: '推送已加入队列',
    requestId,
    async: true,
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
  const adminCheck = requireAdmin(c);
  if (adminCheck) return adminCheck;

  const auditLogger = createAuditLogger(c.env, c.get('username'));

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
  const adminCheck = requireAdmin(c);
  if (adminCheck) return adminCheck;

  const auditLogger = createAuditLogger(c.env, c.get('username'));
  await auditLogger.clearLogs({ allUsers: true });

  return c.json({ success: true, message: '审计日志已清除' });
});

// ============================================
// 用户管理接口（仅管理员）
// ============================================
function requireAdmin(c: {
  get: (key: string) => unknown;
  json: (data: unknown, status?: number) => Response;
}) {
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
  let users: Array<{
    id: string;
    email: string;
    role: string | null;
    disabled: number | null;
    disabled_reason: string | null;
    created_at: string;
    avatar_url?: string | null;
  }> = [];

  try {
    const result = await svc['env'].DB.prepare(
      'SELECT id, email, role, disabled, disabled_reason, created_at, avatar_url FROM users ORDER BY created_at ASC LIMIT 500'
    ).all<{
      id: string;
      email: string;
      role: string | null;
      disabled: number | null;
      disabled_reason: string | null;
      created_at: string;
      avatar_url?: string | null;
    }>();
    users = result.results || [];
  } catch {
    const result = await svc['env'].DB.prepare(
      'SELECT id, email, role, created_at FROM users ORDER BY created_at ASC LIMIT 500'
    ).all<{ id: string; email: string; role: string | null; created_at: string }>();
    users = (result.results || []).map((u) => ({
      ...u,
      disabled: 0,
      disabled_reason: '',
      avatar_url: '',
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

/** 检查头像存储服务状态 */
adminApi.get('/me/avatar/status', async (c) => {
  const env = c.env as Env;
  const username = c.get('username');
  try {
    const endpoints = await getBackupEndpoints(env, username);
    const r2Endpoint = endpoints.find((e) => e.type === 'r2' && e.r2_domain);
    const hasUserR2 = !!r2Endpoint;
    return c.json({
      success: true,
      hasR2: hasUserR2,
      storageType: hasUserR2 ? 'r2' : 'base64',
      message: hasUserR2 ? '头像存储服务可用' : '头像将使用 base64 存储',
    });
  } catch {
    return c.json({
      success: true,
      hasR2: false,
      storageType: 'base64',
      message: '头像将使用 base64 存储',
    });
  }
});

/** 获取用户设置 */
adminApi.get('/me/settings', async (c) => {
  const env = c.env as Env;
  const username = c.get('username');
  const svc = new UserService(env);
  const user = await svc.findByEmail(username);
  if (!user) {
    return c.json({ error: '用户不存在' }, 404);
  }
  const settings = await svc.getUserSettings(user.id);
  return c.json({ success: true, settings });
});

/** 保存用户设置 */
adminApi.put('/me/settings', async (c) => {
  const env = c.env as Env;
  const username = c.get('username');
  const svc = new UserService(env);
  const user = await svc.findByEmail(username);
  if (!user) {
    return c.json({ error: '用户不存在' }, 404);
  }

  const body = await c.req.json<{
    cache_ttl_backup?: number;
    cache_ttl_channels?: number;
    cache_ttl_templates?: number;
    cache_ttl_groups?: number;
    cache_ttl_scheduled?: number;
    ai_model?: string;
    ai_enabled?: boolean;
    ai_provider?: 'workers-ai' | 'openai' | 'azure-openai' | 'anthropic' | 'custom';
    ai_api_key?: string;
    ai_api_url?: string;
    ai_model_name?: string;
  }>();

  const currentSettings = await svc.getUserSettings(user.id);
  const newSettings = { ...currentSettings, ...body };

  await svc.saveUserSettings(user.id, newSettings);

  return c.json({ success: true, message: '设置已保存', settings: newSettings });
});

/** 保存缓存设置（仅缓存相关字段） */
adminApi.put('/me/settings/cache', async (c) => {
  const env = c.env as Env;
  const username = c.get('username');
  const svc = new UserService(env);
  const user = await svc.findByEmail(username);
  if (!user) {
    return c.json({ error: '用户不存在' }, 404);
  }

  const body = await c.req.json<{
    cache_ttl_backup?: number;
    cache_ttl_channels?: number;
    cache_ttl_templates?: number;
    cache_ttl_groups?: number;
    cache_ttl_scheduled?: number;
  }>();

  // 只更新提供的字段，保留其他字段
  const currentCacheSettings = await svc.getCacheSettings(user.id);
  const newCacheSettings = {
    cache_ttl_backup:
      body.cache_ttl_backup !== undefined
        ? body.cache_ttl_backup
        : currentCacheSettings.cache_ttl_backup,
    cache_ttl_channels:
      body.cache_ttl_channels !== undefined
        ? body.cache_ttl_channels
        : currentCacheSettings.cache_ttl_channels,
    cache_ttl_templates:
      body.cache_ttl_templates !== undefined
        ? body.cache_ttl_templates
        : currentCacheSettings.cache_ttl_templates,
    cache_ttl_groups:
      body.cache_ttl_groups !== undefined
        ? body.cache_ttl_groups
        : currentCacheSettings.cache_ttl_groups,
    cache_ttl_scheduled:
      body.cache_ttl_scheduled !== undefined
        ? body.cache_ttl_scheduled
        : currentCacheSettings.cache_ttl_scheduled,
  };

  await svc.saveCacheSettings(user.id, newCacheSettings);

  // 保存后重新获取最新数据，确保返回正确
  const savedSettings = await svc.getCacheSettings(user.id);

  return c.json({ success: true, message: '缓存设置已保存', settings: savedSettings });
});

/** 保存AI设置（仅AI相关字段） */
adminApi.put('/me/settings/ai', async (c) => {
  const env = c.env as Env;
  const username = c.get('username');
  const svc = new UserService(env);
  const user = await svc.findByEmail(username);
  if (!user) {
    return c.json({ error: '用户不存在' }, 404);
  }

  const body = await c.req.json<{
    ai_model?: string;
    ai_enabled?: boolean;
    ai_provider?: string;
    ai_api_key?: string;
    ai_api_url?: string;
    ai_model_name?: string;
    custom_ai_providers?: Array<{ id: string; name: string; icon: string }>;
    ai_provider_configs?: Record<
      string,
      { api_key?: string; api_url?: string; model_name?: string }
    >;
    ai_tools?: Array<{
      id: string;
      name: string;
      description: string;
      parameters: Array<{
        name: string;
        type: string;
        description: string;
        required: boolean;
      }>;
      enabled: boolean;
    }>;
  }>();

  const currentAISettings = await svc.getAISettings(user.id);
  const newAISettings = {
    ...currentAISettings,
    ai_model: body.ai_model !== undefined ? body.ai_model : currentAISettings.ai_model,
    ai_enabled: body.ai_enabled !== undefined ? body.ai_enabled : currentAISettings.ai_enabled,
    ai_provider: body.ai_provider !== undefined ? body.ai_provider : currentAISettings.ai_provider,
    ai_api_key: body.ai_api_key !== undefined ? body.ai_api_key : currentAISettings.ai_api_key,
    ai_api_url: body.ai_api_url !== undefined ? body.ai_api_url : currentAISettings.ai_api_url,
    ai_model_name:
      body.ai_model_name !== undefined ? body.ai_model_name : currentAISettings.ai_model_name,
    custom_ai_providers:
      body.custom_ai_providers !== undefined
        ? body.custom_ai_providers
        : currentAISettings.custom_ai_providers,
    ai_provider_configs:
      body.ai_provider_configs !== undefined
        ? body.ai_provider_configs
        : currentAISettings.ai_provider_configs,
    ai_tools: body.ai_tools !== undefined ? body.ai_tools : currentAISettings.ai_tools,
  };

  await svc.saveAISettings(user.id, newAISettings);

  // 保存后重新获取最新数据，确保返回正确
  const savedSettings = await svc.getAISettings(user.id);

  return c.json({ success: true, message: 'AI设置已保存', settings: savedSettings });
});

/** 获取 AI 工具列表（包含默认工具和用户自定义工具） */
adminApi.get('/me/ai/tools', async (c) => {
  const env = c.env as Env;
  const username = c.get('username');
  const svc = new UserService(env);
  const user = await svc.findByEmail(username);
  if (!user) {
    return c.json({ error: '用户不存在' }, 404);
  }

  const settings = await svc.getAISettings(user.id);
  const userTools = settings.ai_tools || [];
  const defaultTools = svc.getDefaultAITools();

  // 合并默认工具和用户自定义工具
  const toolMap = new Map<string, AITool & { isDefault: boolean }>();

  // 添加默认工具
  for (const tool of defaultTools) {
    const userTool = userTools.find((t) => t.id === tool.id);
    toolMap.set(tool.id, {
      ...tool,
      enabled: userTool ? userTool.enabled : tool.enabled,
      isDefault: true,
    });
  }

  // 添加用户自定义工具
  for (const tool of userTools) {
    if (tool.name.startsWith('custom_')) {
      toolMap.set(tool.id, {
        ...tool,
        isDefault: false,
      });
    }
  }

  return c.json({
    success: true,
    tools: Array.from(toolMap.values()),
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

    let avatarUrl: string;

    // 检查用户是否配置了 R2 备份端点（有 r2_domain 配置的）
    const endpoints = await getBackupEndpoints(env, username);
    const r2Endpoint = endpoints.find((e) => e.type === 'r2' && e.r2_domain);

    if (r2Endpoint && env.BUCKET) {
      // 有 R2 备份端点配置，上传到 R2
      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `avatars/${user.id}-${Date.now()}.${ext}`;

      const bytes = await file.arrayBuffer();

      await env.BUCKET.put(fileName, bytes, {
        httpMetadata: {
          contentType: file.type,
        },
        customMetadata: {
          userId: user.id,
          uploadedAt: new Date().toISOString(),
        },
      });

      avatarUrl = `https://${r2Endpoint.r2_domain}/${fileName}`;
    } else {
      // 没有 R2 备份端点，使用 base64 存储
      const bytes = await file.arrayBuffer();
      const base64 = await arrayBufferToBase64(bytes);
      avatarUrl = `data:${file.type};base64,${base64}`;
    }

    return c.json({
      success: true,
      message: '头像上传成功',
      avatar_url: avatarUrl,
    });
  } catch (err: unknown) {
    console.error('Avatar upload error:', err);
    const errorMessage = err instanceof Error ? err.message : '未知错误';
    return c.json(
      {
        error: '上传失败',
        code: 'UPLOAD_ERROR',
        details: errorMessage,
      },
      500
    );
  }
});

/** 将 ArrayBuffer 转换为 Base64 */
async function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

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
  } catch (error) {
    console.error('[User Create] Audit log failed:', error);
  }

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
  } catch (error) {
    console.error('[User Role Update] Audit log failed:', error);
  }

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
  } catch (error) {
    console.error('[User Disable] Audit log failed:', error);
  }

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
  } catch (error) {
    console.error('[User Enable] Audit log failed:', error);
  }

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
  } catch (error) {
    console.error('[User Delete] Audit log failed:', error);
  }

  return c.json({ success: true, message: '用户已删除' });
});

// ============================================
// 多备份端接口（已抽离到 routes/admin/backup.ts）
// ============================================
adminApi.route('/', backupRoutes);

// ============================================
// 系统健康监控
// ============================================

/** 获取系统健康状态（需要 admin 权限） */
adminApi.get('/system/health', async (c) => {
  const username = c.get('username');
  const userService = new UserService(c.env);
  const currentUser = await userService.findByEmail(username);

  if (!currentUser || currentUser.role !== 'admin') {
    return c.json({ error: '权限不足', code: 'AUTH_ERROR' }, 403);
  }

  const env = c.env as Env;
  const health: {
    database: { status: string; message: string };
    lastCronRun: string | null;
    activeUsers: number;
    recentPushCount: number;
    queueStatus: { available: boolean; message: string };
    dbSize: string;
    dbRowCount: number;
    r2Storage: {
      available: boolean;
      objectCount: number;
      totalSize: number;
      totalSizeFormatted: string;
    };
    recentErrors: Array<{
      userId: string;
      action: string;
      data: string;
      createdAt: string;
    }>;
  } = {
    database: { status: 'unknown', message: '' },
    lastCronRun: null,
    activeUsers: 0,
    recentPushCount: 0,
    dbSize: '未知',
    dbRowCount: 0,
    r2Storage: {
      available: false,
      objectCount: 0,
      totalSize: 0,
      totalSizeFormatted: '未配置',
    },
    recentErrors: [],
    queueStatus: { available: false, message: '' },
  };

  // 1. 数据库连接状态
  try {
    const testResult = await env.DB.prepare('SELECT 1 as ok').first<{ ok: number }>();
    if (testResult && testResult.ok === 1) {
      health.database = { status: 'ok', message: '数据库连接正常' };
    } else {
      health.database = { status: 'error', message: '数据库查询异常' };
    }
  } catch (err) {
    health.database = { status: 'error', message: `数据库连接失败: ${(err as Error).message}` };
  }

  // 2. 最近一次 cron 执行时间（从 system_settings 获取）
  try {
    const systemSettings = await getSystemSettings(env);
    const lastCronStr = await systemSettings.getSetting('last_cron_execution');
    health.lastCronRun = lastCronStr || null;
  } catch {
    // ignore
  }

  // 3. 活跃用户数（最近 7 天有登录的用户）
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const usersResult = await env.DB.prepare(
      `SELECT COUNT(DISTINCT user_id) as count FROM audit_logs WHERE action = 'login' AND created_at >= ?`
    )
      .bind(sevenDaysAgo)
      .first<{ count: number }>();
    health.activeUsers = usersResult?.count || 0;
  } catch {
    // ignore
  }

  // 4. 最近 24 小时推送量
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const pushCount = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM push_history WHERE created_at >= ?`
    )
      .bind(oneDayAgo)
      .first<{ count: number }>();
    health.recentPushCount = pushCount?.count || 0;
  } catch {
    // ignore
  }

  // 5. 队列状态
  try {
    const queueService = new QueueService(env);
    health.queueStatus = {
      available: queueService.isAvailable(),
      message: queueService.isAvailable() ? '队列服务可用' : '队列服务未配置',
    };
  } catch {
    health.queueStatus = { available: false, message: '队列状态未知' };
  }

  // 6. D1 数据库大小
  try {
    const tables = [
      'users',
      'push_history',
      'audit_logs',
      'metrics',
      'scheduled_pushes',
      'push_templates',
      'channel_groups',
      'scheduled_locks',
      'backup_runs',
      'backup_endpoints',
      'push_drafts',
      'push_workflows',
      'push_favorites',
      'push_execution_logs',
      'system_settings',
    ];
    let totalRows = 0;
    for (const table of tables) {
      try {
        const result = await env.DB.prepare(`SELECT COUNT(*) as count FROM ${table}`).first<{
          count: number;
        }>();
        totalRows += result?.count || 0;
      } catch {
        // table may not exist
      }
    }
    health.dbSize = `${totalRows} 行`;
    health.dbRowCount = totalRows;
  } catch {
    health.dbSize = '未知';
  }

  // 7. R2 存储使用量
  try {
    if (env.BUCKET) {
      const listed = await env.BUCKET.list({ limit: 1000 });
      let totalSize = 0;
      for (const obj of listed.objects) {
        totalSize += obj.size || 0;
      }
      health.r2Storage = {
        available: true,
        objectCount: listed.objects.length,
        totalSize,
        totalSizeFormatted: formatBytes(totalSize),
      };
    } else {
      health.r2Storage = {
        available: false,
        objectCount: 0,
        totalSize: 0,
        totalSizeFormatted: '未配置',
      };
    }
  } catch {
    health.r2Storage = {
      available: false,
      objectCount: 0,
      totalSize: 0,
      totalSizeFormatted: '获取失败',
    };
  }

  // 8. 最近错误日志
  try {
    const errorResult = await env.DB.prepare(
      `SELECT user_id, action, data, created_at FROM audit_logs
       WHERE action LIKE '%failed%' OR action LIKE '%error%'
       ORDER BY created_at DESC LIMIT 10`
    ).all<{ user_id: string; action: string; data: string; created_at: string }>();
    health.recentErrors = (errorResult.results || []).map((r) => ({
      userId: r.user_id,
      action: r.action,
      data: r.data,
      createdAt: r.created_at,
    }));
  } catch {
    health.recentErrors = [];
  }

  return c.json({ success: true, health });
});

// ============================================
// 用户活动分析
// ============================================

/** 获取最近 7 天用户活动统计 */
adminApi.get('/analytics/activity', async (c) => {
  const username = c.get('username');
  const userService = new UserService(c.env);
  const currentUser = await userService.findByEmail(username);

  if (!currentUser || currentUser.role !== 'admin') {
    return c.json({ error: '权限不足', code: 'AUTH_ERROR' }, 403);
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const activity: Array<{ date: string; logins: number; pushes: number; templates: number }> = [];

  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(Date.now() - i * 86400000);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    const dateStr = dayStart.toISOString().split('T')[0];

    let logins = 0;
    let pushes = 0;
    let templates = 0;

    try {
      const loginResult = await c.env.DB.prepare(
        `SELECT COUNT(*) as count FROM audit_logs
         WHERE action = 'login' AND created_at >= ? AND created_at <= ?`
      )
        .bind(dayStart.toISOString(), dayEnd.toISOString())
        .first<{ count: number }>();
      logins = loginResult?.count || 0;
    } catch {
      /* ignore */
    }

    try {
      const pushResult = await c.env.DB.prepare(
        `SELECT COUNT(*) as count FROM audit_logs
         WHERE (action = 'push_sent' OR action = 'push_queued') AND created_at >= ? AND created_at <= ?`
      )
        .bind(dayStart.toISOString(), dayEnd.toISOString())
        .first<{ count: number }>();
      pushes = pushResult?.count || 0;
    } catch {
      /* ignore */
    }

    try {
      const templateResult = await c.env.DB.prepare(
        `SELECT COUNT(*) as count FROM audit_logs
         WHERE (action LIKE 'template_%') AND created_at >= ? AND created_at <= ?`
      )
        .bind(dayStart.toISOString(), dayEnd.toISOString())
        .first<{ count: number }>();
      templates = templateResult?.count || 0;
    } catch {
      /* ignore */
    }

    activity.push({ date: dateStr, logins, pushes, templates });
  }

  return c.json({ success: true, activity });
});

// ============================================
// 推送执行日志
// ============================================

/** 获取推送执行日志列表 */
adminApi.get('/execution-logs', async (c) => {
  const username = c.get('username');
  const page = parseInt(c.req.query('page') || '1', 10);
  const pageSize = parseInt(c.req.query('pageSize') || '20', 10);
  const offset = (page - 1) * pageSize;

  try {
    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM push_execution_logs WHERE user_id = ?`
    )
      .bind(username)
      .first<{ count: number }>();
    const total = countResult?.count || 0;

    const result = await c.env.DB.prepare(
      `SELECT * FROM push_execution_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
      .bind(username, pageSize, offset)
      .all();

    const logs = (result.results || []).map((r: Record<string, unknown>) => ({
      id: r.id,
      pushHistoryId: r.push_history_id,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      status: r.status,
      channels: JSON.parse((r.channels as string) || '[]'),
      channelResults: JSON.parse((r.channel_results as string) || '[]'),
      errorMessage: r.error_message,
      metadata: JSON.parse((r.metadata as string) || '{}'),
      createdAt: r.created_at,
    }));

    return c.json({ success: true, logs, total, hasMore: offset + pageSize < total });
  } catch (error) {
    console.error('[Execution Logs] Error:', error);
    return c.json({ success: true, logs: [], total: 0, hasMore: false });
  }
});

/** 获取单条推送执行日志详情 */
adminApi.get('/execution-logs/:id', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');

  try {
    const result = await c.env.DB.prepare(
      `SELECT * FROM push_execution_logs WHERE id = ? AND user_id = ?`
    )
      .bind(id, username)
      .first<Record<string, unknown>>();

    if (!result) {
      return c.json({ error: '日志不存在', code: 'NOT_FOUND' }, 404);
    }

    return c.json({
      success: true,
      log: {
        id: result.id,
        pushHistoryId: result.push_history_id,
        startedAt: result.started_at,
        finishedAt: result.finished_at,
        status: result.status,
        channels: JSON.parse((result.channels as string) || '[]'),
        channelResults: JSON.parse((result.channel_results as string) || '[]'),
        errorMessage: result.error_message,
        metadata: JSON.parse((result.metadata as string) || '{}'),
        createdAt: result.created_at,
      },
    });
  } catch (error) {
    console.error('[Execution Log Detail] Error:', error);
    return c.json({ error: '获取失败', code: 'INTERNAL_ERROR' }, 500);
  }
});

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

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

/** 标记推送回执 */
adminApi.post('/history/:id/receipt', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const body = (await c.req.json()) as { action?: 'delivered' | 'read' | 'clicked' };

  if (!body.action || !['delivered', 'read', 'clicked'].includes(body.action)) {
    return c.json({ error: '无效的回执操作', code: 'VALIDATION_ERROR' }, 400);
  }

  const columnMap: Record<string, string> = {
    delivered: 'delivered_at',
    read: 'read_at',
    clicked: 'clicked_at',
  };

  const column = columnMap[body.action];
  const now = new Date().toISOString();

  try {
    await c.env.DB.prepare(`UPDATE push_history SET ${column} = ? WHERE id = ? AND user_id = ?`)
      .bind(now, id, username)
      .run();
    return c.json({ success: true, message: `标记${body.action}成功` });
  } catch (error) {
    console.error('[Receipt] Error:', error);
    return c.json({ error: '标记回执失败', code: 'RECEIPT_ERROR' }, 500);
  }
});

// ============================================
// 模板管理
// ============================================

/** 标记推送已送达 */
adminApi.post('/history/:id/delivered', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const pushService = new PushService(c.env, username);
  const updated = await pushService.markDelivered(id);
  if (!updated) {
    return c.json({ success: false, message: '记录不存在或已标记' });
  }
  return c.json({ success: true, message: '已标记为送达' });
});

/** 标记推送已读 */
adminApi.post('/history/:id/read', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const pushService = new PushService(c.env, username);
  const updated = await pushService.markRead(id);
  if (!updated) {
    return c.json({ success: false, message: '记录不存在或已标记' });
  }
  return c.json({ success: true, message: '已标记为已读' });
});

/** 标记推送已点击 */
adminApi.post('/history/:id/clicked', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const pushService = new PushService(c.env, username);
  const updated = await pushService.markClicked(id);
  if (!updated) {
    return c.json({ success: false, message: '记录不存在或已标记' });
  }
  return c.json({ success: true, message: '已标记为已点击' });
});

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
  } catch (error) {
    console.error('[Template Create] Audit log failed:', error);
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
  } catch (error) {
    console.error('[Template Update] Audit log failed:', error);
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
  } catch (error) {
    console.error('[Template Delete] Audit log failed:', error);
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
    timezone?: string; // 自定义时区，例如 Asia/Shanghai, America/New_York, UTC
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
    timezone: body.timezone || 'Asia/Shanghai', // 默认与备份任务保持一致
  });

  // 记录定时推送创建日志
  try {
    const auditLogger = createAuditLogger(c.env, username);
    await auditLogger.log('scheduled_push_created', {
      scheduledPushId: push.id,
      scheduledAt: push.scheduledAt,
    });
  } catch (error) {
    console.error('[Scheduled Push Create] Audit log failed:', error);
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
    timezone?: string; // 自定义时区
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
  } catch (error) {
    console.error('[Scheduled Push Cancel] Audit log failed:', error);
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

  // 获取任务详情，检查是否是循环任务
  const pushResult = await c.env.DB.prepare(
    'SELECT * FROM scheduled_pushes WHERE id = ? AND user_id = ?'
  )
    .bind(id, username)
    .first<{
      enabled?: number;
      recurring_type?: string;
      timezone?: string;
      selected_week_days?: string;
      selected_month_days?: string;
      yearly_dates?: string;
    }>();

  let finalScheduledAt = body.scheduledAt;

  // 如果是循环任务，验证并调整到下一个匹配的时间
  if (pushResult && pushResult.enabled && pushResult.recurring_type) {
    const tz = pushResult.timezone || 'Asia/Shanghai';
    const recurringType = pushResult.recurring_type;
    const selectedWeekDays = pushResult.selected_week_days
      ? JSON.parse(pushResult.selected_week_days)
      : undefined;
    const selectedMonthDays = pushResult.selected_month_days
      ? JSON.parse(pushResult.selected_month_days)
      : undefined;
    const yearlyDates = pushResult.yearly_dates ? JSON.parse(pushResult.yearly_dates) : undefined;

    const adjusted = findNextMatchingTime(newScheduledTime, recurringType, tz, {
      selectedWeekDays,
      selectedMonthDays,
      yearlyDates,
    });

    if (adjusted) {
      finalScheduledAt = adjusted.toISOString();
    }
  }

  const rescheduled = await pushService.rescheduleOverdueTask(id, finalScheduledAt);

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
  } catch (error) {
    console.error('[Scheduled Push Reschedule] Audit log failed:', error);
  }

  return c.json({ success: true, scheduled: rescheduled, message: '任务已重新安排' });
});

// ============================================
// 推送统计
// ============================================

/** 获取推送统计 */
adminApi.get('/stats', async (c) => {
  const username = c.get('username');
  const days = parseInt(c.req.query('days') || '7', 10);

  try {
    const pushService = new PushService(c.env, username);
    const stats = await pushService.getPushStats(days);

    // 获取推送历史用于渠道使用统计（限制最多 500 条避免内存压力）
    const { records } = await getPushHistory(username, c.env, { pageSize: 500 });

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
      success: true,
      data: {
        ...stats,
        channelUsage,
      },
    });
  } catch (error) {
    console.error('[Stats] Error:', error);
    return c.json({
      success: false,
      data: {
        session: { total: 0, success: 0, failed: 0 },
        trend: { rate: 0, direction: 'stable' as const },
        recent: [],
        channelUsage: {},
      },
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

  const queueService = new QueueService(c.env);

  let results;
  if (queueService.isAvailable()) {
    const requestId = crypto.randomUUID();
    await queueService.sendPushTask({
      requestId,
      userId: username,
      payload: {
        title: body.title || '',
        body: body.content || '',
        url: body.url,
        channels: body.channels,
      },
      createdAt: new Date().toISOString(),
    });

    // 记录 Webhook 推送日志
    try {
      const auditLogger = createAuditLogger(c.env, username);
      await auditLogger.log('push_sent', {
        source: 'webhook',
        channels: body.channels,
        success: true,
      });
    } catch (error) {
      console.error('[Webhook Push] Audit log failed:', error);
    }

    return c.json({
      success: true,
      message: '推送已加入队列',
      requestId,
    });
  } else {
    // 队列不可用时同步执行
    results = await dispatchPushWithOptions(
      {
        title: body.title || '',
        body: body.content || '',
        url: body.url,
      },
      body.channels,
      username,
      c.env
    );
  }

  const success = results!.every((r: ChannelResult) => r.success);

  // 记录 Webhook 推送日志
  try {
    const auditLogger = createAuditLogger(c.env, username);
    await auditLogger.log('push_sent', {
      source: 'webhook',
      channels: body.channels,
      success,
    });
  } catch (error) {
    console.error('[Webhook Push] Audit log failed:', error);
  }

  return c.json({
    success,
    results,
    message: success ? '推送成功' : '部分推送失败',
  });
});

// ============================================
// IP 白名单管理
// ============================================

/** 获取当前用户 IP 白名单 */
adminApi.get('/me/allowed-ips', async (c) => {
  const env = c.env as Env;
  const username = c.get('username');
  const svc = new UserService(env);
  const user = await svc.findByEmail(username);
  if (!user) {
    return c.json({ error: '用户不存在' }, 404);
  }
  const ips = await svc.getAllowedIPs(user.id);
  return c.json({ success: true, ips });
});

/** 添加 IP 到白名单 */
adminApi.post('/me/allowed-ips', async (c) => {
  const env = c.env as Env;
  const username = c.get('username');
  const body = await c.req.json<{ ip: string }>();

  if (!body.ip || !body.ip.trim()) {
    return c.json({ error: 'IP 地址不能为空', code: 'VALIDATION_ERROR' }, 400);
  }

  const ip = body.ip.trim();
  // 简单验证 IPv4/IPv6 格式
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
  if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip) && !cidrRegex.test(ip)) {
    return c.json({ error: '无效的 IP 地址格式', code: 'VALIDATION_ERROR' }, 400);
  }

  const svc = new UserService(env);
  const user = await svc.findByEmail(username);
  if (!user) {
    return c.json({ error: '用户不存在' }, 404);
  }

  const ips = await svc.addAllowedIP(user.id, ip);

  try {
    const auditLogger = createAuditLogger(env, username);
    await auditLogger.log('allowed_ip_added', { ip });
  } catch (error) {
    console.error('[Allowed IP] Audit log failed:', error);
  }

  return c.json({ success: true, ips, message: 'IP 已添加到白名单' });
});

/** 从白名单删除 IP */
adminApi.delete('/me/allowed-ips', async (c) => {
  const env = c.env as Env;
  const username = c.get('username');
  const body = await c.req.json<{ ip: string }>();

  if (!body.ip) {
    return c.json({ error: 'IP 地址不能为空', code: 'VALIDATION_ERROR' }, 400);
  }

  const svc = new UserService(env);
  const user = await svc.findByEmail(username);
  if (!user) {
    return c.json({ error: '用户不存在' }, 404);
  }

  const ips = await svc.removeAllowedIP(user.id, body.ip);

  try {
    const auditLogger = createAuditLogger(env, username);
    await auditLogger.log('allowed_ip_removed', { ip: body.ip });
  } catch (error) {
    console.error('[Allowed IP] Audit log failed:', error);
  }

  return c.json({ success: true, ips, message: 'IP 已从白名单删除' });
});

/** 获取用户的 Webhook URL */
adminApi.get('/webhook/url', async (c) => {
  c.get('username'); // 保留用于中间件验证
  const baseUrl =
    (c.env as unknown as Record<string, string>).APP_URL || 'https://beeswarm.zuike.qzz.io';
  return c.json({
    webhookUrl: `${baseUrl}/api/admin/webhook/push`,
    description: '使用 X-API-Key Header 发送 POST 请求到此 URL 来触发推送',
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
// 推送草稿箱
// ============================================

/** 获取草稿列表 */
adminApi.get('/drafts', async (c) => {
  const username = c.get('username');
  const pushService = new PushService(c.env, username);
  const drafts = await pushService.getDrafts();
  return c.json({ drafts });
});

/** 创建草稿 */
adminApi.post('/drafts', async (c) => {
  const username = c.get('username');
  const body = (await c.req.json()) as {
    title: string;
    body?: string;
    url?: string;
    channels?: PushChannel[];
  };

  if (!body.title) {
    return c.json({ error: '标题不能为空', code: 'VALIDATION_ERROR' }, 400);
  }

  const pushService = new PushService(c.env, username);
  const draft = await pushService.saveDraft(body);
  return c.json({ success: true, draft });
});

/** 更新草稿 */
adminApi.put('/drafts/:id', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const body = (await c.req.json()) as {
    title?: string;
    body?: string;
    url?: string;
    channels?: PushChannel[];
  };

  const pushService = new PushService(c.env, username);
  const draft = await pushService.updateDraft(id, body);
  if (!draft) {
    return c.json({ error: '草稿不存在', code: 'NOT_FOUND' }, 404);
  }
  return c.json({ success: true, draft });
});

/** 删除草稿 */
adminApi.delete('/drafts/:id', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const pushService = new PushService(c.env, username);
  const deleted = await pushService.deleteDraft(id);
  if (!deleted) {
    return c.json({ error: '草稿不存在', code: 'NOT_FOUND' }, 404);
  }
  return c.json({ success: true, message: '草稿已删除' });
});

// ============================================
// 推送收藏夹
// ============================================

/** 获取收藏列表 */
adminApi.get('/favorites', async (c) => {
  const username = c.get('username');
  const pushService = new PushService(c.env, username);
  const favorites = await pushService.getFavorites();
  return c.json({ favorites });
});

/** 保存收藏 */
adminApi.post('/favorites', async (c) => {
  const username = c.get('username');
  const body = (await c.req.json()) as {
    title: string;
    body?: string;
    url?: string;
    channels: PushChannel[];
  };

  if (!body.title) {
    return c.json({ error: '标题不能为空', code: 'VALIDATION_ERROR' }, 400);
  }

  const pushService = new PushService(c.env, username);
  const favorite = await pushService.saveFavorite(body);
  return c.json({ success: true, favorite });
});

/** 删除收藏 */
adminApi.delete('/favorites/:id', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const pushService = new PushService(c.env, username);
  const deleted = await pushService.deleteFavorite(id);
  if (!deleted) {
    return c.json({ error: '收藏不存在', code: 'NOT_FOUND' }, 404);
  }
  return c.json({ success: true, message: '收藏已删除' });
});

// ============================================
// 推送撤销
// ============================================

/** 撤销推送 */
adminApi.post('/push-history/:id/revoke', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const pushService = new PushService(c.env, username);
  const revoked = await pushService.revokePush(id);
  if (!revoked) {
    return c.json({ error: '推送记录不存在或已撤销', code: 'NOT_FOUND' }, 404);
  }
  return c.json({ success: true, message: '推送已撤销' });
});

// ============================================
// 版本对比
// ============================================

/** 获取推送版本对比 */
adminApi.get('/push-history/:id/versions', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');

  try {
    const result = await c.env.DB.prepare(
      `SELECT id, title, body, url, channels, status, created_at FROM push_history WHERE id = ? AND user_id = ?`
    )
      .bind(id, username)
      .first<Record<string, unknown>>();

    if (!result) {
      return c.json({ error: '推送记录不存在', code: 'NOT_FOUND' }, 404);
    }

    const history = {
      id: result.id,
      title: result.title,
      body: result.body,
      url: result.url,
      channels: JSON.parse((result.channels as string) || '[]'),
      status: result.status,
      createdAt: result.created_at,
    };

    return c.json({ success: true, history });
  } catch (error) {
    console.error('[Version Compare] Error:', error);
    return c.json({ error: '获取失败', code: 'INTERNAL_ERROR' }, 500);
  }
});

/** 对比两个推送版本 */
adminApi.post('/push-history/compare', async (c) => {
  const username = c.get('username');
  const body = (await c.req.json()) as { id1: string; id2: string };

  if (!body.id1 || !body.id2) {
    return c.json({ error: '需要提供两个推送ID', code: 'VALIDATION_ERROR' }, 400);
  }

  try {
    const placeholders = '?, ?';
    const result = await c.env.DB.prepare(
      `SELECT id, title, body, url, channels, status, created_at FROM push_history WHERE id IN (${placeholders}) AND user_id = ?`
    )
      .bind(body.id1, body.id2, username)
      .all<Record<string, unknown>>();

    const records = (result.results || []).map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      url: r.url,
      channels: JSON.parse((r.channels as string) || '[]'),
      status: r.status,
      createdAt: r.created_at,
    }));

    if (records.length !== 2) {
      return c.json({ error: '找不到指定的推送记录', code: 'NOT_FOUND' }, 404);
    }

    const diff = {
      title: records[0].title !== records[1].title,
      body: records[0].body !== records[1].body,
      url: records[0].url !== records[1].url,
      channels: JSON.stringify(records[0].channels) !== JSON.stringify(records[1].channels),
    };

    return c.json({ success: true, records, diff });
  } catch (error) {
    console.error('[Version Compare] Error:', error);
    return c.json({ error: '对比失败', code: 'INTERNAL_ERROR' }, 500);
  }
});

// ============================================
// 分组批量发送
// ============================================

/** 批量发送到分组 */
adminApi.post('/groups/batch-send', async (c) => {
  const username = c.get('username');
  const body = (await c.req.json()) as {
    groupIds: string[];
    title: string;
    body?: string;
    url?: string;
  };

  if (!body.groupIds?.length || !body.title) {
    return c.json({ error: '分组ID和标题不能为空', code: 'VALIDATION_ERROR' }, 400);
  }

  const pushService = new PushService(c.env, username);
  const groups = await pushService.getChannelGroups();
  const selectedGroups = groups.filter((g) => body.groupIds.includes(g.id));

  if (selectedGroups.length === 0) {
    return c.json({ error: '未找到指定的分组', code: 'NOT_FOUND' }, 404);
  }

  const allChannels = [...new Set(selectedGroups.flatMap((g) => g.channels))];

  const payload = {
    title: body.title,
    body: body.body || '',
    url: body.url,
  };

  try {
    const results = await dispatchPush(payload, allChannels, username, c.env);

    const success = results.filter((r: ChannelResult) => r.success).length;
    const failed = results.filter((r: ChannelResult) => !r.success).length;

    return c.json({
      success: true,
      message: `发送完成：${success} 成功，${failed} 失败`,
      results,
      sentToGroups: selectedGroups.length,
      totalChannels: allChannels.length,
    });
  } catch (error) {
    console.error('[Batch Send] Error:', error);
    return c.json({ error: '批量发送失败', code: 'INTERNAL_ERROR' }, 500);
  }
});

// ============================================
// 双因素认证 (2FA / TOTP)
// ============================================

/** 生成 TOTP secret（设置 2FA） */
adminApi.post('/2fa/setup', async (c) => {
  const username = c.get('username');
  const userService = new UserService(c.env);
  const user = await userService.findByEmail(username);
  if (!user) {
    return c.json({ error: '用户不存在', code: 'NOT_FOUND' }, 404);
  }

  if (user.totp_enabled) {
    return c.json({ error: '2FA 已启用，请先禁用后再重新设置', code: 'ALREADY_ENABLED' }, 400);
  }

  const secret = generateTOTPSecret();
  const otpauthUrl = `otpauth://totp/BeeSwarm:${encodeURIComponent(username)}?secret=${secret}&issuer=BeeSwarm&algorithm=SHA1&digits=6&period=30`;
  const qrDataUrl = await generateQRCodeDataURL(otpauthUrl);

  // 临时存储 secret（未启用）
  await userService.updateUser(user.id, { totp_secret: secret });

  return c.json({
    success: true,
    secret,
    qrCode: qrDataUrl,
    otpauthUrl,
  });
});

/** 验证 TOTP code 并启用 2FA */
adminApi.post('/2fa/verify-setup', async (c) => {
  const username = c.get('username');
  const body = (await c.req.json()) as { code: string };
  const { code } = body;

  if (!code || code.length !== 6) {
    return c.json({ error: '请输入6位验证码', code: 'VALIDATION_ERROR' }, 400);
  }

  const userService = new UserService(c.env);
  const user = await userService.findByEmail(username);
  if (!user) {
    return c.json({ error: '用户不存在', code: 'NOT_FOUND' }, 404);
  }

  if (!user.totp_secret) {
    return c.json({ error: '请先生成 TOTP secret', code: 'NOT_SETUP' }, 400);
  }

  const valid = verifyTOTP(user.totp_secret, code);
  if (!valid) {
    return c.json({ error: '验证码无效', code: 'INVALID_CODE' }, 400);
  }

  await userService.updateUser(user.id, { totp_enabled: 1 });
  return c.json({ success: true, message: '2FA 已启用' });
});

/** 禁用 2FA */
adminApi.post('/2fa/disable', async (c) => {
  const username = c.get('username');
  const body = (await c.req.json()) as { code: string };
  const { code } = body;

  if (!code || code.length !== 6) {
    return c.json({ error: '请输入6位验证码', code: 'VALIDATION_ERROR' }, 400);
  }

  const userService = new UserService(c.env);
  const user = await userService.findByEmail(username);
  if (!user) {
    return c.json({ error: '用户不存在', code: 'NOT_FOUND' }, 404);
  }

  if (!user.totp_enabled || !user.totp_secret) {
    return c.json({ error: '2FA 未启用', code: 'NOT_ENABLED' }, 400);
  }

  const valid = verifyTOTP(user.totp_secret, code);
  if (!valid) {
    return c.json({ error: '验证码无效', code: 'INVALID_CODE' }, 400);
  }

  await userService.updateUser(user.id, { totp_enabled: 0, totp_secret: null });
  return c.json({ success: true, message: '2FA 已禁用' });
});

/** 获取 2FA 状态 */
adminApi.get('/2fa/status', async (c) => {
  const username = c.get('username');
  const userService = new UserService(c.env);
  const user = await userService.findByEmail(username);
  if (!user) {
    return c.json({ error: '用户不存在', code: 'NOT_FOUND' }, 404);
  }
  return c.json({
    enabled: !!user.totp_enabled,
    hasSecret: !!user.totp_secret,
  });
});

// ============================================
// AI 相关功能
// ============================================

/** 使用 AI 生成推送消息 */
adminApi.post('/ai/generate', async (c) => {
  const body = await c.req.json<{
    prompt: string;
    type?: 'title' | 'body' | 'both';
    language?: 'zh' | 'en';
  }>();

  if (!body.prompt) {
    return c.json({ error: '请提供提示词', code: 'VALIDATION_ERROR' }, 400);
  }

  const userId = c.get('userId');
  const aiService = new AIService(c.env);
  const result = await aiService.generateMessage({
    prompt: body.prompt,
    type: body.type || 'both',
    language: body.language || 'zh',
    userId,
  });

  return c.json(result);
});

/** AI 工具调用 - 执行命令 */
adminApi.post('/ai/execute', async (c) => {
  const body = await c.req.json<{
    query: string;
  }>();

  if (!body.query) {
    return c.json({ error: '请提供查询内容', code: 'VALIDATION_ERROR' }, 400);
  }

  const userId = c.get('userId');
  const username = c.get('username');

  const aiService = new AIService(c.env);
  const result = await aiService.executeCommand({
    query: body.query,
    userId,
    username,
  });

  return c.json(result);
});

/** AI Agent - 自动分析并执行任务 */
adminApi.post('/ai/agent', async (c) => {
  const body = await c.req.json<{ query: string }>();

  if (!body.query) {
    return c.json({ error: '请提供指令', code: 'VALIDATION_ERROR' }, 400);
  }

  const userId = c.get('userId');
  const username = c.get('username');

  const { AIAgentService } = await import('../services/aiAgentService');
  const agent = new AIAgentService(c.env);
  const result = await agent.execute({ query: body.query, userId, username });

  return c.json(result);
});

// ============================================
// 数据导出增强
// ============================================

/** 导出用户数据（支持 JSON/CSV 格式和时间范围过滤） */
adminApi.post('/export', async (c) => {
  const username = c.get('username');
  const body = (await c.req.json()) as {
    format?: 'json' | 'csv';
    dateRange?: { start?: string; end?: string };
  };

  const { exportUserData, exportAsCsv } = await import('../services/dataExportService');

  const data = await exportUserData(c.env, username, {
    dateRange: body.dateRange,
  });

  if (body.format === 'csv') {
    const csv = exportAsCsv(data);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="data-export-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  }

  return c.json(data);
});

// ============================================
// 备份相关审计日志
// ============================================

// 在备份路由中添加审计日志会更复杂，这里我们先完成当前的集成
// 以后可以在 backupRoutes 中进一步集成

// ============================================
// 辅助函数：计算循环任务下一个匹配的时间
// ============================================

function findNextMatchingTime(
  baseTime: Date,
  recurringType: string,
  timezone: string,
  options: {
    selectedWeekDays?: number[];
    selectedMonthDays?: number[];
    yearlyDates?: Array<{ month: number; day: number }>;
  }
): Date | null {
  const getLocalParts = (date: Date) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      weekday: 'long',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(date);
    const weekdayMap: Record<string, number> = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
    };
    return {
      year: parseInt(parts.find((p) => p.type === 'year')?.value || '0', 10),
      month: parseInt(parts.find((p) => p.type === 'month')?.value || '0', 10),
      day: parseInt(parts.find((p) => p.type === 'day')?.value || '10', 10),
      weekday: weekdayMap[parts.find((p) => p.type === 'weekday')?.value || 'Sunday'] ?? 0,
      hour: parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10),
      minute: parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10),
    };
  };

  const now = new Date();
  const local = getLocalParts(baseTime);

  switch (recurringType) {
    case 'daily': {
      for (let offset = 0; offset <= 1; offset++) {
        const candidate = new Date(
          Date.UTC(local.year, local.month - 1, local.day + offset, local.hour, local.minute, 0, 0)
        );
        if (candidate > now) return candidate;
      }
      return null;
    }

    case 'weekly': {
      const days =
        options.selectedWeekDays && options.selectedWeekDays.length > 0
          ? options.selectedWeekDays
          : [1, 2, 3, 4, 5];
      for (let offset = 0; offset <= 7; offset++) {
        const candidate = new Date(
          Date.UTC(local.year, local.month - 1, local.day + offset, local.hour, local.minute, 0, 0)
        );
        const candidateLocal = getLocalParts(candidate);
        if (days.includes(candidateLocal.weekday) && candidate > now) {
          return candidate;
        }
      }
      return null;
    }

    case 'monthly': {
      const days =
        options.selectedMonthDays && options.selectedMonthDays.length > 0
          ? options.selectedMonthDays
          : [1, 15];
      for (let offset = 0; offset <= 31; offset++) {
        const candidate = new Date(
          Date.UTC(local.year, local.month - 1, local.day + offset, local.hour, local.minute, 0, 0)
        );
        const candidateLocal = getLocalParts(candidate);
        if (days.includes(candidateLocal.day) && candidate > now) {
          return candidate;
        }
      }
      return null;
    }

    case 'yearly': {
      const dates =
        options.yearlyDates && options.yearlyDates.length > 0
          ? options.yearlyDates
          : [{ month: 1, day: 1 }];
      for (let yearOffset = 0; yearOffset <= 1; yearOffset++) {
        for (const d of dates) {
          const candidate = new Date(
            Date.UTC(local.year + yearOffset, d.month - 1, d.day, local.hour, local.minute, 0, 0)
          );
          if (candidate > now) return candidate;
        }
      }
      return null;
    }

    default: {
      // hourly, interval, cron 等直接使用用户指定的时间
      if (baseTime > now) return baseTime;
      const next = new Date(baseTime);
      next.setUTCDate(next.getUTCDate() + 1);
      return next > now ? next : null;
    }
  }
}

api.route('/admin', adminApi);
export default api;
