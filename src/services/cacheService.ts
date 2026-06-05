// ============================================
// Cache API 缓存服务
// 使用 Cloudflare Cache API 实现服务端缓存
// 免费额度：无限
// ============================================

import type { Context, Next } from 'hono';
import type { Env } from '../types';
import { UserService } from './userService';

export interface CacheOptions {
  /** 缓存时间（秒） */
  ttl?: number;
  /** 是否是私有资源（不可共享缓存） */
  private?: boolean;
  /** 缓存 Key 前缀 */
  prefix?: string;
}

export interface CachedResponse {
  data: unknown;
  cached: boolean;
  fromCache: boolean;
  createdAt?: string;
  ttl?: number;
}

export interface CacheConfig {
  ttl: number;
  cacheType: 'backup' | 'channels' | 'templates' | 'groups' | 'scheduled' | 'default';
}

const DEFAULT_TTL = 300; // 5 分钟
const DEFAULT_PREFIX = 'bee-swarm';

// Cloudflare Workers Cache API 类型
interface CacheWithDefault {
  default: Cache;
}

/**
 * 获取 Cache 实例
 */
function getDefaultCache(): Cache {
  // 在 Cloudflare Workers 中，caches 是一个全局对象
  // 它有一个 default 属性，指向默认的 Cache 实例
  return (globalThis as unknown as { caches: CacheWithDefault }).caches.default;
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
  const user = await userService.findByEmail(username);
  if (!user) {
    return;
  }

  const pathname = new URL(c.req.raw.url).pathname;
  const cacheType = getCacheTypeFromPath(pathname);
  const ttl = await getUserCacheTTL(c.env, user.id, cacheType);

  applyCacheHeaders(c, ttl);
}

/**
 * Cache API 缓存服务
 * 用于缓存热点数据，减少数据库查询
 */
export class CacheService {
  private defaultTTL: number;
  private prefix: string;

  constructor(options: { defaultTTL?: number; prefix?: string } = {}) {
    this.defaultTTL = options.defaultTTL || DEFAULT_TTL;
    this.prefix = options.prefix || DEFAULT_PREFIX;
  }

  /**
   * 生成缓存 Key
   */
  private buildKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  /**
   * 获取缓存
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const cacheKey = this.buildKey(key);
      const request = new Request(`https://cache/${cacheKey}`);
      const cache = getDefaultCache();
      const response = await cache.match(request);

      if (response) {
        const data = await response.json<{ value: T; createdAt: string; ttl: number }>();
        const age = Date.now() - new Date(data.createdAt).getTime();

        if (age < data.ttl * 1000) {
          console.log(`[Cache] Hit: ${key}`);
          return data.value;
        } else {
          // 缓存过期，删除
          await this.delete(key);
        }
      }

      console.log(`[Cache] Miss: ${key}`);
      return null;
    } catch (error) {
      console.error('[Cache] Get error:', error);
      return null;
    }
  }

  /**
   * 设置缓存
   */
  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<boolean> {
    try {
      const cacheKey = this.buildKey(key);
      const ttl = options.ttl || this.defaultTTL;

      const cacheData = {
        value,
        createdAt: new Date().toISOString(),
        ttl,
      };

      const request = new Request(`https://cache/${cacheKey}`);
      const response = new Response(JSON.stringify(cacheData), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': options.private ? `private, max-age=${ttl}` : `public, max-age=${ttl}`,
          'X-Cache-Key': cacheKey,
          'X-Cache-Created': cacheData.createdAt,
        },
      });

      const cache = getDefaultCache();
      await cache.put(request, response);
      console.log(`[Cache] Set: ${key} (TTL: ${ttl}s)`);
      return true;
    } catch (error) {
      console.error('[Cache] Set error:', error);
      return false;
    }
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<boolean> {
    try {
      const cacheKey = this.buildKey(key);
      const request = new Request(`https://cache/${cacheKey}`);
      const cache = getDefaultCache();
      await cache.delete(request);
      console.log(`[Cache] Delete: ${key}`);
      return true;
    } catch (error) {
      console.error('[Cache] Delete error:', error);
      return false;
    }
  }

  /**
   * 清除指定前缀的所有缓存
   */
  async clear(prefix?: string): Promise<void> {
    try {
      const pattern = prefix || this.prefix;
      // 注意：Cache API 不支持批量删除，这里只是记录
      console.log(`[Cache] Clear requested for prefix: ${pattern}`);
    } catch (error) {
      console.error('[Cache] Clear error:', error);
    }
  }

  /**
   * 获取或设置缓存（如果不存在则调用回调函数获取）
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<{ data: T; fromCache: boolean }> {
    const cached = await this.get<T>(key);

    if (cached !== null) {
      return { data: cached, fromCache: true };
    }

    const data = await fetcher();
    await this.set(key, data, options);
    return { data, fromCache: false };
  }

  /**
   * 缓存 HTML 片段（用于 SSR）
   */
  async cacheHtml(key: string, html: string, options: CacheOptions = {}): Promise<boolean> {
    try {
      const cacheKey = this.buildKey(key);
      const ttl = options.ttl || this.defaultTTL;

      const request = new Request(`https://cache/${cacheKey}`);
      const response = new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': options.private
            ? `private, max-age=${ttl}`
            : `public, max-age=${ttl}, stale-while-revalidate=${ttl}`,
          'X-Cache-Key': cacheKey,
        },
      });

      const cache = getDefaultCache();
      await cache.put(request, response);
      return true;
    } catch (error) {
      console.error('[Cache] HTML cache error:', error);
      return false;
    }
  }

  /**
   * 获取缓存统计
   */
  async getStats(): Promise<{
    available: boolean;
    defaultTTL: number;
    prefix: string;
  }> {
    return {
      available: true,
      defaultTTL: this.defaultTTL,
      prefix: this.prefix,
    };
  }
}

/**
 * 创建全局缓存服务实例
 */
let globalCacheService: CacheService | null = null;

export function getCacheService(): CacheService {
  if (!globalCacheService) {
    globalCacheService = new CacheService();
  }
  return globalCacheService;
}

/**
 * 缓存中间件 - 自动为符合条件的响应添加缓存
 */
export function createCacheMiddleware(options: CacheOptions = {}) {
  const defaultTTL = options.ttl || DEFAULT_TTL;
  const prefix = options.prefix || DEFAULT_PREFIX;

  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    await next();

    // 只对成功响应进行处理
    if (!c.res.ok) {
      return;
    }

    // 检查是否是可缓存的响应
    const contentType = c.res.headers.get('Content-Type') || '';
    const cacheableTypes = ['application/json', 'text/html', 'text/plain'];

    if (!cacheableTypes.some((type) => contentType.includes(type))) {
      return;
    }

    // 生成缓存 Key
    const url = new URL(c.req.raw.url);
    const cacheKey = `${prefix}:${url.pathname}:${url.search || 'default'}`;

    try {
      const request = new Request(`https://cache/${cacheKey}`);
      const response = new Response(c.res.clone().body, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': `private, max-age=${defaultTTL}`,
          'X-Cache-Key': cacheKey,
          'X-Cache-Time': new Date().toISOString(),
        },
      });

      const cache = getDefaultCache();
      await cache.put(request, response);
      console.log(`[Cache Middleware] Cached: ${cacheKey}`);
    } catch (error) {
      console.error('[Cache Middleware] Error:', error);
    }
  };
}

/**
 * 用户数据缓存帮助类
 * 提供便捷的用户相关数据缓存方法
 */
export class UserDataCache {
  private cacheService: CacheService;
  private ttl: number;

  constructor(options: { ttl?: number } = {}) {
    this.cacheService = getCacheService();
    this.ttl = options.ttl || 300; // 默认 5 分钟
  }

  /**
   * 缓存用户配置
   */
  async getUserChannels(username: string): Promise<Record<string, unknown> | null> {
    return this.cacheService.get(`channels:${username}`);
  }

  async setUserChannels(username: string, data: Record<string, unknown>): Promise<boolean> {
    return this.cacheService.set(`channels:${username}`, data, { ttl: this.ttl });
  }

  async invalidateUserChannels(username: string): Promise<boolean> {
    return this.cacheService.delete(`channels:${username}`);
  }

  /**
   * 缓存用户模板
   */
  async getUserTemplates(userId: string): Promise<unknown[] | null> {
    return this.cacheService.get(`templates:${userId}`);
  }

  async setUserTemplates(userId: string, data: unknown[]): Promise<boolean> {
    return this.cacheService.set(`templates:${userId}`, data, { ttl: this.ttl });
  }

  async invalidateUserTemplates(userId: string): Promise<boolean> {
    return this.cacheService.delete(`templates:${userId}`);
  }

  /**
   * 缓存用户分组
   */
  async getUserGroups(userId: string): Promise<unknown[] | null> {
    return this.cacheService.get(`groups:${userId}`);
  }

  async setUserGroups(userId: string, data: unknown[]): Promise<boolean> {
    return this.cacheService.set(`groups:${userId}`, data, { ttl: this.ttl });
  }

  async invalidateUserGroups(userId: string): Promise<boolean> {
    return this.cacheService.delete(`groups:${userId}`);
  }

  /**
   * 缓存定时任务
   */
  async getUserScheduled(userId: string): Promise<unknown[] | null> {
    return this.cacheService.get(`scheduled:${userId}`);
  }

  async setUserScheduled(userId: string, data: unknown[]): Promise<boolean> {
    return this.cacheService.set(`scheduled:${userId}`, data, { ttl: this.ttl });
  }

  async invalidateUserScheduled(userId: string): Promise<boolean> {
    return this.cacheService.delete(`scheduled:${userId}`);
  }

  /**
   * 缓存用户设置
   */
  async getUserSettings(userId: string): Promise<Record<string, unknown> | null> {
    return this.cacheService.get(`settings:${userId}`);
  }

  async setUserSettings(userId: string, data: Record<string, unknown>): Promise<boolean> {
    return this.cacheService.set(`settings:${userId}`, data, { ttl: this.ttl * 2 }); // 设置缓存更久
  }

  async invalidateUserSettings(userId: string): Promise<boolean> {
    return this.cacheService.delete(`settings:${userId}`);
  }

  /**
   * 清除用户所有缓存
   */
  async invalidateUser(userId: string, username: string): Promise<void> {
    await Promise.all([
      this.invalidateUserChannels(username),
      this.invalidateUserTemplates(userId),
      this.invalidateUserGroups(userId),
      this.invalidateUserScheduled(userId),
      this.invalidateUserSettings(userId),
    ]);
  }
}
