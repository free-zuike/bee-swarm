// ============================================
// Workers 应用入口
// ============================================
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import api from './routes/api';
import { uploadBackup } from './services/backup';

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
    // 每天定时备份
    if (event.cron === '0 2 * * *') {
      const result = await uploadBackup(env);
      console.log(`[Cron Backup] ${result.message}`);
    }
  },
};
