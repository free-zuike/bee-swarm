// ============================================
// Workers 应用入口
// API 请求由代码处理，其他请求转发到 ASSETS
// ============================================
import { Hono } from 'hono';
import type { Env } from './types';
import api from './routes/api';

interface AppEnv extends Env {
  ASSETS: Fetcher;
}

const app = new Hono<{ Bindings: AppEnv }>();

// 全局错误处理
app.onError((err, c) => {
  console.error('Application Error:', err);
  return c.json({ error: 'Internal Server Error', message: err.message }, 500);
});

// API 路由
app.route('/api', api);

// 其他请求 → 转发到 ASSETS（静态资源）
app.all('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
