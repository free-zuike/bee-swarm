// ============================================
// 缓存服务 - 根据用户配置应用缓存
// ============================================

import type { Context, Next } from 'hono';
import type { Env } from '../types';
import { UserService } from './userService';

export interface CacheConfig {
  ttl: number;
  cacheType: 'backup' | 'channels' | 'templates' | 'groups' | 'scheduled' | 'default';
}

/**
 * 根据请求路径确定缓存类型
 */
export function getCacheTypeFromPath(pathname: string): CacheConfig['cacheType'] {
  if (pathname.includes('/backup')) {
    return 'backup';
  }
  if (pathname.includes('/channels')) {
    return 'channels';
  }
  if (pathname.includes('/templates')) {
    return 'templates';
  }
  if (pathname.includes('/groups')) {
    return 'groups';
  }
  if (pathname.includes('/scheduled')) {
    return 'scheduled';
  }
  return 'default';
}

/**
 * 根据用户ID获取缓存TTL
 */
export async function getUserCacheTTL(
  env: Env,
  userId: string,
  cacheType: CacheConfig['cacheType']
): Promise<number> {
  const userService = new UserService(env);
  const cacheSettings = await userService.getCacheSettings(userId);

  switch (cacheType) {
    case 'backup':
      return cacheSettings.cache_ttl_backup || 5 * 60 * 1000;
    case 'channels':
      return cacheSettings.cache_ttl_channels || 5 * 60 * 1000;
    case 'templates':
      return cacheSettings.cache_ttl_templates || 5 * 60 * 1000;
    case 'groups':
      return cacheSettings.cache_ttl_groups || 5 * 60 * 1000;
    case 'scheduled':
      return cacheSettings.cache_ttl_scheduled || 5 * 60 * 1000;
    default:
      return 5 * 60 * 1000; // 默认 5 分钟
  }
}

/**
 * 应用缓存头到响应
 */
export function applyCacheHeaders(c: Context, ttlMs: number): void {
  const ttlSeconds = Math.floor(ttlMs / 1000);
  c.res.headers.set('Cache-Control', `private, max-age=${ttlSeconds}`);
  c.res.headers.set('X-Cache-TTL', String(ttlSeconds));
}

/**
 * 缓存中间件 - 需要在认证之后使用
 * 会根据用户配置设置缓存头
 */
export function userCacheMiddleware() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    await next();

    // 只对成功响应进行处理
    if (!c.res.ok) {
      return;
    }

    const username = c.get('username');
    if (!username) {
      return;
    }

    const userService = new UserService(c.env);
    const user = await userService.findByEmail(username);
    if (!user) {
      return;
    }

    const pathname = new URL(c.req.raw.url).pathname;
    const cacheType = getCacheTypeFromPath(pathname);
    const ttl = await getUserCacheTTL(c.env, user.id, cacheType);

    applyCacheHeaders(c, ttl);
  };
}

/**
 * 简化的缓存应用函数 - 用于在路由处理函数中调用
 */
export async function applyUserCache(c: Context<{ Bindings: Env }>): Promise<void> {
  const username = c.get('username');
  if (!username) {
    return;
  }

  const userService = new UserService(c.env);
  const user = await userService.findByUsername(username);
  if (!user) {
    return;
  }

  const pathname = new URL(c.req.raw.url).pathname;
  const cacheType = getCacheTypeFromPath(pathname);
  const ttl = await getUserCacheTTL(c.env, user.id, cacheType);

  applyCacheHeaders(c, ttl);
}
