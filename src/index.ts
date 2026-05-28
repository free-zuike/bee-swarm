// ============================================
// Workers 应用入口
// ============================================
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import api from './routes/api';
import { getBackupEndpoints, uploadBackupToEndpoint } from './services/backup';
import { rateLimit } from './middleware/rateLimit';
import { securityHeaders } from './middleware/securityHeaders';
import { createErrorResponse, logError } from './utils/errors';
import { convertTimezone } from './utils/timezone';

const app = new Hono<{ Bindings: Env }>();

// 安全 HTTP 头
app.use('*', securityHeaders());

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

    try {
      let cursor: string | undefined;
      let list_complete = false;

      do {
        const list = await env.SUBSCRIPTIONS.list({ prefix: 'user:', cursor });

        for (const key of list.keys) {
          const username = key.name.replace('user:', '');
          if (username.includes(':')) continue;

          const endpoints = await getBackupEndpoints(env, username);

          for (const endpoint of endpoints) {
            if (!endpoint.enabled || !endpoint.schedule.enabled) continue;

            const [startHour, startMinute] = endpoint.schedule.startTime.split(':').map(Number);
            const tz = convertTimezone(endpoint.schedule.timezone || 'Asia/Shanghai');
            const { hour: localHour, minute: localMinute } = getLocalTime(now, tz);

            if (localHour === startHour && Math.abs(localMinute - startMinute) <= 5) {
              await uploadBackupToEndpoint(env, username, endpoint);
            }
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
