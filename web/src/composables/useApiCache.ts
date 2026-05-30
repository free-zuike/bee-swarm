/**
 * API 请求缓存管理
 * 使用 sessionStorage 缓存 API 响应，提升应用性能
 */
const CACHE_PREFIX = 'bee_api_cache:';
const DEFAULT_TTL = 5 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class ApiCache {
  private getKey(url: string, token?: string): string {
    return `${CACHE_PREFIX}${token ? 'auth_' : ''}${url}`;
  }

  get<T>(url: string, token?: string, customTtl?: number): T | null {
    const key = this.getKey(url, token);
    const cached = sessionStorage.getItem(key);

    if (!cached) return null;

    try {
      const entry: CacheEntry<T> = JSON.parse(cached);
      const now = Date.now();
      const age = now - entry.timestamp;

      if (age > (customTtl ?? entry.ttl ?? DEFAULT_TTL)) {
        sessionStorage.removeItem(key);
        return null;
      }

      return entry.data;
    } catch {
      sessionStorage.removeItem(key);
      return null;
    }
  }

  set<T>(url: string, data: T, token?: string, ttl?: number): void {
    const key = this.getKey(url, token);
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl ?? DEFAULT_TTL,
    };

    try {
      sessionStorage.setItem(key, JSON.stringify(entry));
    } catch (error) {
      console.warn('Failed to cache API response:', error);
      this.clear();
    }
  }

  invalidate(url?: string, token?: string): void {
    if (url) {
      const key = this.getKey(url, token);
      sessionStorage.removeItem(key);
    } else {
      this.clear();
    }
  }

  clear(): void {
    const keysToRemove: string[] = [];

    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => sessionStorage.removeItem(key));
  }

  invalidateByPattern(pattern: string): void {
    const regex = new RegExp(pattern);
    const keysToRemove: string[] = [];

    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(CACHE_PREFIX) && regex.test(key)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => sessionStorage.removeItem(key));
  }
}

export const apiCache = new ApiCache();

export function withCache<T>(
  url: string,
  fetchFn: () => Promise<T>,
  token?: string,
  options?: { ttl?: number; forceRefresh?: boolean }
): Promise<T> {
  const { ttl, forceRefresh } = options ?? {};

  if (!forceRefresh) {
    const cached = apiCache.get<T>(url, token, ttl);
    if (cached !== null) {
      return Promise.resolve(cached);
    }
  }

  return fetchFn().then((data) => {
    apiCache.set(url, data, token, ttl);
    return data;
  });
}
