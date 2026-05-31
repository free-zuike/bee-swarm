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

    console.log(`[Overdue Reminder] Sent for task ${task.id}, results:`, results);
  } catch (err) {
    console.error(`[Overdue Reminder] Failed to send for ${task.id}:`, (err as Error).message);
  }
}

/**
 * 标记提醒已发送
 */
async function markReminderSent(env: Env, username: string, taskId: string): Promise<void> {
  const key = `scheduled:${username}`;
  const stored = await env.SUBSCRIPTIONS.get(key);
  if (!stored) return;

  const pushes: ScheduledPush[] = JSON.parse(stored);
  const push = pushes.find((p) => p.id === taskId);

  if (push) {
    push.overdueReminderSent = true;
    await env.SUBSCRIPTIONS.put(key, JSON.stringify(pushes));
  }
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
        // 计算下次执行时间
        const nextScheduledAt = calculateNextScheduledAt(push, nowDate);
        await pushService.updateScheduledPushAndTime(push.id, 'pending', nextScheduledAt);
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
 * 计算下次执行时间
 */
function calculateNextScheduledAt(push: ScheduledPush, nowDate: Date): string {
  const scheduledTime = new Date(push.scheduledAt);
  const recurringType = push.recurringType || 'daily';
  const nextTime = new Date(nowDate);

  switch (recurringType) {
    case 'hourly': {
      nextTime.setHours(nextTime.getHours() + 1);
      nextTime.setMinutes(scheduledTime.getMinutes(), 0, 0);
      break;
    }

    case 'interval': {
      const intervalHours = push.intervalHours || 2;
      nextTime.setHours(nextTime.getHours() + intervalHours);
      nextTime.setMinutes(scheduledTime.getMinutes(), 0, 0);
      break;
    }

    case 'daily': {
      nextTime.setDate(nextTime.getDate() + 1);
      nextTime.setHours(scheduledTime.getHours(), scheduledTime.getMinutes(), 0, 0);
      break;
    }

    case 'weekly': {
      const selectedWeekDays = push.selectedWeekDays || [1, 2, 3, 4, 5];

      // 确保我们有一个有效的日期作为基础
      const baseTime = new Date(nowDate);
      baseTime.setHours(scheduledTime.getHours(), scheduledTime.getMinutes(), 0, 0);

      // 先检查今天是否符合条件，如果还没到时间就用今天
      if (baseTime > nowDate && selectedWeekDays.includes(baseTime.getDay())) {
        return baseTime.toISOString();
      }

      // 找到下一个符合条件的星期
      for (let i = 1; i <= 7; i++) {
        const checkDate = new Date(baseTime);
        checkDate.setDate(baseTime.getDate() + i);
        if (selectedWeekDays.includes(checkDate.getDay())) {
          return checkDate.toISOString();
        }
      }

      // 默认下一周同一天
      baseTime.setDate(baseTime.getDate() + 7);
      return baseTime.toISOString();
    }

    case 'monthly': {
      const selectedMonthDays = push.selectedMonthDays || [1, 15];

      // 确保我们有一个有效的日期作为基础
      const baseTime = new Date(nowDate);
      baseTime.setHours(scheduledTime.getHours(), scheduledTime.getMinutes(), 0, 0);

      // 先检查今天是否符合条件，如果还没到时间就用今天
      if (baseTime > nowDate && selectedMonthDays.includes(baseTime.getDate())) {
        return baseTime.toISOString();
      }

      // 找到下一个符合条件的日期
      for (let i = 1; i <= 31; i++) {
        const checkDate = new Date(baseTime);
        checkDate.setDate(baseTime.getDate() + i);

        // 处理月末
        const lastDayOfMonth = new Date(
          checkDate.getFullYear(),
          checkDate.getMonth() + 1,
          0
        ).getDate();

        for (const day of selectedMonthDays) {
          // 如果选中的日期超过了本月最后一天，就用最后一天
          const effectiveDay = day > lastDayOfMonth ? lastDayOfMonth : day;

          if (checkDate.getDate() === effectiveDay) {
            return checkDate.toISOString();
          }
        }
      }

      // 默认下一个月同一天
      baseTime.setMonth(baseTime.getMonth() + 1);
      return baseTime.toISOString();
    }

    case 'intervalMonth': {
      const intervalMonths = push.intervalMonths || 1;
      nextTime.setMonth(nextTime.getMonth() + intervalMonths);
      nextTime.setHours(scheduledTime.getHours(), scheduledTime.getMinutes(), 0, 0);
      break;
    }

    case 'yearly': {
      nextTime.setFullYear(nextTime.getFullYear() + 1);
      nextTime.setHours(scheduledTime.getHours(), scheduledTime.getMinutes(), 0, 0);
      break;
    }

    case 'intervalYear': {
      const intervalYears = push.intervalYears || 1;
      nextTime.setFullYear(nextTime.getFullYear() + intervalYears);
      nextTime.setHours(scheduledTime.getHours(), scheduledTime.getMinutes(), 0, 0);
      break;
    }

    case 'cron':
    default: {
      // 对于 cron 或其他类型，默认加一天
      nextTime.setDate(nextTime.getDate() + 1);
      nextTime.setHours(scheduledTime.getHours(), scheduledTime.getMinutes(), 0, 0);
      break;
    }
  }

  // 确保下次执行时间在当前时间之后
  if (nextTime <= nowDate) {
    nextTime.setDate(nextTime.getDate() + 1);
  }

  return nextTime.toISOString();
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

  // 允许 ±2 分钟的时间窗口
  const timeDiffMinutes = Math.abs((nowHour - pushHour) * 60 + (nowMinute - pushMinute));
  const isTimeMatch = timeDiffMinutes <= 2;

  switch (recurringType) {
    case 'hourly':
      return isTimeMatch;

    case 'interval': {
      const intervalHours = push.intervalHours || 2;
      const hoursSinceStart = Math.floor(
        (nowDate.getTime() - scheduledTime.getTime()) / (1000 * 60 * 60)
      );
      return hoursSinceStart > 0 && hoursSinceStart % intervalHours === 0 && isTimeMatch;
    }

    case 'daily':
      return isTimeMatch;

    case 'weekly': {
      const selectedWeekDays = push.selectedWeekDays || [1, 2, 3, 4, 5];
      return selectedWeekDays.includes(nowDay) && isTimeMatch;
    }

    case 'monthly': {
      const selectedMonthDays = push.selectedMonthDays || [1, 15];
      // 处理月末
      const lastDayOfMonth = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 0).getDate();
      const effectiveDays = selectedMonthDays.map((day) =>
        day > lastDayOfMonth ? lastDayOfMonth : day
      );
      return effectiveDays.includes(nowDateOfMonth) && isTimeMatch;
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
      return isTimeMatch;

    default:
      return isTimeMatch;
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
      if (!endpoint.enabled || !endpoint.schedule.enabled) {
        continue;
      }

      const startTime = endpoint.schedule.startTime || '02:00';
      const [startHour, startMinute] = startTime.split(':').map(Number);
      const interval = endpoint.schedule.interval || 24;
      const tz = convertTimezone(endpoint.schedule.timezone || 'Asia/Shanghai');
      const { hour: localHour, minute: localMinute } = getLocalTime(now, tz);

      // 允许 ±2 分钟的时间窗口，因为 cron 每 5 分钟触发一次
      const timeDiffMinutes = Math.abs((localHour - startHour) * 60 + (localMinute - startMinute));
      const inTimeWindow = timeDiffMinutes <= 2;

      let shouldRun = false;
      if (interval >= 168) {
        const currentDay = getLocalWeekday(now, tz);
        const expectedDay = endpoint.schedule.startDay ?? 0;
        shouldRun = currentDay === expectedDay && inTimeWindow;
      } else if (interval >= 24) {
        shouldRun = inTimeWindow;
      } else {
        for (let h = startHour; h < 24; h += interval) {
          const intervalTimeDiff = Math.abs((h - localHour) * 60 + (startMinute - localMinute));
          if (intervalTimeDiff <= 2) {
            shouldRun = true;
            break;
          }
        }
      }

      if (!shouldRun) {
        continue;
      }

      // 检查最后一次运行时间，防止重复执行
      const lastRunKey = `backup_last_run:${username}:${endpoint.id}`;
      const lastRunStr = await env.SUBSCRIPTIONS.get(lastRunKey);
      const lastRunEpoch = lastRunStr ? parseInt(lastRunStr, 10) : 0;
      const hoursSinceLastRun = (currentEpochMinute - lastRunEpoch) / 60;

      // 确保至少间隔 (interval - 1) 小时才再次运行，避免重复
      if (lastRunStr && hoursSinceLastRun < Math.max(1, interval - 1)) {
        console.log(
          `[Cron Backup] Skipping ${username}/${endpoint.name}: ran ${hoursSinceLastRun.toFixed(1)}h ago (interval ${interval}h)`
        );
        continue;
      }

      console.log(`[Cron Backup] Running backup for ${username}/${endpoint.name}`);

      const result = await uploadBackupToEndpoint(env, username, endpoint);
      endpoint.lastBackup = {
        time: new Date().toISOString(),
        status: result.success ? 'success' : 'failed',
        message: result.message,
      };
      await saveBackupEndpoint(env, username, endpoint);
      await env.SUBSCRIPTIONS.put(lastRunKey, String(currentEpochMinute), {
        expirationTtl: Math.max(7 * 24 * 60 * 60, (interval + 1) * 60 * 60),
      });

      console.log(
        `[Cron Backup] ${result.success ? 'Success' : 'Failed'} for ${username}/${endpoint.name}: ${result.message}`
      );
    }
  } catch (err) {
    console.error(
      `[Cron Backup] Error for ${username}:`,
      (err as Error).message,
      (err as Error).stack
    );
  }
}
