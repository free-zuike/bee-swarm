// ============================================
// 前端缓存服务
// 提供本地存储缓存和数据预取功能
// ============================================

/**
 * 缓存配置
 */
interface CacheConfig {
  /** 缓存有效期（毫秒） */
  ttl: number;
  /** 是否启用 */
  enabled: boolean;
  /** 缓存前缀 */
  prefix: string;
}

/**
 * 缓存项
 */
interface CacheItem<T> {
  value: T;
  expiresAt: number;
}

/**
 * 默认缓存配置
 */
const DEFAULT_CACHE_CONFIG: Record<string, CacheConfig> = {
  channels: { ttl: 5 * 60 * 1000, enabled: true, prefix: 'bs_ch_' },      // 5 分钟
  templates: { ttl: 5 * 60 * 1000, enabled: true, prefix: 'bs_tp_' },     // 5 分钟
  groups: { ttl: 10 * 60 * 1000, enabled: true, prefix: 'bs_gr_' },       // 10 分钟
  stats: { ttl: 2 * 60 * 1000, enabled: true, prefix: 'bs_st_' },        // 2 分钟
  history: { ttl: 60 * 1000, enabled: true, prefix: 'bs_hi_' },           // 1 分钟
  scheduled: { ttl: 5 * 60 * 1000, enabled: true, prefix: 'bs_sc_' },    // 5 分钟
  userConfig: { ttl: 30 * 60 * 1000, enabled: true, prefix: 'bs_uc_' },  // 30 分钟
};

/**
 * 前端缓存服务类
 */
export class FrontendCacheService {
  private config: Record<string, CacheConfig>;

  constructor(config?: Partial<Record<string, CacheConfig>>) {
    // 合并配置，确保所有键都有值
    this.config = { ...DEFAULT_CACHE_CONFIG };
    if (config) {
      Object.keys(config).forEach(key => {
        if (config[key]) {
          this.config[key] = { ...DEFAULT_CACHE_CONFIG[key], ...config[key] };
        }
      });
    }
  }

  /**
   * 设置缓存
   */
  set<T>(key: string, value: T, cacheType?: string): void {
    const config = cacheType ? this.config[cacheType] : null;
    if (!config || !config.enabled) return;

    try {
      const cacheKey = config.prefix + key;
      const cacheItem: CacheItem<T> = {
        value,
        expiresAt: Date.now() + config.ttl,
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheItem));
    } catch (error) {
      console.warn('[FrontendCache] Failed to set cache:', error);
    }
  }

  /**
   * 获取缓存
   */
  get<T>(key: string, cacheType?: string): T | null {
    const config = cacheType ? this.config[cacheType] : null;
    if (!config || !config.enabled) return null;

    try {
      const cacheKey = config.prefix + key;
      const cached = localStorage.getItem(cacheKey);
      
      if (!cached) return null;

      const cacheItem: CacheItem<T> = JSON.parse(cached);
      
      // 检查是否过期
      if (Date.now() > cacheItem.expiresAt) {
        localStorage.removeItem(cacheKey);
        return null;
      }

      return cacheItem.value;
    } catch (error) {
      console.warn('[FrontendCache] Failed to get cache:', error);
      return null;
    }
  }

  /**
   * 删除缓存
   */
  delete(key: string, cacheType?: string): void {
    const config = cacheType ? this.config[cacheType] : null;
    if (!config) return;

    try {
      const cacheKey = config.prefix + key;
      localStorage.removeItem(cacheKey);
    } catch (error) {
      console.warn('[FrontendCache] Failed to delete cache:', error);
    }
  }

  /**
   * 清除指定类型的所有缓存
   */
  clearCacheType(cacheType: string): void {
    const config = this.config[cacheType];
    if (!config) return;

    try {
      const prefix = config.prefix;
      const keys = Object.keys(localStorage).filter(key => key.startsWith(prefix));
      keys.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      console.warn('[FrontendCache] Failed to clear cache type:', error);
    }
  }

  /**
   * 清除所有缓存
   */
  clearAll(): void {
    try {
      const prefix = 'bs_';
      const keys = Object.keys(localStorage).filter(key => key.startsWith(prefix));
      keys.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      console.warn('[FrontendCache] Failed to clear all:', error);
    }
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): {
    totalItems: number;
    byType: Record<string, number>;
    oldestItem: { key: string; age: number } | null;
  } {
    const stats = {
      totalItems: 0,
      byType: {} as Record<string, number>,
      oldestItem: null as { key: string; age: number } | null,
    };

    try {
      const prefix = 'bs_';
      let oldestAge = 0;
      let oldestKey = '';

      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith(prefix)) continue;

        const cached = localStorage.getItem(key);
        if (!cached) continue;

        const cacheItem: CacheItem<any> = JSON.parse(cached);
        const config = this.configByKey(key);
        const age = Date.now() - cacheItem.expiresAt + config.ttl;
        
        // 按类型统计
        const cacheType = this.getCacheType(key);
        stats.byType[cacheType] = (stats.byType[cacheType] || 0) + 1;
        stats.totalItems++;

        // 找到最老的项
        if (age > oldestAge) {
          oldestAge = age;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        stats.oldestItem = { key: oldestKey, age: oldestAge };
      }
    } catch (error) {
      console.warn('[FrontendCache] Failed to get stats:', error);
    }

    return stats;
  }

  /**
   * 根据 key 获取缓存类型
   */
  private getCacheType(key: string): string {
    for (const [type, config] of Object.entries(this.config)) {
      if (key.startsWith(config.prefix)) {
        return type;
      }
    }
    return 'unknown';
  }

  /**
   * 根据 key 获取配置
   */
  private configByKey(key: string): CacheConfig {
    for (const config of Object.values(this.config)) {
      if (key.startsWith(config.prefix)) {
        return config;
      }
    }
    return DEFAULT_CACHE_CONFIG.channels;
  }
}

// 导出单例
let cacheServiceInstance: FrontendCacheService | null = null;

export function getCacheService(): FrontendCacheService {
  if (!cacheServiceInstance) {
    cacheServiceInstance = new FrontendCacheService();
  }
  return cacheServiceInstance;
}

// 便捷方法
export const cache = {
  set: <T>(key: string, value: T, cacheType?: string) => getCacheService().set(key, value, cacheType),
  get: <T>(key: string, cacheType?: string) => getCacheService().get<T>(key, cacheType),
  delete: (key: string, cacheType?: string) => getCacheService().delete(key, cacheType),
  clearType: (cacheType: string) => getCacheService().clearCacheType(cacheType),
  clearAll: () => getCacheService().clearAll(),
};
