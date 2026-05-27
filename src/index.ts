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
app.use('*', cors());

// 全局错误处理
app.onError((err, c) => {
  console.error('Application Error:', err);
  return c.json({ error: 'Internal Server Error', message: err.message }, 500);
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
            const startUtcHour = (startHour + 24 - 8) % 24; // 北京时间转 UTC

            // 简单调度：每小时检查，如果当前时间匹配开始时间则备份
            // 更复杂的调度逻辑可以根据 interval 来实现
            if (utcHour === startUtcHour && utcMinute === startMinute) {
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
