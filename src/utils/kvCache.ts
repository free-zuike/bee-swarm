import type { Context } from 'hono';
import type { Env } from '../types';

const CACHE_TTL = 60_000; // 1 分钟

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * 请求级别的 KV 缓存
 * 使用 Hono context 存储，每个请求独立缓存
 */
export function getFromCache<T>(c: Context, key: string): T | null {
  const cache = c.get('kvCache') as Map<string, CacheEntry<T>> | undefined;
  if (!cache) return null;
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setInCache<T>(c: Context, key: string, value: T): void {
  let cache = c.get('kvCache') as Map<string, CacheEntry<T>> | undefined;
  if (!cache) {
    cache = new Map();
    c.set('kvCache', cache);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL });
}

/**
 * 带缓存的 KV 读取
 * 优先从请求缓存读取，未命中则从 KV 读取并缓存
 */
export async function cachedKvGet<T = string>(
  c: Context,
  env: Env,
  key: string
): Promise<T | null> {
  const cached = getFromCache<T>(c, key);
  if (cached !== null) return cached;

  const value = await env.SUBSCRIPTIONS.get(key) as T | null;
  if (value !== null) {
    setInCache(c, key, value);
  }
  return value;
}

/**
 * 带缓存的 KV 列表读取
 */
export async function cachedKvList(
  c: Context,
  env: Env,
  options: { prefix?: string; cursor?: string; limit?: number }
): Promise<KVNamespaceListResult<unknown, unknown>> {
  const cacheKey = `list:${options.prefix || ''}:${options.cursor || ''}`;
  const cached = getFromCache<KVNamespaceListResult<unknown, unknown>>(c, cacheKey);
  if (cached !== null) return cached;

  const result = await env.SUBSCRIPTIONS.list(options);
  setInCache(c, cacheKey, result);
  return result;
}
