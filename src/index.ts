// ============================================
// Workers 应用入口
// ============================================
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import api from './routes/api';
import { uploadBackup, getS3Config } from './services/backup';

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
    // 每天定时备份：遍历所有用户，检查是否有 S3 配置，有则备份
    if (event.cron === '0 2 * * *') {
      try {
        let cursor: string | undefined;
        do {
          const list = await env.SUBSCRIPTIONS.list({ prefix: 'user:', cursor });
          for (const key of list.keys) {
            // 只处理用户记录（user:xxx 格式，不含子键如 s3_config）
            const username = key.name.replace('user:', '');
            if (username.includes(':')) continue;

            const config = await getS3Config(env, username);
            if (config && config.enabled !== false) {
              const result = await uploadBackup(env, username, config);
              console.log(`[Cron Backup] ${username}: ${result.message}`);
            }
          }
          cursor = list.cursor;
        } while (cursor);
      } catch (err: any) {
        console.error(`[Cron Backup] Error: ${err.message}`);
      }
    }
  },
};
