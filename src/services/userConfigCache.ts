// ============================================
// 用户配置缓存服务
// 利用 KV 缓存用户配置，减少数据库查询压力
// ============================================
import type { Env } from '../types';

const CACHE_TTL = 3600; // 1 小时

export interface UserConfigCache {
  userId: string;
  channels: any;
  templates: any;
  groups: any;
  settings: any;
  cachedAt: string;
}

/**
 * 获取用户配置（先从缓存取，没有再查数据库）
 */
export async function getUserConfigWithCache(
  env: Env,
  userId: string
): Promise<Partial<UserConfigCache>> {
  const cacheKey = `user-config:${userId}`;
  
  // 1. 尝试从 KV 缓存获取
  if (env.RATE_LIMIT_KV) {
    try {
      const cached = await env.RATE_LIMIT_KV.get(cacheKey, { type: 'json' });
      if (cached) {
        console.log(`[UserCache] Cache hit for user ${userId}`);
        return cached as Partial<UserConfigCache>;
      }
    } catch (err) {
      console.warn('[UserCache] Failed to get from cache:', err);
    }
  }

  // 2. 缓存未命中，从数据库查询
  console.log(`[UserCache] Cache miss for user ${userId}, loading from DB`);
  const config = await loadUserConfigFromDB(env, userId);

  // 3. 写入缓存（如果 KV 可用）
  if (env.RATE_LIMIT_KV && Object.keys(config).length > 0) {
    try {
      await env.RATE_LIMIT_KV.put(cacheKey, JSON.stringify({
        ...config,
        cachedAt: new Date().toISOString(),
      }), {
        expirationTtl: CACHE_TTL,
      });
    } catch (err) {
      console.warn('[UserCache] Failed to set cache:', err);
    }
  }

  return config;
}

/**
 * 从数据库加载用户配置
 */
async function loadUserConfigFromDB(
  env: Env,
  userId: string
): Promise<Partial<UserConfigCache>> {
  const config: Partial<UserConfigCache> = {};

  try {
    // 并行查询多个表
    const [channelsResult, templatesResult, groupsResult] = await Promise.all([
      env.DB!.prepare('SELECT * FROM channel_configs WHERE user_id = ?')
        .bind(userId)
        .all(),
      env.DB!.prepare('SELECT * FROM push_templates WHERE user_id = ?')
        .bind(userId)
        .all(),
      env.DB!.prepare('SELECT * FROM channel_groups WHERE user_id = ?')
        .bind(userId)
        .all(),
    ]);

    config.channels = channelsResult.results || [];
    config.templates = templatesResult.results || [];
    config.groups = groupsResult.results || [];
  } catch (err) {
    console.error('[UserCache] Failed to load from DB:', err);
  }

  return config;
}

/**
 * 清除用户配置缓存（配置变更后调用）
 */
export async function invalidateUserConfigCache(
  env: Env,
  userId: string
): Promise<void> {
  if (!env.RATE_LIMIT_KV) {
    return;
  }

  const cacheKey = `user-config:${userId}`;
  
  try {
    await env.RATE_LIMIT_KV.delete(cacheKey);
    console.log(`[UserCache] Cache invalidated for user ${userId}`);
  } catch (err) {
    console.warn('[UserCache] Failed to invalidate cache:', err);
  }
}

/**
 * 清除所有相关缓存
 */
export async function invalidateAllUserCaches(
  env: Env,
  userId: string
): Promise<void> {
  await Promise.all([
    invalidateUserConfigCache(env, userId),
    // 可以添加更多缓存清除
  ]);
}
