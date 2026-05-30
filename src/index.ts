// ============================================
// Workers 应用入口
// ============================================
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, PushChannel } from './types';
import api from './routes/api';
import { getBackupEndpoints, uploadBackupToEndpoint, saveBackupEndpoint } from './services/backup';
import { PushService, type ScheduledPush } from './services/push';
import { dispatchPushWithOptions } from './services/dispatcher';
import { rateLimit } from './middleware/rateLimit';
import { securityHeaders } from './middleware/securityHeaders';
import { createErrorResponse, logError } from './utils/errors';
import { convertTimezone } from './utils/timezone';
import { escapeRegex } from './utils/regex';
import { matchCronField } from './utils/cron';
import { getLocalTime, getLocalWeekday } from './utils/datetime';

const app = new Hono<{ Bindings: Env }>();

// 安全 HTTP 头
app.use('*', securityHeaders());

// 请求体大小限制
const MAX_REQUEST_SIZE = 1024 * 1024; // 1MB
app.use('*', async (c, next) => {
  const contentLength = c.req.header('Content-Length');
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (size > MAX_REQUEST_SIZE) {
      return c.json({ error: '请求体过大，最大支持 1MB', code: 'PAYLOAD_TOO_LARGE' }, 413);
    }
  }
  await next();
});

// 限流配置
app.use(
  '*',
  rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: '请求过于频繁，请稍后重试',
  })
);

// CORS 配置
app.use('*', async (c, next) => {
  const origin = c.req.header('Origin') || '';

  // 检查是否允许该来源
  const isAllowedOrigin = (): boolean => {
    // 开发环境允许 localhost
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return true;
    }
    // 允许 workers.dev 域名
    if (origin.endsWith('.workers.dev')) {
      return true;
    }
    // 检查环境变量配置的允许来源列表
    const allowedOrigins = c.env.ALLOWED_ORIGINS?.split(',') || [];
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

  const allowedOrigin = isAllowedOrigin() ? origin : '';

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
    return app.fetch(request, env, ctx);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const now = new Date();
    const currentEpochMinute = Math.floor(now.getTime() / 60000);

    try {
      let cursor: string | undefined;
      let listComplete = false;
      let processedUsers = 0;
      const maxUsersPerCron = 500; // 避免处理过多用户超时

      do {
        const list = await env.SUBSCRIPTIONS.list({ prefix: 'user:', cursor, limit: 100 });

        for (const key of list.keys) {
          if (processedUsers >= maxUsersPerCron) {
            console.warn(`[Cron] Reached max users limit (${maxUsersPerCron}), stopping early`);
            break;
          }

          const username = key.name.replace('user:', '');
          if (username.includes(':')) continue;

          // 处理单个用户的所有任务
          ctx.waitUntil(
            processUserTasks(env, username, now, currentEpochMinute).catch((err) => {
              console.error(`[Cron] Failed to process user ${username}:`, (err as Error).message);
            })
          );

          processedUsers++;
        }

        cursor = (list as { cursor?: string }).cursor;
        listComplete = list.list_complete ?? false;
      } while (cursor && !listComplete && processedUsers < maxUsersPerCron);

      console.log(`[Cron] Completed. Processed ${processedUsers} users`);
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
  ]);
}

/**
 * 处理定时推送任务
 */
async function processScheduledPushes(
  env: Env,
  username: string,
  _now: Date,
  _currentEpochMinute: number
): Promise<void> {
  try {
    const pushService = new PushService(env, username);
    const pendingPushes = await pushService.getScheduledPushes('pending');
    const nowDate = new Date();

    for (const push of pendingPushes) {
      const scheduledTime = new Date(push.scheduledAt);
      if (scheduledTime > nowDate) {
        continue;
      }

      // 防重复执行
      const execKey = `scheduled_exec:${username}:${push.id}`;
      const currentMinute = Math.floor(nowDate.getTime() / 60000);
      const alreadyExecuted = await env.SUBSCRIPTIONS.get(execKey);
      if (alreadyExecuted && parseInt(alreadyExecuted, 10) === currentMinute) {
        continue;
      }

      const shouldExecute = shouldExecutePush(push, nowDate, scheduledTime);
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

      const finalStatus = results.every((r) => r.success) ? 'completed' : 'failed';
      const scheduleType = push.scheduleType || 'once';

      if (scheduleType === 'recurring') {
        await pushService.updateScheduledPushStatus(push.id, 'pending');
      } else {
        await pushService.updateScheduledPushStatus(push.id, finalStatus);
      }

      await env.SUBSCRIPTIONS.put(execKey, String(currentMinute), {
        expirationTtl: 24 * 60 * 60,
      });
    }
  } catch (err) {
    console.error(`[Cron ScheduledPush] Error for ${username}:`, (err as Error).message);
  }
}

/**
 * 判断是否应该执行推送
 */
function shouldExecutePush(push: ScheduledPush, nowDate: Date, scheduledTime: Date): boolean {
  const scheduleType = push.scheduleType || 'once';

  if (scheduleType !== 'recurring') {
    return true;
  }

  const recurringType = push.recurringType || 'daily';
  const nowHour = nowDate.getHours();
  const nowMinute = nowDate.getMinutes();
  const nowDay = nowDate.getDay();
  const nowDateOfMonth = nowDate.getDate();
  const pushHour = scheduledTime.getHours();
  const pushMinute = scheduledTime.getMinutes();

  switch (recurringType) {
    case 'hourly':
      return nowMinute === pushMinute;

    case 'interval': {
      const intervalHours = push.intervalHours || 2;
      const hoursSinceStart = Math.floor(
        (nowDate.getTime() - scheduledTime.getTime()) / (1000 * 60 * 60)
      );
      return (
        hoursSinceStart > 0 && hoursSinceStart % intervalHours === 0 && nowMinute === pushMinute
      );
    }

    case 'daily':
      return nowHour === pushHour && nowMinute === pushMinute;

    case 'weekly': {
      const selectedWeekDays = push.selectedWeekDays || [1, 2, 3, 4, 5];
      return selectedWeekDays.includes(nowDay) && nowHour === pushHour && nowMinute === pushMinute;
    }

    case 'monthly': {
      const selectedMonthDays = push.selectedMonthDays || [1, 15];
      return (
        selectedMonthDays.includes(nowDateOfMonth) &&
        nowHour === pushHour &&
        nowMinute === pushMinute
      );
    }

    case 'cron':
      if (push.cronExpression) {
        const parts = push.cronExpression.trim().split(/\s+/);
        if (parts.length === 5) {
          const [minuteField, hourField, dayOfMonthField, monthField, dayOfWeekField] = parts;
          const matchesMinute = matchCronField(minuteField, nowMinute);
          const matchesHour = matchCronField(hourField, nowHour);
          const matchesDayOfMonth = matchCronField(dayOfMonthField, nowDateOfMonth);
          const matchesMonth = matchCronField(monthField, nowDate.getMonth() + 1);
          const matchesDayOfWeek = matchCronField(dayOfWeekField, nowDay);
          return (
            matchesMinute && matchesHour && matchesDayOfMonth && matchesMonth && matchesDayOfWeek
          );
        }
      }
      return nowHour === pushHour && nowMinute === pushMinute;

    default:
      return nowHour === pushHour && nowMinute === pushMinute;
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

    for (const endpoint of endpoints) {
      if (!endpoint.enabled || !endpoint.schedule.enabled) continue;

      const [startHour, startMinute] = endpoint.schedule.startTime.split(':').map(Number);
      const interval = endpoint.schedule.interval || 24;
      const tz = convertTimezone(endpoint.schedule.timezone || 'Asia/Shanghai');
      const { hour: localHour, minute: localMinute } = getLocalTime(now, tz);

      let shouldRun = false;
      if (interval >= 168) {
        const currentDay = getLocalWeekday(now, tz);
        const expectedDay = endpoint.schedule.startDay ?? 0;
        shouldRun =
          currentDay === expectedDay && localHour === startHour && localMinute === startMinute;
      } else if (interval >= 24) {
        shouldRun = localHour === startHour && localMinute === startMinute;
      } else {
        for (let h = startHour; h < 24; h += interval) {
          if (h === localHour && localMinute === startMinute) {
            shouldRun = true;
            break;
          }
        }
      }

      if (!shouldRun) continue;

      const lastRunKey = `backup_last_run:${username}:${endpoint.id}`;
      const lastRunStr = await env.SUBSCRIPTIONS.get(lastRunKey);
      if (lastRunStr && parseInt(lastRunStr, 10) === currentEpochMinute) {
        continue;
      }

      const result = await uploadBackupToEndpoint(env, username, endpoint);
      endpoint.lastBackup = {
        time: new Date().toISOString(),
        status: result.success ? 'success' : 'failed',
        message: result.message,
      };
      await saveBackupEndpoint(env, username, endpoint);
      await env.SUBSCRIPTIONS.put(lastRunKey, String(currentEpochMinute), {
        expirationTtl: 24 * 60 * 60,
      });
    }
  } catch (err) {
    console.error(`[Cron Backup] Error for ${username}:`, (err as Error).message);
  }
}
