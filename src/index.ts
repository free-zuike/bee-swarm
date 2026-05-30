// ============================================
// Workers 应用入口
// ============================================
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import api from './routes/api';
import { getBackupEndpoints, uploadBackupToEndpoint, saveBackupEndpoint } from './services/backup';
import { PushService } from './services/push';
import { dispatchPushWithOptions } from './services/dispatcher';
import { rateLimit } from './middleware/rateLimit';
import { securityHeaders } from './middleware/securityHeaders';
import { createErrorResponse, logError } from './utils/errors';
import { convertTimezone } from './utils/timezone';

const app = new Hono<{ Bindings: Env }>();

// 安全 HTTP 头
app.use('*', securityHeaders());

/** 匹配 cron 单个字段是否包含指定值 */
function matchCronField(field: string, value: number): boolean {
  if (field === '*') return true;
  
  const values = field.split(',');
  for (const v of values) {
    if (v.includes('/')) {
      const [base, step] = v.split('/');
      const start = base === '*' ? 0 : parseInt(base, 10);
      const interval = parseInt(step, 10);
      if ((value - start) % interval === 0 && value >= start) return true;
      continue;
    }
    if (v.includes('-')) {
      const [start, end] = v.split('-').map(Number);
      if (value >= start && value <= end) return true;
      continue;
    }
    if (parseInt(v, 10) === value) return true;
  }
  return false;
}

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

/**
 * 转义正则表达式特殊字符（保留 __WILDCARD__ 占位符）
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

function getLocalTime(now: Date, tz: string): { hour: number; minute: number } {
  const localHourStr = now.toLocaleString('en-US', {
    timeZone: tz,
    hour: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  });
  const localMinuteStr = now.toLocaleString('en-US', {
    timeZone: tz,
    minute: '2-digit',
  });
  return {
    hour: parseInt(localHourStr, 10),
    minute: parseInt(localMinuteStr, 10),
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },

  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const now = new Date();
    const currentEpochMinute = Math.floor(now.getTime() / 60000);

    try {
      let cursor: string | undefined;
      let list_complete = false;

      do {
        const list = await env.SUBSCRIPTIONS.list({ prefix: 'user:', cursor });

        for (const key of list.keys) {
          const username = key.name.replace('user:', '');
          if (username.includes(':')) continue;

          // ==================== 处理定时推送 ====================
          try {
            const pushService = new PushService(env, username);
            const pendingPushes = await pushService.getScheduledPushes('pending');
            const nowDate = new Date();

            for (const push of pendingPushes) {
              const scheduledTime = new Date(push.scheduledAt);
              if (scheduledTime > nowDate) {
                continue;
              }

              // 防重复执行：使用当前时间戳的分钟级作为执行标识
              const execKey = `scheduled_exec:${username}:${push.id}`;
              const currentMinute = Math.floor(nowDate.getTime() / 60000);
              const alreadyExecuted = await env.SUBSCRIPTIONS.get(execKey);
              if (alreadyExecuted && parseInt(alreadyExecuted, 10) === currentMinute) {
                continue;
              }

              // 检查是否应该执行（针对重复执行模式）
              const scheduleType = push.scheduleType || 'once';
              let shouldExecute = true;

              if (scheduleType === 'recurring') {
                const recurringType = push.recurringType || 'daily';
                const nowHour = nowDate.getHours();
                const nowMinute = nowDate.getMinutes();
                const nowDay = nowDate.getDay();
                const nowDateOfMonth = nowDate.getDate();

                // 获取推送的执行时间（小时和分钟）
                const pushHour = scheduledTime.getHours();
                const pushMinute = scheduledTime.getMinutes();

                switch (recurringType) {
                  case 'hourly':
                    shouldExecute = nowMinute === pushMinute;
                    break;

                  case 'interval':
                    const intervalHours = push.intervalHours || 2;
                    const hoursSinceStart = Math.floor((nowDate.getTime() - scheduledTime.getTime()) / (1000 * 60 * 60));
                    shouldExecute = hoursSinceStart > 0 && hoursSinceStart % intervalHours === 0 && nowMinute === pushMinute;
                    break;

                  case 'daily':
                    shouldExecute = nowHour === pushHour && nowMinute === pushMinute;
                    break;

                  case 'weekly':
                    const selectedWeekDays = push.selectedWeekDays || [1, 2, 3, 4, 5];
                    shouldExecute = selectedWeekDays.includes(nowDay) && nowHour === pushHour && nowMinute === pushMinute;
                    break;

                  case 'monthly':
                    const selectedMonthDays = push.selectedMonthDays || [1, 15];
                    shouldExecute = selectedMonthDays.includes(nowDateOfMonth) && nowHour === pushHour && nowMinute === pushMinute;
                    break;

                  case 'cron':
                    // Cron 表达式匹配：分 时 日 月 周
                    if (push.cronExpression) {
                      const parts = push.cronExpression.trim().split(/\s+/);
                      if (parts.length === 5) {
                        const [minuteField, hourField, dayOfMonthField, monthField, dayOfWeekField] = parts;
                        const matchesMinute = matchCronField(minuteField, nowMinute);
                        const matchesHour = matchCronField(hourField, nowHour);
                        const matchesDayOfMonth = matchCronField(dayOfMonthField, nowDateOfMonth);
                        const matchesMonth = matchCronField(monthField, nowDate.getMonth() + 1);
                        const matchesDayOfWeek = matchCronField(dayOfWeekField, nowDay);
                        shouldExecute = matchesMinute && matchesHour && matchesDayOfMonth && matchesMonth && matchesDayOfWeek;
                      }
                    } else {
                      shouldExecute = nowHour === pushHour && nowMinute === pushMinute;
                    }
                    break;

                  default:
                    shouldExecute = nowHour === pushHour && nowMinute === pushMinute;
                    break;
                }
              } else {
                shouldExecute = true;
              }

              if (!shouldExecute) {
                continue;
              }

              // 更新状态为执行中
              await pushService.updateScheduledPushStatus(push.id, 'processing');

              // 执行推送
              const results = await dispatchPushWithOptions(
                {
                  title: push.title,
                  body: push.content,
                  url: push.url,
                },
                push.channels as any[],
                username,
                env
              );

              // 更新最终状态
              const finalStatus = results.every((r) => r.success) ? 'completed' : 'failed';

              // 重复执行模式：更新状态为 pending 以便下次执行
              if (scheduleType === 'recurring') {
                await pushService.updateScheduledPushStatus(push.id, 'pending');
              } else {
                await pushService.updateScheduledPushStatus(push.id, finalStatus);
              }

              // 记录执行时间防重复
              await env.SUBSCRIPTIONS.put(execKey, String(currentMinute), {
                expirationTtl: 24 * 60 * 60,
              });
            }
          } catch (err) {
            console.error(`[Cron ScheduledPush] Error for ${username}:`, (err as Error).message);
          }

          // ==================== 处理备份 ====================
          const endpoints = await getBackupEndpoints(env, username);

          for (const endpoint of endpoints) {
            if (!endpoint.enabled || !endpoint.schedule.enabled) continue;

            const [startHour, startMinute] = endpoint.schedule.startTime.split(':').map(Number);
            const interval = endpoint.schedule.interval || 24;
            const tz = convertTimezone(endpoint.schedule.timezone || 'Asia/Shanghai');
            const { hour: localHour, minute: localMinute } = getLocalTime(now, tz);

            // 计算应该执行备份的小时（从 startHour 开始，每隔 interval 小时）
            let shouldRun = false;
            if (interval >= 168) {
              // 每周周期：检查 startDay 和 startHour
              const localDay = now.toLocaleString('en-US', {
                timeZone: tz,
                weekday: 'short',
              });
              const dayMap: Record<string, number> = {
                Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
              };
              const currentDay = dayMap[localDay] ?? 0;
              const expectedDay = endpoint.schedule.startDay ?? 0;
              if (currentDay === expectedDay && localHour === startHour && localMinute === startMinute) {
                shouldRun = true;
              }
            } else if (interval >= 24) {
              // 每天或更长周期：只在 startHour 触发
              if (localHour === startHour && localMinute === startMinute) {
                shouldRun = true;
              }
            } else {
              // 小于 24 小时：从 startHour 开始每隔 interval 小时触发
              for (let h = startHour; h < 24; h += interval) {
                if (h === localHour && localMinute === startMinute) {
                  shouldRun = true;
                  break;
                }
              }
            }

            if (!shouldRun) continue;

            // 防重复：检查是否在同一分钟内已执行过
            const lastRunKey = `backup_last_run:${username}:${endpoint.id}`;
            const lastRunStr = await env.SUBSCRIPTIONS.get(lastRunKey);
            if (lastRunStr && parseInt(lastRunStr, 10) === currentEpochMinute) {
              continue;
            }

            const result = await uploadBackupToEndpoint(env, username, endpoint);

            // 更新 lastBackup 状态
            endpoint.lastBackup = {
              time: new Date().toISOString(),
              status: result.success ? 'success' : 'failed',
              message: result.message,
            };
            await saveBackupEndpoint(env, username, endpoint);

            // 记录本次执行时间
            await env.SUBSCRIPTIONS.put(lastRunKey, String(currentEpochMinute), {
              expirationTtl: 24 * 60 * 60,
            });
          }
        }
        cursor = (list as { cursor?: string }).cursor;
        list_complete = list.list_complete ?? false;
      } while (cursor && !list_complete);
    } catch (err) {
      console.error(`[Cron Backup] Error: ${(err as Error).message}`, (err as Error).stack);
    }
  },
};
