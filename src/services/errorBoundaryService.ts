// ============================================
// 错误边界和降级服务
// 提供统一的错误处理和优雅降级
// ============================================

import type { Env } from '../types';

/**
 * 错误严重级别
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * 错误分类
 */
export type ErrorCategory = 
  | 'network'
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'database'
  | 'external_service'
  | 'internal'
  | 'unknown';

/**
 * 错误上下文
 */
export interface ErrorContext {
  userId?: string;
  requestId?: string;
  path?: string;
  method?: string;
  userAgent?: string;
  ip?: string;
  timestamp?: string;
}

/**
 * 错误响应格式
 */
export interface ErrorResponse {
  error: string;
  code: string;
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  requestId?: string;
  timestamp: string;
  suggestion?: string;
  details?: any;
}

/**
 * 降级功能定义
 */
export interface FallbackDefinition<T> {
  /** 功能名称 */
  name: string;
  /** 主要实现 */
  primary: () => Promise<T>;
  /** 降级实现 */
  fallback: () => Promise<T>;
  /** 是否完全降级（返回默认值） */
  graceful?: boolean;
  /** 降级默认值 */
  defaultValue?: T;
}

/**
 * 错误边界服务类
 */
export class ErrorBoundaryService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * 创建错误响应
   */
  createErrorResponse(
    error: Error,
    category: ErrorCategory,
    severity: ErrorSeverity,
    context: ErrorContext = {},
    suggestion?: string
  ): ErrorResponse {
    const requestId = context.requestId || this.generateRequestId();

    return {
      error: error.message || 'Unknown error',
      code: this.getErrorCode(error, category),
      message: this.getUserFriendlyMessage(error, category),
      category,
      severity,
      requestId,
      timestamp: new Date().toISOString(),
      suggestion: suggestion || this.getSuggestion(category),
      details: this.isDevelopment() ? {
        stack: error.stack,
        ...context,
      } : undefined,
    };
  }

  /**
   * 检查是否为开发环境
   */
  private isDevelopment(): boolean {
    // Cloudflare Workers 环境检查
    if (typeof globalThis !== 'undefined' && (globalThis as any).process?.env?.NODE_ENV === 'development') {
      return true;
    }
    // 也可以通过其他方式判断，如检查某个环境变量
    return false;
  }

  /**
   * 生成请求 ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * 获取错误代码
   */
  private getErrorCode(error: Error, category: ErrorCategory): string {
    const codes: Record<ErrorCategory, string> = {
      network: 'NETWORK_ERROR',
      validation: 'VALIDATION_ERROR',
      authentication: 'AUTH_ERROR',
      authorization: 'PERMISSION_DENIED',
      database: 'DATABASE_ERROR',
      external_service: 'SERVICE_UNAVAILABLE',
      internal: 'INTERNAL_ERROR',
      unknown: 'UNKNOWN_ERROR',
    };

    return (error as any).code || codes[category];
  }

  /**
   * 获取用户友好的错误消息
   */
  private getUserFriendlyMessage(error: Error, category: ErrorCategory): string {
    const messages: Record<ErrorCategory, string> = {
      network: '网络连接失败，请检查网络设置',
      validation: '输入数据验证失败，请检查输入内容',
      authentication: '认证失败，请重新登录',
      authorization: '权限不足，无法执行此操作',
      database: '数据库操作失败，请稍后重试',
      external_service: '外部服务暂时不可用，请稍后重试',
      internal: '服务器内部错误，请联系管理员',
      unknown: '发生未知错误，请稍后重试',
    };

    // 如果错误有自定义消息，优先使用
    if ((error as any).userMessage) {
      return (error as any).userMessage;
    }

    return messages[category];
  }

  /**
   * 获取错误处理建议
   */
  private getSuggestion(category: ErrorCategory): string {
    const suggestions: Record<ErrorCategory, string> = {
      network: '请检查网络连接，或稍后重试。如果问题持续存在，请联系管理员。',
      validation: '请检查输入数据的格式和内容，确保所有必填字段都已填写。',
      authentication: '请重新登录您的账号，如果问题持续存在，请联系管理员。',
      authorization: '如果您需要此权限，请联系管理员为您分配相应权限。',
      database: '请稍后重试，如果问题持续存在，请联系管理员。',
      external_service: '请稍后重试，受影响的外部服务正在恢复中。',
      internal: '请记录此错误并联系管理员，错误 ID 可用于问题追踪。',
      unknown: '请稍后重试，如果问题持续存在，请联系管理员。',
    };

    return suggestions[category];
  }

  /**
   * 执行带降级的操作
   */
  async executeWithFallback<T>(fallbackDef: FallbackDefinition<T>): Promise<T> {
    try {
      // 尝试主要实现
      return await fallbackDef.primary();
    } catch (error) {
      console.error(`[ErrorBoundary] Primary implementation failed for ${fallbackDef.name}:`, error);

      try {
        // 尝试降级实现
        return await fallbackDef.fallback();
      } catch (fallbackError) {
        console.error(`[ErrorBoundary] Fallback implementation also failed for ${fallbackDef.name}:`, fallbackError);

        // 如果是完全降级，返回默认值
        if (fallbackDef.graceful && fallbackDef.defaultValue !== undefined) {
          return fallbackDef.defaultValue;
        }

        // 否则抛出原始错误
        throw error;
      }
    }
  }

  /**
   * 执行带超时的操作
   */
  async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number = 30000,
    operationName: string = 'Operation'
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      operation()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * 重试操作
   */
  async retryWithBackoff<T>(
    operation: () => Promise<T>,
    options: {
      maxRetries?: number;
      initialDelayMs?: number;
      maxDelayMs?: number;
      backoffFactor?: number;
    } = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      initialDelayMs = 1000,
      maxDelayMs = 30000,
      backoffFactor = 2,
    } = options;

    let lastError: Error | undefined;
    let delay = initialDelayMs;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          console.warn(`[ErrorBoundary] Retry attempt ${attempt + 1} failed, waiting ${delay}ms`);
          await this.sleep(delay);
          delay = Math.min(delay * backoffFactor, maxDelayMs);
        }
      }
    }

    throw lastError || new Error('All retry attempts failed');
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 记录错误到数据库（如果可用）
   */
  async logError(
    error: Error,
    category: ErrorCategory,
    severity: ErrorSeverity,
    context: ErrorContext = {}
  ): Promise<void> {
    if (!this.env.DB) return;

    try {
      const requestId = context.requestId || this.generateRequestId();
      
      await this.env.DB.prepare(
        `INSERT INTO error_logs (id, error_message, error_code, category, severity, 
         user_id, request_id, path, method, user_agent, ip, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          requestId,
          error.message,
          this.getErrorCode(error, category),
          category,
          severity,
          context.userId || null,
          requestId,
          context.path || null,
          context.method || null,
          context.userAgent || null,
          context.ip || null,
          new Date().toISOString()
        )
        .run();

      console.log(`[ErrorBoundary] Error logged: ${requestId}`);
    } catch (logError) {
      console.error('[ErrorBoundary] Failed to log error:', logError);
    }
  }

  /**
   * 获取错误统计
   */
  async getErrorStats(hours: number = 24): Promise<{
    total: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    recent: any[];
  }> {
    if (!this.env.DB) {
      return {
        total: 0,
        byCategory: {},
        bySeverity: {},
        recent: [],
      };
    }

    try {
      const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      const totalResult = await this.env.DB.prepare(
        `SELECT COUNT(*) as total FROM error_logs WHERE created_at >= ?`
      )
        .bind(cutoffTime)
        .first<{ total: number }>();

      const byCategoryResult = await this.env.DB.prepare(
        `SELECT category, COUNT(*) as count 
         FROM error_logs 
         WHERE created_at >= ? 
         GROUP BY category`
      )
        .bind(cutoffTime)
        .all<{ category: string; count: number }>();

      const bySeverityResult = await this.env.DB.prepare(
        `SELECT severity, COUNT(*) as count 
         FROM error_logs 
         WHERE created_at >= ? 
         GROUP BY severity`
      )
        .bind(cutoffTime)
        .all<{ severity: string; count: number }>();

      const recentResult = await this.env.DB.prepare(
        `SELECT * FROM error_logs 
         WHERE created_at >= ? 
         ORDER BY created_at DESC 
         LIMIT 10`
      )
        .bind(cutoffTime)
        .all();

      return {
        total: totalResult?.total || 0,
        byCategory: Object.fromEntries(
          byCategoryResult.results?.map(r => [r.category, r.count]) || []
        ),
        bySeverity: Object.fromEntries(
          bySeverityResult.results?.map(r => [r.severity, r.count]) || []
        ),
        recent: recentResult.results || [],
      };
    } catch (error) {
      console.error('[ErrorBoundary] Failed to get error stats:', error);
      return {
        total: 0,
        byCategory: {},
        bySeverity: {},
        recent: [],
      };
    }
  }
}

/**
 * 全局错误处理器
 */
export function handleGlobalError(error: Error, context?: ErrorContext): ErrorResponse {
  const service = new ErrorBoundaryService({} as Env);
  
  // 推断错误类别
  const category = inferErrorCategory(error);
  const severity = inferErrorSeverity(error, category);

  return service.createErrorResponse(error, category, severity, context);
}

/**
 * 推断错误类别
 */
function inferErrorCategory(error: Error): ErrorCategory {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
    return 'network';
  }
  if (name.includes('validation') || message.includes('invalid') || message.includes('required')) {
    return 'validation';
  }
  if (name.includes('auth') || message.includes('unauthorized') || message.includes('token')) {
    return 'authentication';
  }
  if (message.includes('permission') || message.includes('denied')) {
    return 'authorization';
  }
  if (message.includes('database') || message.includes('sql') || message.includes('d1')) {
    return 'database';
  }
  if (message.includes('external') || message.includes('third-party')) {
    return 'external_service';
  }

  return 'unknown';
}

/**
 * 推断错误严重级别
 */
function inferErrorSeverity(error: Error, category: ErrorCategory): ErrorSeverity {
  // 根据类别判断
  const categorySeverity: Record<ErrorCategory, ErrorSeverity> = {
    network: 'medium',
    validation: 'low',
    authentication: 'medium',
    authorization: 'low',
    database: 'high',
    external_service: 'medium',
    internal: 'high',
    unknown: 'medium',
  };

  return categorySeverity[category];
}
