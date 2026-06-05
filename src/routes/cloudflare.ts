// ============================================
// Cloudflare 服务相关 API 路由
// 用于展示和使用新增的 Cloudflare 功能
// ============================================
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import type { Env } from '../types';
import {
  VectorizeService,
  D1AnalyticsService,
  PushStatisticsCollector,
} from '../cloudflare-services';
import {
  recordHealthCheck,
  getHealthSummary,
  DistributedLockHelper,
  searchTemplates,
  getTemplateRecommendations,
  logPushStatistics,
  getUserAnalyticsSummary,
  getUserDailyTrend,
} from '../services/cloudflareIntegration';

export const cloudflareApi = new Hono<{ Bindings: Env; Variables: { userId: string; username: string } }>();

// ============================================
// 认证保护
// ============================================
cloudflareApi.use('/*', authMiddleware);

// ============================================
// 健康检查相关 API
// ============================================

// 记录健康检查结果
cloudflareApi.post('/health/check', async (c) => {
  try {
    const body = await c.req.json();
    const userId = c.get('username');
    const { channel, healthy, latencyMs, message, error } = body;

    await recordHealthCheck(c.env, userId, channel, healthy, latencyMs, message, error);

    return c.json({ success: true, message: '健康检查已记录' });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

// 获取健康摘要
cloudflareApi.get('/health/summary', async (c) => {
  try {
    const userId = c.get('username');
    const summary = await getHealthSummary(c.env, userId);

    if (!summary) {
      return c.json({ success: true, data: null, message: '健康追踪器未配置' });
    }

    return c.json({ success: true, data: summary });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

// ============================================
// 模板搜索和推荐 API
// ============================================

// 搜索模板
cloudflareApi.get('/templates/search', async (c) => {
  try {
    const query = c.req.query('q');
    if (!query) {
      return c.json({ success: false, error: '缺少搜索查询参数' }, 400);
    }

    const userId = c.get('username');
    const templates = await searchTemplates(c.env, query, userId);

    return c.json({ success: true, data: templates });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

// 获取模板推荐
cloudflareApi.get('/templates/recommend/:templateId', async (c) => {
  try {
    const templateId = c.req.param('templateId');
    const limit = Number(c.req.query('limit') || 5);
    const userId = c.get('username');

    const recommendations = await getTemplateRecommendations(c.env, templateId, userId, limit);

    return c.json({ success: true, data: recommendations });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

// 为模板生成向量嵌入
cloudflareApi.post('/templates/embed', async (c) => {
  try {
    const body = await c.req.json();
    const { templateId, name, description, category, content } = body;
    const userId = c.get('username');

    const service = new VectorizeService(c.env);
    if (!service.isAvailable()) {
      return c.json({ success: false, message: 'Vectorize 服务未配置' }, 400);
    }

    const entry = await service.generateTemplateVector(
      templateId,
      name,
      content,
      category,
      userId
    );
    await service.insertVector(entry);

    return c.json({ success: true, data: { embeddingId: templateId } });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

// ============================================
// 分析数据 API
// ============================================

// 获取用户分析摘要
cloudflareApi.get('/analytics/summary', async (c) => {
  try {
    const days = Number(c.req.query('days') || 7);
    const userId = c.get('username');

    const summary = await getUserAnalyticsSummary(c.env, userId, days);

    return c.json({ success: true, data: summary });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

// 获取每日趋势
cloudflareApi.get('/analytics/trend', async (c) => {
  try {
    const days = Number(c.req.query('days') || 30);
    const userId = c.get('username');

    const trend = await getUserDailyTrend(c.env, userId, days);

    return c.json({ success: true, data: trend });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

// 记录推送统计（用于测试）
cloudflareApi.post('/analytics/push', async (c) => {
  try {
    const body = await c.req.json();
    const { channelId, success, latencyMs, errorMessage } = body;
    const userId = c.get('username');

    await logPushStatistics(c.env, userId, channelId, success, latencyMs, errorMessage);

    return c.json({ success: true, message: '推送统计已记录' });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

// ============================================
// 分布式锁 API（用于测试）
// ============================================

// 获取锁
cloudflareApi.post('/lock/acquire', async (c) => {
  try {
    const body = await c.req.json();
    const { lockName, ttl = 30000 } = body;
    const userId = c.get('username');

    const lock = new DistributedLockHelper(c.env, `${userId}-${lockName}`);
    const result = await lock.acquire(ttl);

    return c.json({ success: true, data: result });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

// 释放锁
cloudflareApi.post('/lock/release', async (c) => {
  try {
    const body = await c.req.json();
    const { lockName, lockId } = body;
    const userId = c.get('username');

    const lock = new DistributedLockHelper(c.env, `${userId}-${lockName}`);
    await lock.release(lockId);

    return c.json({ success: true, message: '锁已释放' });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

// ============================================
// 系统状态 API
// ============================================

// 获取 Cloudflare 服务状态
cloudflareApi.get('/status', async (c) => {
  try {
    const vectorizeService = new VectorizeService(c.env);

    const status = {
      kv: !!c.env.RATE_LIMIT_KV,
      healthTracker: !!c.env.HEALTH_TRACKER,
      webSocketManager: !!c.env.WS_MANAGER,
      distributedLock: !!c.env.TASK_LOCK,
      vectorize: vectorizeService.isAvailable(),
      analyticsEngine: !!c.env.ANALYTICS,
      workersAi: !!c.env.AI,
    };

    return c.json({ success: true, data: status });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

export default cloudflareApi;
