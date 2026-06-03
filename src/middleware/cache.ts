// ============================================
// Cache API 缓存中间件
// ============================================

import type { Context, Next } from 'hono';
import type { Env } from '../types';

/**
 * 缓存配置
 */
export interface CacheOptions {
  /**
   * 缓存名称
   */
  cacheName: string;
  /**
   * 缓存时间（秒）
   */
  ttl?: number;
  /**
   * 是否缓存 GET 请求
   */
  cacheGet?: boolean;
  /**
   * 是否缓存 HEAD 请求
   */
  cacheHead?: boolean;
}

/**
 * 默认缓存配置
 */
const DEFAULT_CACHE_OPTIONS: CacheOptions = {
  cacheName: 'bee-swarm-cache',
  ttl: 300, // 5分钟
  cacheGet: true,
  cacheHead: true,
};

/**
 * Cache 中间件
 * 用于缓存静态资源和 API 响应
 */
export function cacheMiddleware(options?: Partial<CacheOptions>) {
  const config = { ...DEFAULT_CACHE_OPTIONS, ...options };
  const cacheName = config.cacheName;

  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const request = c.req.raw;
    const method = request.method;

    // 只缓存 GET 和 HEAD 请求
    if ((config.cacheGet && method !== 'GET') || (config.cacheHead && method !== 'HEAD')) {
      return next();
    }

    // 不缓存带查询参数的请求（可配置）
    // 但我们的前端静态资源没有查询参数，所以没问题
    const url = new URL(request.url);
    if (url.search) {
      return next();
    }

    // 管理 API 不缓存
    if (url.pathname.startsWith('/api/admin') || url.pathname.startsWith('/api')) {
      // 但可以缓存一些只读 API
      if (
        method === 'GET' &&
        (url.pathname.includes('/channels') || url.pathname.includes('/health'))
      ) {
        // 只读 API 可以缓存
      } else {
        return next();
      }
    }

    // 获取缓存
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      // 返回缓存
      return new Response(cachedResponse.body, cachedResponse);
    }

    // 继续执行
    await next();

    // 如果响应成功，缓存结果
    const response = c.res;
    if (response && response.ok) {
      // 复制响应用于缓存
      const responseToCache = response.clone();
      const cacheHeaders = new Headers(responseToCache.headers);

      // 设置缓存控制头
      if (config.ttl) {
        cacheHeaders.set('Cache-Control', `public, max-age=${config.ttl}`);
      }

      // 缓存响应
      await cache.put(
        request,
        new Response(responseToCache.body, {
          status: responseToCache.status,
          statusText: responseToCache.statusText,
          headers: cacheHeaders,
        })
      );
    }
  };
}

/**
 * 静态资源缓存策略
 * 更长的缓存时间
 */
export function staticCache() {
  return cacheMiddleware({
    cacheName: 'bee-swarm-static',
    ttl: 86400, // 1天
  });
}

/**
 * API 只读接口缓存
 */
export function apiReadOnlyCache() {
  return cacheMiddleware({
    cacheName: 'bee-swarm-api',
    ttl: 60, // 1分钟
  });
}
