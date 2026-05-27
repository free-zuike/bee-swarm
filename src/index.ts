// ============================================
// Workers 应用入口
// ============================================
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import api from './routes/api';
import { getBackupEndpoints, uploadBackupToEndpoint } from './services/backup';

const app = new Hono<{ Bindings: Env }>();

// CORS
app.use('*', async (c, next) => {
  const origin = c.req.header('Origin') || '';
  // 允许所有来源（Workers 部署场景下难以预知来源）
  // 如需限制，可改为: if (origin.endsWith('.workers.dev') || origin === 'https://your-domain.com')
  await cors({ origin: '*', allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowHeaders: ['Content-Type', 'X-Token', 'X-API-Key', 'X-Password'] })(c, next);
});

// 全局错误处理
app.onError((err, c) => {
  console.error('Application Error:', err);
  return c.json({ error: 'Internal Server Error' }, 500);
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
    // 每小时触发，检查每个用户的备份端调度设置
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();

    try {
      let cursor: string | undefined;
      do {
        const list = await env.SUBSCRIPTIONS.list({ prefix: 'user:', cursor });
        for (const key of list.keys) {
          const username = key.name.replace('user:', '');
          if (username.includes(':')) continue;

          const endpoints = await getBackupEndpoints(env, username);
          for (const endpoint of endpoints) {
            if (!endpoint.enabled || !endpoint.schedule.enabled) continue;

            // 检查是否到达备份时间
            const [startHour, startMinute] = endpoint.schedule.startTime.split(':').map(Number);
            // 使用 IANA 时区计算当前时间在用户时区中的小时（兼容旧数据的数字时区）
            let tz = endpoint.schedule.timezone || 'Asia/Shanghai';
            // 兼容旧数据：如果是纯数字，转换为 IANA 时区
            if (/^-?\d+$/.test(tz)) {
              const offset = parseInt(tz, 10);
              if (offset === 8) tz = 'Asia/Shanghai';
              else if (offset === 0) tz = 'UTC';
              else if (offset === 9) tz = 'Asia/Tokyo';
              else if (offset === -5) tz = 'America/New_York';
              else if (offset === -8) tz = 'America/Los_Angeles';
              else tz = 'UTC';
            }
            const localHourStr = now.toLocaleString('en-US', { timeZone: tz, hour: '2-digit', hour12: false, hourCycle: 'h23' });
            const localHour = parseInt(localHourStr, 10);
            const localMinuteStr = now.toLocaleString('en-US', { timeZone: tz, minute: '2-digit' });
            const localMinute = parseInt(localMinuteStr, 10);

            // 匹配小时和分钟（5分钟窗口避免 Cron 偏差）
            if (localHour === startHour && Math.abs(localMinute - startMinute) < 5) {
              const result = await uploadBackupToEndpoint(env, username, endpoint);
              console.log(`[Cron Backup] ${username}/${endpoint.name}: ${result.message}`);
            }
          }
        }
        cursor = list.cursor;
      } while (cursor);
    } catch (err: any) {
      console.error(`[Cron Backup] Error: ${err.message}`);
    }
  },
};
