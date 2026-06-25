// ============================================
// Workers 应用入口
// ============================================
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, PushChannel, ChannelResult } from './types';
import api from './routes/api';
import { getBackupEndpoints, uploadBackupToEndpoint, saveBackupEndpoint } from './services/backup';
import { PushService, type ScheduledPush } from './services/push';
import { dispatchPushWithOptions } from './services/dispatcher';
import { rateLimit } from './middleware/rateLimit';
import { securityHeaders } from './middleware/securityHeaders';
import { staticCache } from './middleware/cache';
import { optionalTurnstile } from './middleware/turnstile';
import { createErrorResponse, logError } from './utils/errors';
import { convertTimezone } from './utils/timezone';
import { escapeRegex } from './utils/regex';
import { matchCronField } from './utils/cron';
import { getLocalTime, getLocalWeekday } from './utils/datetime';
import {
  getScheduledLock,
  insertScheduledLock,
  getBackupRun,
  upsertBackupRun,
} from './services/d1DataService';
import { QueueService, type PushQueueMessage } from './services/queueService';
import { MigrationService } from './services/migrationService';
import { cleanupExpiredData, detectNewTables } from './services/cleanupService';
import { SystemSettingsService } from './services/systemSettingsService';

const app = new Hono<{ Bindings: Env }>();

// 迁移标记，避免重复执行
let migrationsRan = false;

// 安全 HTTP 头
app.use('*', securityHeaders());

// 静态资源缓存（应用到静态资源路由）
app.use('*.js', staticCache());
app.use('*.css', staticCache());
app.use('*.png', staticCache());
app.use('*.jpg', staticCache());
app.use('*.jpeg', staticCache());
app.use('*.gif', staticCache());
app.use('*.ico', staticCache());
app.use('*.svg', staticCache());
app.use('*.webmanifest', staticCache());

// 请求体大小限制
const MAX_REQUEST_SIZE = 1024 * 1024; // 1MB
app.use('*', async (c, next) => {
  const contentLength = c.req.header('Content-Length');
  const transferEncoding = c.req.header('Transfer-Encoding');
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (size > MAX_REQUEST_SIZE) {
      return c.json({ error: '请求体过大，最大支持 1MB', code: 'PAYLOAD_TOO_LARGE' }, 413);
    }
  } else if (!transferEncoding || transferEncoding === 'identity') {
    // 无 Content-Length 且非 chunked 传输，视为小请求放行
  }
  await next();
});

// 限流配置（跳过 OPTIONS 预检请求）
app.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') {
    return next();
  }
  return rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: '请求过于频繁，请稍后重试',
  })(c, next);
});

// 可选的 Turnstile 验证（如果配置了）
app.use('/api/*', optionalTurnstile());

// CORS 配置 - 支持从系统设置动态获取允许的来源
app.use('*', async (c, next) => {
  const origin = c.req.header('Origin') || '';

  // 检查是否允许该来源
  const isAllowedOrigin = (allowedOrigins: string[]): boolean => {
    // 开发环境允许 localhost
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return true;
    }
    // 允许 workers.dev 域名
    if (origin.endsWith('.workers.dev')) {
      return true;
    }
    // 检查允许的来源列表（从系统设置和环境变量获取）
    for (const allowedOrigin of allowedOrigins) {
      if (origin === allowedOrigin) {
        return true;
      }
      // 安全处理通配符：转义正则特殊字符，只允许首尾单星号
      if (allowedOrigin.includes('*')) {
        const escaped = escapeRegex(allowedOrigin.replace(/\*/g, '__WILDCARD__'));
        const pattern = new RegExp(`^${escaped.replace(/__WILDCARD__/g, '[a-zA-Z0-9._-]+')}$`);
        if (pattern.test(origin)) {
          return true;
        }
      }
    }
    // 生产环境默认不允许其他来源
    return false;
  };

  // 从系统设置获取允许的来源列表
  let allowedOrigins: string[] = [];
  try {
    const systemSettings = new SystemSettingsService(c.env);
    allowedOrigins = await systemSettings.getCORSConfig();
  } catch {
    // 如果获取失败，使用环境变量作为备用
    allowedOrigins = c.env.ALLOWED_ORIGINS?.split(',').filter(Boolean) || [];
  }

  const allowedOrigin = isAllowedOrigin(allowedOrigins) ? origin : '';

  await cors({
    origin: allowedOrigin,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Token', 'X-API-Key'],
    credentials: true,
  })(c, next);
});

// 全局错误处理
app.onError((err, c) => {
  const requestId = crypto.randomUUID().slice(0, 8);

  if ('statusCode' in err && typeof err.statusCode === 'number') {
    logError(err, 'Application Error');
    const response = createErrorResponse(err as Error, requestId);
    const statusCode = (err as { statusCode: number }).statusCode as 400 | 401 | 403 | 404 | 500;
    return c.json(response, statusCode);
  }

  logError(err, 'Unexpected Error');
  const response = createErrorResponse(err, requestId);
  return c.json(response, 500);
});

// 健康检查端点（无需认证，供负载均衡器使用）
app.get('/health', async (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// API 路由
app.route('/api', api);

// 404 处理 → 返回静态资源
app.notFound(async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (!migrationsRan) {
      migrationsRan = true;
      const migrationService = new MigrationService(env);
      await migrationService.runMigrations().catch((err) => {
        console.error('[Migration] Failed to run migrations:', err);
      });

      await detectNewTables(env).catch((err) => {
        console.error('[Cleanup] Failed to detect new tables:', err);
      });
    }
    return app.fetch(request, env, ctx);
  },

  async queue(
    batch: MessageBatch<PushQueueMessage>,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const queueService = new QueueService(env);

    await queueService.processBatch(batch, async (message: PushQueueMessage) => {
      try {
        const results = await dispatchPushWithOptions(
          message.payload,
          message.payload.channels || [],
          message.userId,
          env
        );

        // 如果是定时任务的推送，需要更新状态
        if (message.payload.scheduledPushId) {
          const pushService = new PushService(env, message.userId);

          if (message.payload.isRecurring) {
            // 循环任务：计算下次执行时间
            const nowDate = new Date();
            const userTimezone = message.payload.timezone || 'Asia/Shanghai';
            const nextScheduledAt = calculateNextScheduledAt(
              {
                scheduledAt: message.payload.scheduledAt || new Date().toISOString(),
                nextRun: message.payload.scheduledAt || new Date().toISOString(),
                recurringType: message.payload.recurringType || 'daily',
                timezone: userTimezone,
              } as ScheduledPush,
              nowDate,
              userTimezone
            );
            await pushService.updateScheduledPushAndTime(
              message.payload.scheduledPushId,
              'pending',
              nextScheduledAt
            );          } else {
            // 非循环任务：更新状态
            const finalStatus = results.every((r: ChannelResult) => r.success) ? 'completed' : 'failed';
            await pushService.updateScheduledPushStatus(
              message.payload.scheduledPushId,
              finalStatus
            );          }
        }

        // dispatchPushWithOptions 已经会保存推送历史，不需要额外更新
      } catch (error) {
        console.error(
          `[Queue] Failed to process message ${message.requestId}:`,
          (error as Error).message
        );

        // 如果是定时任务的推送，需要将状态更新为 failed 并发送告警
        if (message.payload.scheduledPushId) {
          try {
            const pushService = new PushService(env, message.userId);
            await pushService.updateScheduledPushStatus(message.payload.scheduledPushId, 'failed');

            // 发送失败告警通知
            try {
              await dispatchPushWithOptions(
                {
                  title: '⚠️ 定时任务执行失败',
                  body: `任务 "${message.payload.title || '未知'}" 执行失败：${(error as Error).message}`,
                },
                message.payload.channels || [],
                message.userId,
                env
              );
            } catch {
              // 告警发送失败不影响主流程
            }
          } catch (updateError) {
            console.error(`[Queue] Failed to update task status:`, (updateError as Error).message);
          }
        }

        throw error;
      }
    });

  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const now = new Date();
    const currentEpochMinute = Math.floor(now.getTime() / 60000);

    try {
      // 自动清理过期数据（每小时执行一次）
      const systemSettings = new SystemSettingsService(env);
      await systemSettings.ensureTable();
      const cleanupConfig = await systemSettings.getCleanupConfig();

      if (cleanupConfig.enabled) {
        const cleanupResult = await cleanupExpiredData(env, {
          pushHistoryRetentionDays: cleanupConfig.pushHistoryDays,
          auditLogRetentionDays: cleanupConfig.auditLogDays,
          batchSize: cleanupConfig.batchSize,
          autoDeleteOrphanTables: cleanupConfig.autoDeleteOrphanTables,
        });
      } else {
      }

      let processedUsers = 0;
      const maxUsersPerCron = 500;

      // 从 D1 获取所有用户
      if (env.DB) {
        const result = await env.DB.prepare('SELECT email FROM users LIMIT 1000').all<{ email: string }>();
        const users = result.results || [];

        for (const row of users) {
          if (processedUsers >= maxUsersPerCron) {
            console.warn(`[Cron] Reached max users limit (${maxUsersPerCron}), stopping early`);
            break;
          }

          const username = row.email;
          ctx.waitUntil(
            processUserTasks(env, username, now, currentEpochMinute).catch((err) => {
              console.error(`[Cron] Failed to process user ${username}:`, (err as Error).message);
            })
          );

          processedUsers++;
        }
      }

    } catch (err) {
      console.error(`[Cron] Fatal error: ${(err as Error).message}`, (err as Error).stack);
    }
  },
};

/**
 * 处理单个用户的任务
 */
async function processUserTasks(
  env: Env,
  username: string,
  now: Date,
  currentEpochMinute: number
): Promise<void> {
  await Promise.all([
    processScheduledPushes(env, username, now, currentEpochMinute),
    processBackups(env, username, now, currentEpochMinute),
    detectAndRemindOverdueTasks(env, username, now),
  ]);
}

/**
 * 检测超时任务并发送提醒
 */
async function detectAndRemindOverdueTasks(env: Env, username: string, _now: Date): Promise<void> {
  try {
    const pushService = new PushService(env, username);

    // 检测并标记超时任务（默认 30 分钟）
    const overdueTasks = await pushService.detectOverdueTasks(30);

    for (const task of overdueTasks) {
      if (!task.overdueReminderSent) {
        // 发送提醒
        await sendOverdueReminder(env, username, task);

        // 标记为已发送提醒
        await markReminderSent(env, username, task.id);
      }
    }
  } catch (err) {
    console.error(`[Cron Overdue] Error for ${username}:`, (err as Error).message);
  }
}

/**
 * 发送超时提醒
 */
async function sendOverdueReminder(env: Env, username: string, task: ScheduledPush): Promise<void> {
  try {
    // 使用任务的渠道发送提醒
    const reminderTitle = `⚠️ 任务超时提醒`;
    const reminderBody = `任务 "${task.title}" 原定在 ${new Date(task.scheduledAt).toLocaleString()} 执行，但已经超时未执行。请检查或重新安排。`;

    // 使用与任务相同的渠道发送提醒
    const results = await dispatchPushWithOptions(
      {
        title: reminderTitle,
        body: reminderBody,
      },
      task.channels,
      username,
      env
    );

  } catch (err) {
    console.error(`[Overdue Reminder] Failed to send for ${task.id}:`, (err as Error).message);
  }
}

/**
 * 标记提醒已发送
 */
async function markReminderSent(env: Env, username: string, taskId: string): Promise<void> {
  try {
    if (env.DB) {
      await env.DB.prepare(
        `
        UPDATE scheduled_pushes 
        SET overdue_reminder_sent = 1, updated_at = ? 
        WHERE id = ? AND user_id = ?
      `
      )
        .bind(new Date().toISOString(), taskId, username)
        .run();
    }
  } catch (err) {
    console.error(`[markReminderSent] Error:`, (err as Error).message);
  }
}

/**
 * 处理定时推送任务 - 使用队列推送
 */
async function processScheduledPushes(
  env: Env,
  username: string,
  _now: Date,
  _currentEpochMinute: number
): Promise<void> {
  try {
    const pushService = new PushService(env, username);
    const queueService = new QueueService(env);
    const pendingPushes = await pushService.getScheduledPushes('pending');
    const nowDate = new Date();

    // 检查队列是否可用
    if (!queueService.isAvailable()) {
      console.error('[Cron ScheduledPush] Queue not available, falling back to direct push');
      // 如果队列不可用，使用直接推送
      await processScheduledPushesDirect(env, username, pushService, pendingPushes, nowDate);
      return;
    }

    for (const push of pendingPushes) {
      const scheduledTime = new Date(push.scheduledAt);
      if (scheduledTime > nowDate) {
        continue;
      }

      // 防重复执行 - 使用 D1
      const currentMinute = Math.floor(nowDate.getTime() / 60000);
      const existingLock = await getScheduledLock(env, username, push.id);
      if (existingLock && parseInt(existingLock.executedAt, 10) === currentMinute) {
        continue;
      }

      const userTimezone = push.timezone || 'Asia/Shanghai';
      const shouldExecute = shouldExecutePush(push, nowDate, scheduledTime, userTimezone);
      if (!shouldExecute) {
        continue;
      }

      // 将任务发送到队列
      const requestId = crypto.randomUUID();
      await pushService.updateScheduledPushStatus(push.id, 'processing');

      await queueService.sendPushTask({
        requestId,
        userId: username,
        payload: {
          title: push.title,
          body: push.content,
          url: push.url,
          channels: push.channels,
          scheduledPushId: push.id,
          isRecurring: push.scheduleType === 'recurring',
          recurringType: push.recurringType,
          timezone: userTimezone,
          scheduledAt: push.scheduledAt,
        },
        createdAt: new Date().toISOString(),
      });

      // 保存执行锁 - 使用 D1
      await insertScheduledLock(env, {
        id: crypto.randomUUID(),
        userId: username,
        pushId: push.id,
        executedAt: String(currentMinute),
        createdAt: nowDate.toISOString(),
      });
    }
  } catch (err) {
    console.error(`[Cron ScheduledPush] Error for ${username}:`, (err as Error).message);
  }
}

/**
 * 直接推送（队列不可用时的回退方案）
 */
async function processScheduledPushesDirect(
  env: Env,
  username: string,
  pushService: PushService,
  pendingPushes: ScheduledPush[],
  nowDate: Date
): Promise<void> {
  for (const push of pendingPushes) {
    const scheduledTime = new Date(push.scheduledAt);
    if (scheduledTime > nowDate) {
      continue;
    }

    const currentMinute = Math.floor(nowDate.getTime() / 60000);
    const existingLock = await getScheduledLock(env, username, push.id);
    if (existingLock && parseInt(existingLock.executedAt, 10) === currentMinute) {
      continue;
    }

    const userTimezone = push.timezone || 'Asia/Shanghai';
    const shouldExecute = shouldExecutePush(push, nowDate, scheduledTime, userTimezone);
    if (!shouldExecute) {
      continue;
    }

    await pushService.updateScheduledPushStatus(push.id, 'processing');
    const results = await dispatchPushWithOptions(
      {
        title: push.title,
        body: push.content,
        url: push.url,
      },
      push.channels as PushChannel[],
      username,
      env
    );

    const finalStatus = results.every((r: ChannelResult) => r.success) ? 'completed' : 'failed';
    const scheduleType = push.scheduleType || 'once';

    if (scheduleType === 'recurring') {
      const nextScheduledAt = calculateNextScheduledAt(push, nowDate, userTimezone);
      await pushService.updateScheduledPushAndTime(push.id, 'pending', nextScheduledAt);
    } else {
      await pushService.updateScheduledPushStatus(push.id, finalStatus);
    }

    await insertScheduledLock(env, {
      id: crypto.randomUUID(),
      userId: username,
      pushId: push.id,
      executedAt: String(currentMinute),
      createdAt: nowDate.toISOString(),
    });
  }
}

/**
 * 计算下次执行时间
 * @param push 定时任务
 * @param nowDate 当前时间（UTC）
 * @param userTimezone 用户时区，默认 Asia/Shanghai
 */
function calculateNextScheduledAt(
  push: ScheduledPush,
  nowDate: Date,
  userTimezone?: string
): string {
  const scheduledTime = new Date(push.scheduledAt);
  const recurringType = push.recurringType || 'daily';
  const timezone = userTimezone || push.timezone || 'Asia/Shanghai';

  // 从最后一次预计执行时间开始
  const baseTime = new Date(push.nextRun || push.scheduledAt);

  // 使用用户时区设置小时和分钟
  const { hour, minute } = getLocalTime(scheduledTime, timezone);

  switch (recurringType) {
    case 'hourly': {
      // 在用户时区的整点小时计算
      const nextTime = new Date(baseTime);
      nextTime.setUTCHours(nextTime.getUTCHours() + 1);
      // 确保在当前时间之后
      while (nextTime <= nowDate) {
        nextTime.setUTCHours(nextTime.getUTCHours() + 1);
      }
      return nextTime.toISOString();
    }

    case 'interval': {
      const intervalHours = push.intervalHours || 2;
      const nextTime = new Date(baseTime);
      nextTime.setUTCHours(nextTime.getUTCHours() + intervalHours);
      while (nextTime <= nowDate) {
        nextTime.setUTCHours(nextTime.getUTCHours() + intervalHours);
      }
      return nextTime.toISOString();
    }

    case 'daily': {
      const nextTime = new Date(baseTime);
      nextTime.setUTCDate(nextTime.getUTCDate() + 1);
      while (nextTime <= nowDate) {
        nextTime.setUTCDate(nextTime.getUTCDate() + 1);
      }
      return nextTime.toISOString();
    }

    case 'weekly': {
      const selectedWeekDays = push.selectedWeekDays || [1, 2, 3, 4, 5];
      const nextTime = new Date(baseTime);

      // 从下一天开始找
      for (let i = 1; i <= 14; i++) {
        const checkDate = new Date(nextTime);
        checkDate.setUTCDate(nextTime.getUTCDate() + i);
        if (selectedWeekDays.includes(checkDate.getUTCDay())) {
          if (checkDate > nowDate) {
            return checkDate.toISOString();
          }
        }
      }

      // 如果两周内没找到，默认下一周同一天
      const fallbackTime = new Date(baseTime);
      fallbackTime.setUTCDate(fallbackTime.getUTCDate() + 7);
      while (fallbackTime <= nowDate) {
        fallbackTime.setUTCDate(fallbackTime.getUTCDate() + 7);
      }
      return fallbackTime.toISOString();
    }

    case 'monthly': {
      const selectedMonthDays = push.selectedMonthDays || [1, 15];
      const nextTime = new Date(baseTime);

      // 从下一天开始找
      for (let i = 1; i <= 62; i++) {
        const checkDate = new Date(nextTime);
        checkDate.setUTCDate(nextTime.getUTCDate() + i);

        const lastDayOfMonth = new Date(
          Date.UTC(checkDate.getUTCFullYear(), checkDate.getUTCMonth() + 1, 0)
        ).getUTCDate();

        for (const day of selectedMonthDays) {
          const effectiveDay = day > lastDayOfMonth ? lastDayOfMonth : day;

          if (checkDate.getUTCDate() === effectiveDay && checkDate > nowDate) {
            return checkDate.toISOString();
          }
        }
      }

      // 默认下一个月同一天
      const fallbackTime = new Date(baseTime);
      fallbackTime.setUTCMonth(fallbackTime.getUTCMonth() + 1);
      while (fallbackTime <= nowDate) {
        fallbackTime.setUTCMonth(fallbackTime.getUTCMonth() + 1);
      }
      return fallbackTime.toISOString();
    }

    case 'intervalMonth': {
      const intervalMonths = push.intervalMonths || 1;
      const nextTime = new Date(baseTime);
      nextTime.setUTCMonth(nextTime.getUTCMonth() + intervalMonths);
      while (nextTime <= nowDate) {
        nextTime.setUTCMonth(nextTime.getUTCMonth() + intervalMonths);
      }
      return nextTime.toISOString();
    }

    case 'yearly': {
      const yearlyDates = push.yearlyDates || [{ month: 1, day: 1 }];

      // 查找下一个有效日期
      for (let yearOffset = 0; yearOffset <= 10; yearOffset++) {
        const checkYear = nowDate.getUTCFullYear() + yearOffset;

        for (const dateConfig of yearlyDates) {
          let targetDate = new Date(
            Date.UTC(checkYear, dateConfig.month - 1, dateConfig.day, hour, minute, 0, 0)
          );

          // 处理闰年2月29日
          if (dateConfig.month === 2 && dateConfig.day === 29) {
            const isLeapYear =
              (checkYear % 4 === 0 && checkYear % 100 !== 0) || checkYear % 400 === 0;
            if (!isLeapYear) {
              targetDate = new Date(Date.UTC(checkYear, 2, 1, hour, minute, 0, 0));
            }
          }

          if (targetDate > nowDate) {
            return targetDate.toISOString();
          }
        }
      }

      // 默认返回明年1月1日
      const defaultDate = new Date(
        Date.UTC(nowDate.getUTCFullYear() + 1, 0, 1, hour, minute, 0, 0)
      );
      return defaultDate.toISOString();
    }

    case 'intervalYear': {
      const intervalYears = push.intervalYears || 1;
      const nextTime = new Date(baseTime);
      nextTime.setUTCFullYear(nextTime.getUTCFullYear() + intervalYears);
      while (nextTime <= nowDate) {
        nextTime.setUTCFullYear(nextTime.getUTCFullYear() + intervalYears);
      }
      return nextTime.toISOString();
    }

    case 'cron': {
      if (push.cronExpression) {
        const nextTime = calculateNextCronTime(push.cronExpression, nowDate);
        if (nextTime) {
          return nextTime.toISOString();
        }
      }
      // 如果解析失败，默认加一天
      const nextTime = new Date(baseTime);
      nextTime.setUTCDate(nextTime.getUTCDate() + 1);
      while (nextTime <= nowDate) {
        nextTime.setUTCDate(nextTime.getUTCDate() + 1);
      }
      return nextTime.toISOString();
    }

    default: {
      const nextTime = new Date(baseTime);
      nextTime.setUTCDate(nextTime.getUTCDate() + 1);
      while (nextTime <= nowDate) {
        nextTime.setUTCDate(nextTime.getUTCDate() + 1);
      }
      return nextTime.toISOString();
    }
  }
}

/**
 * 解析 cron 表达式计算下一次执行时间
 */
function calculateNextCronTime(cronExpression: string, nowDate: Date): Date | null {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return null;
  }

  const [minuteStr, hourStr, dayOfMonthStr, monthStr, dayOfWeekStr] = parts;

  const parseCronField = (field: string, minVal: number, maxVal: number): number[] => {
    const values: Set<number> = new Set();
    const segments = field.split(',');
    for (const segment of segments) {
      const [rangePart, stepPart] = segment.split('/');
      const step = stepPart ? parseInt(stepPart, 10) : 1;
      if (isNaN(step) || step < 1) continue;

      if (rangePart === '*') {
        for (let i = minVal; i <= maxVal; i += step) {
          values.add(i);
        }
      } else if (rangePart.includes('-')) {
        const [start, end] = rangePart.split('-').map((v) => parseInt(v, 10));
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = start; i <= end; i += step) {
            if (i >= minVal && i <= maxVal) values.add(i);
          }
        }
      } else {
        const val = parseInt(rangePart, 10);
        if (!isNaN(val) && val >= minVal && val <= maxVal) {
          if (stepPart) {
            for (let i = val; i <= maxVal; i += step) {
              values.add(i);
            }
          } else {
            values.add(val);
          }
        }
      }
    }
    return Array.from(values).sort((a, b) => a - b);
  };

  const validMinutes = parseCronField(minuteStr, 0, 59);
  const validHours = parseCronField(hourStr, 0, 23);
  const validDaysOfMonth = dayOfMonthStr === '*' ? null : parseCronField(dayOfMonthStr, 1, 31);
  const validMonths = monthStr === '*' ? null : parseCronField(monthStr, 1, 12);
  const validDaysOfWeek = dayOfWeekStr === '*' ? null : parseCronField(dayOfWeekStr, 0, 6);

  if (validMinutes.length === 0 || validHours.length === 0) {
    return null;
  }

  let current = new Date(nowDate);
  current.setSeconds(0, 0);
  current.setMinutes(current.getMinutes() + 1);

  const maxIterations = 525600;
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    const minuteMatches = validMinutes.includes(current.getMinutes());
    const hourMatches = validHours.includes(current.getHours());
    const dayMatches = !validDaysOfMonth || validDaysOfMonth.includes(current.getDate());
    const monthMatches = !validMonths || validMonths.includes(current.getMonth() + 1);
    const weekdayMatches = !validDaysOfWeek || validDaysOfWeek.includes(current.getDay());

    if (minuteMatches && hourMatches && dayMatches && monthMatches && weekdayMatches) {
      return new Date(current);
    }

    if (!minuteMatches) {
      const currentMin = current.getMinutes();
      const nextMinute = validMinutes.find((m) => m > currentMin);
      if (nextMinute !== undefined) {
        current.setMinutes(nextMinute);
      } else {
        current.setHours(current.getHours() + 1);
        current.setMinutes(validMinutes[0]);
      }
      current.setSeconds(0, 0);
      continue;
    }

    if (!hourMatches) {
      const currentHour = current.getHours();
      const nextHour = validHours.find((h) => h > currentHour);
      if (nextHour !== undefined) {
        current.setHours(nextHour);
      } else {
        current.setDate(current.getDate() + 1);
        current.setHours(validHours[0]);
      }
      current.setMinutes(validMinutes[0]);
      current.setSeconds(0, 0);
      continue;
    }

    if (!dayMatches || !monthMatches || !weekdayMatches) {
      current.setDate(current.getDate() + 1);
      current.setHours(validHours[0]);
      current.setMinutes(validMinutes[0]);
      current.setSeconds(0, 0);
      continue;
    }
  }

  return null;
}

/**
 * 判断是否应该执行推送
 * @param push 定时任务
 * @param nowDate 当前时间（UTC）
 * @param scheduledTime 计划执行时间（UTC）
 * @param userTimezone 用户时区，默认 Asia/Shanghai
 */
function shouldExecutePush(
  push: ScheduledPush,
  nowDate: Date,
  scheduledTime: Date,
  userTimezone?: string
): boolean {
  const scheduleType = push.scheduleType || 'once';

  if (scheduleType !== 'recurring') {
    return true;
  }

  const recurringType = push.recurringType || 'daily';
  const timezone = userTimezone || push.timezone || 'Asia/Shanghai';

  // 使用用户配置的时区获取本地时间
  const { hour: nowHour, minute: nowMinute } = getLocalTime(nowDate, timezone);
  const nowDay = getLocalWeekday(nowDate, timezone);

  switch (recurringType) {
    case 'hourly':
      return true;

    case 'interval': {
      const scheduledLocal = getLocalTime(scheduledTime, timezone);
      const hoursSinceStart = Math.floor(
        ((nowHour - scheduledLocal.hour + 24) % 24) +
          Math.floor((nowDate.getTime() - scheduledTime.getTime()) / (1000 * 60 * 60))
      );
      return hoursSinceStart > 0 && hoursSinceStart % (push.intervalHours || 2) === 0;
    }

    case 'daily':
      return true;

    case 'weekly': {
      const selectedWeekDays = push.selectedWeekDays || [1, 2, 3, 4, 5];
      return selectedWeekDays.includes(nowDay);
    }

    case 'monthly': {
      const selectedMonthDays = push.selectedMonthDays || [1, 15];
      const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
      const localDateStr = formatter.format(nowDate);
      const nowDateOfMonth = parseInt(localDateStr.split('-')[2], 10);

      const lastDayOfMonth = new Date(
        Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() + 1, 0)
      ).getUTCDate();
      const effectiveDays = selectedMonthDays.map((day) =>
        day > lastDayOfMonth ? lastDayOfMonth : day
      );
      return effectiveDays.includes(nowDateOfMonth);
    }

    case 'yearly': {
      const yearlyDates = push.yearlyDates || [{ month: 1, day: 1 }];

      const monthFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        month: 'numeric',
      });
      const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, day: 'numeric' });
      const nowMonth = parseInt(monthFormatter.format(nowDate), 10);
      const nowDayOfMonth = parseInt(dayFormatter.format(nowDate), 10);

      for (const dateConfig of yearlyDates) {
        if (dateConfig.month === nowMonth) {
          if (dateConfig.month === 2 && dateConfig.day === 29) {
            const isLeapYear =
              (nowDate.getUTCFullYear() % 4 === 0 && nowDate.getUTCFullYear() % 100 !== 0) ||
              nowDate.getUTCFullYear() % 400 === 0;
            if (isLeapYear) {
              return nowDayOfMonth === 29;
            } else {
              return nowMonth === 3 && nowDayOfMonth === 1;
            }
          } else {
            if (dateConfig.day === nowDayOfMonth) {
              return true;
            }
          }
        }
      }
      return false;
    }

    case 'cron':
      if (push.cronExpression) {
        const parts = push.cronExpression.trim().split(/\s+/);
        if (parts.length === 5) {
          const [minuteField, hourField, dayOfMonthField, monthField, dayOfWeekField] = parts;
          const monthFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            month: 'numeric',
          });
          const dayFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            day: 'numeric',
          });
          const localMonth = parseInt(monthFormatter.format(nowDate), 10);
          const localDayOfMonth = parseInt(dayFormatter.format(nowDate), 10);

          const matchesMinute = matchCronField(minuteField, nowMinute);
          const matchesHour = matchCronField(hourField, nowHour);
          const matchesDayOfMonth = matchCronField(dayOfMonthField, localDayOfMonth);
          const matchesMonth = matchCronField(monthField, localMonth);
          const matchesDayOfWeek = matchCronField(dayOfWeekField, nowDay);
          return (
            matchesMinute && matchesHour && matchesDayOfMonth && matchesMonth && matchesDayOfWeek
          );
        }
      }
      return true;

    default:
      return true;
  }
}

/**
 * 处理备份任务
 */
async function processBackups(
  env: Env,
  username: string,
  now: Date,
  currentEpochMinute: number
): Promise<void> {
  try {
    const endpoints = await getBackupEndpoints(env, username);

    // 调试日志：检查备份端点    for (const ep of endpoints) {    }

    for (const endpoint of endpoints) {
      if (!endpoint.enabled || !endpoint.schedule?.enabled) {
        continue;
      }

      const schedule = endpoint.schedule || { enabled: false, interval: 24, startTime: '02:00' };
      const startTime = schedule.startTime || '02:00';
      const [startHour, startMinute] = startTime.split(':').map(Number);
      const interval = schedule.interval || 24;
      const tz = convertTimezone(schedule.timezone || 'Asia/Shanghai');
      const { hour: localHour, minute: localMinute } = getLocalTime(now, tz);

      // 调试日志：检查时间条件      // 允许 ±2 分钟的时间窗口，因为 cron 每 5 分钟触发一次
      const timeDiffMinutes = Math.abs((localHour - startHour) * 60 + (localMinute - startMinute));
      const inTimeWindow = timeDiffMinutes <= 2;

      let shouldRun = false;
      if (interval >= 168) {
        const currentDay = getLocalWeekday(now, tz);
        const expectedDay = schedule.startDay ?? 0;
        shouldRun = currentDay === expectedDay && inTimeWindow;
      } else if (interval >= 24) {
        shouldRun = inTimeWindow;
      } else {
        // 对于小于24小时的间隔，检查是否在任何一个执行时间点附近
        // 计算从startHour开始，每interval小时的时间点
        for (let h = startHour; h < 48; h += interval) {
          const hour = h % 24;
          const intervalTimeDiff = Math.abs((hour - localHour) * 60 + (startMinute - localMinute));
          if (intervalTimeDiff <= 2) {
            shouldRun = true;
            break;
          }
        }
      }

      if (!shouldRun) {        continue;
      }

      // 检查最后一次运行时间，防止重复执行 - 使用 D1
      const backupRun = await getBackupRun(env, username, endpoint.id);
      const lastRunEpoch = backupRun ? backupRun.lastRun : 0;
      const hoursSinceLastRun = (currentEpochMinute - lastRunEpoch) / 60;

      // 确保至少间隔 interval * 0.8 小时才再次运行，避免重复执行
      const minIntervalHours = Math.max(1, interval * 0.8);
      if (backupRun && hoursSinceLastRun < minIntervalHours) {        continue;
      }

      const result = await uploadBackupToEndpoint(env, username, endpoint);
      endpoint.lastBackup = {
        time: new Date().toISOString(),
        status: result.success ? 'success' : 'failed',
        message: result.message,
      };
      await saveBackupEndpoint(env, username, endpoint);

      // 保存备份运行记录 - 使用 D1
      const nowStr = new Date().toISOString();
      await upsertBackupRun(env, {
        id: backupRun ? backupRun.id : crypto.randomUUID(),
        userId: username,
        endpointId: endpoint.id,
        lastRun: currentEpochMinute,
        createdAt: backupRun ? backupRun.createdAt : nowStr,
        updatedAt: nowStr,
      });    }
  } catch (err) {
    console.error(
      `[Cron Backup] Error for ${username}:`,
      (err as Error).message,
      (err as Error).stack
    );
  }
}
