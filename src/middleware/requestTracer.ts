// ============================================
// 请求追踪中间件
// ============================================

import type { Context, Next } from 'hono';
import type { Env } from '../types';
import { logger, createRequestContext, getElapsedTime, type RequestContext } from '../utils/logger';

/**
 * 请求追踪上下文键名
 */
export const REQUEST_CONTEXT_KEY = 'requestContext';

/**
 * 请求追踪中间件
 * 自动生成请求 ID 并追踪性能
 */
export function requestTracer() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    // 生成或使用已有的请求 ID
    let requestId = c.req.header('X-Request-ID') || c.req.header('CF-Ray-ID');
    if (!requestId) {
      requestId = crypto.randomUUID().slice(0, 8);
    }

    // 创建请求上下文
    const context: RequestContext = {
      requestId,
      startTime: Date.now(),
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      ip: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For'),
      userAgent: c.req.header('User-Agent'),
    };

    // 将上下文存储到 Hono 变量中
    c.set(REQUEST_CONTEXT_KEY, context);

    // 添加响应头
    c.res.headers.set('X-Request-ID', requestId);

    // 执行请求
    await next();

    // 记录请求完成
    const duration = getElapsedTime(context);
    const status = c.res.status;

    // 记录访问日志
    logger.api(`${context.method} ${context.path}`, {
      requestId: context.requestId,
      metadata: {
        method: context.method,
        path: context.path,
        status,
        duration,
        ip: context.ip,
      },
    });

    // 如果请求时间过长，记录警告
    if (duration > 5000) {
      logger.warn(`Slow request: ${context.method} ${context.path}`, {
        requestId: context.requestId,
        metadata: {
          duration,
          threshold: 5000,
        },
      });
    }

    // 如果状态码错误，记录详细信息
    if (status >= 400) {
      logger.warn(`Error response: ${status}`, {
        requestId: context.requestId,
        metadata: {
          status,
          method: context.method,
          path: context.path,
        },
      });
    }
  };
}

/**
 * 获取请求上下文的辅助函数
 */
export function getRequestContext(c: Context): RequestContext | null {
  return c.get(REQUEST_CONTEXT_KEY) || null;
}

/**
 * 性能计时器
 */
export class PerformanceTimer {
  private startTime: number;
  private requestId?: string;

  constructor(requestId?: string) {
    this.startTime = Date.now();
    this.requestId = requestId;
  }

  /**
   * 获取经过的时间（毫秒）
   */
  getElapsed(): number {
    return Date.now() - this.startTime;
  }

  /**
   * 记录操作并返回经过的时间
   */
  record(operation: string): number {
    const duration = this.getElapsed();
    logger.performance(`${operation}`, {
      requestId: this.requestId,
      metadata: { operation, duration },
    });
    return duration;
  }

  /**
   * 检查是否超时
   */
  isTimeout(thresholdMs: number): boolean {
    return this.getElapsed() > thresholdMs;
  }
}
