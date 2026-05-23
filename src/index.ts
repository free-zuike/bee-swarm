// ============================================
// Workers 应用入口
// 仅提供 API 和 Service Worker，前端由 assets 服务
// ============================================
import { Hono } from 'hono';
import type { Env } from './types';
import api from './routes/api';

const app = new Hono<{ Bindings: Env }>();

// ============================================
// 全局错误处理
// ============================================
app.onError((err, c) => {
  console.error('Application Error:', err);
  return c.json({ 
    error: 'Internal Server Error', 
    message: err.message,
    stack: err.stack 
  }, 500);
});

// ============================================
// Service Worker 路由
// ============================================
app.get('/sw.js', async () => {
  return new Response(SW_CODE, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/',
    },
  });
});

// ============================================
// API 路由
// ============================================
app.route('/api', api);

// ============================================
// 静态资源由 wrangler [assets] 自动处理
// 不需要在这里配置 serveStatic
// ============================================

export default app;

// ============================================
// Service Worker 源码
// ============================================
const SW_CODE = `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = { title: '新通知', body: '您收到一条新消息', url: '', icon: '' };
  if (event.data) {
    try { data = event.data.json(); } catch { data.body = event.data.text(); }
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '',
      data: { url: data.url || self.location.origin },
      vibrate: [200, 100, 200],
      actions: [{ action: 'open', title: '查看详情' }, { action: 'close', title: '关闭' }],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;
  const url = event.notification.data?.url || self.location.origin;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus(); }
      return self.clients.openWindow(url);
    })
  );
});
`;
