// ============================================
// 结构化日志系统
// ============================================

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export enum LogCategory {
  API = 'api',
  DATABASE = 'database',
  CHANNEL = 'channel',
  QUEUE = 'queue',
  AUTH = 'auth',
  VALIDATION = 'validation',
  PERFORMANCE = 'performance',
  SECURITY = 'security',
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum ErrorType {
  VALIDATION = 'VALIDATION',
  AUTH = 'AUTH',
  DATABASE = 'DATABASE',
  NETWORK = 'NETWORK',
  CHANNEL = 'CHANNEL',
  QUEUE = 'QUEUE',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMIT = 'RATE_LIMIT',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  INTERNAL = 'INTERNAL',
  SECURITY = 'SECURITY',
  CRITICAL = 'CRITICAL',
  UNKNOWN = 'UNKNOWN',
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  requestId?: string;
  userId?: string;
      metadata?: Record<string, string | number | boolean | null | undefined>;
  error?: {
    type: ErrorType;
    severity: ErrorSeverity;
    message: string;
    stack?: string;
    code?: string;
  };
  performance?: {
    duration?: number;
    memory?: number;
    cpu?: number;
  };
}

export interface RequestContext {
  requestId: string;
  userId?: string;
  startTime: number;
  method?: string;
  path?: string;
  ip?: string;
  userAgent?: string;
}

class StructuredLogger {
  private enableJson: boolean;
  private enableColors: boolean;
  private minLevel: LogLevel;
  private errorCount: Map<string, number> = new Map();
  private lastErrorTime: Map<string, number> = new Map();
  private alertThreshold: number = 5;
  private alertWindow: number = 60000; // 1 分钟

  constructor() {
    // @ts-ignore - Cloudflare Workers 环境
    const env = typeof process !== 'undefined' ? process.env.NODE_ENV : 'development';
    this.enableJson = env === 'production';
    this.enableColors = env !== 'production';
    this.minLevel = this.parseLogLevel(
      // @ts-ignore
      typeof process !== 'undefined' ? process.env.LOG_LEVEL : undefined
    );
  }

  private parseLogLevel(level?: string): LogLevel {
    switch (level) {
      case 'debug':
        return LogLevel.DEBUG;
      case 'info':
        return LogLevel.INFO;
      case 'warn':
        return LogLevel.WARN;
      case 'error':
        return LogLevel.ERROR;
      default:
        return LogLevel.INFO;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const minIndex = levels.indexOf(this.minLevel);
    const currentIndex = levels.indexOf(level);
    return currentIndex >= minIndex;
  }

  private colorize(text: string, level: LogLevel): string {
    if (!this.enableColors) return text;

    const colors: Record<LogLevel, string> = {
      [LogLevel.DEBUG]: '\x1b[36m', // 青色
      [LogLevel.INFO]: '\x1b[32m', // 绿色
      [LogLevel.WARN]: '\x1b[33m', // 黄色
      [LogLevel.ERROR]: '\x1b[31m', // 红色
    };

    const reset = '\x1b[0m';
    return `${colors[level]}${text}${reset}`;
  }

  private formatJson(entry: LogEntry): string {
    return JSON.stringify(entry);
  }

  private formatConsole(entry: LogEntry): string {
    const timestamp = entry.timestamp.split('T')[1].split('.')[0];
    const level = this.colorize(`[${entry.level.toUpperCase()}]`, entry.level);
    const category = entry.category.toUpperCase();
    const requestId = entry.requestId ? `[${entry.requestId}]` : '';
    const userId = entry.userId ? `[${entry.userId}]` : '';

    let message = `${timestamp} ${level} ${category} ${requestId}${userId} ${entry.message}`;

    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      message += `\n  Metadata: ${JSON.stringify(entry.metadata, null, 2)}`;
    }

    if (entry.error) {
      message += `\n  Error: ${entry.error.type} - ${entry.error.message}`;
      if (entry.error.stack) {
        message += `\n  Stack: ${entry.error.stack}`;
      }
    }

    if (entry.performance) {
      const perf = entry.performance;
      if (perf.duration !== undefined) {
        message += `\n  Duration: ${perf.duration}ms`;
      }
      if (perf.memory !== undefined) {
        message += `\n  Memory: ${(perf.memory / 1024 / 1024).toFixed(2)}MB`;
      }
    }

    return message;
  }

  private checkAlert(entry: LogEntry): void {
    if (entry.level !== LogLevel.ERROR) return;

    const key = entry.error?.type || 'UNKNOWN';
    const now = Date.now();

    // 重置计数器如果在告警窗口外
    const lastTime = this.lastErrorTime.get(key) || 0;
    if (now - lastTime > this.alertWindow) {
      this.errorCount.set(key, 0);
    }

    // 增加计数
    const count = (this.errorCount.get(key) || 0) + 1;
    this.errorCount.set(key, count);
    this.lastErrorTime.set(key, now);

    // 如果超过阈值，发送告警
    if (count >= this.alertThreshold) {
      this.alert(key, count);
    }
  }

  private alert(errorType: string, count: number): void {
    const alertMessage = `🚨 ALERT: ${errorType} errors exceeded threshold (${count} errors in ${this.alertWindow / 1000}s)`;
    console.warn(
      this.enableJson
        ? JSON.stringify({ alert: true, errorType, count, timestamp: new Date().toISOString() })
        : this.colorize(alertMessage, LogLevel.ERROR)
    );
  }

  log(entry: Omit<LogEntry, 'timestamp'>): void {
    if (!this.shouldLog(entry.level)) return;

    const fullEntry: LogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };

    if (this.enableJson) {
      console.log(this.formatJson(fullEntry));
    } else {
      console.log(this.formatConsole(fullEntry));
    }

    this.checkAlert(fullEntry);
  }

  debug(message: string, context?: Partial<LogEntry>): void {
    this.log({ level: LogLevel.DEBUG, category: LogCategory.API, message, ...context });
  }

  info(message: string, context?: Partial<LogEntry>): void {
    this.log({ level: LogLevel.INFO, category: LogCategory.API, message, ...context });
  }

  warn(message: string, context?: Partial<LogEntry>): void {
    this.log({ level: LogLevel.WARN, category: LogCategory.API, message, ...context });
  }

  error(message: string, context?: Partial<LogEntry>): void {
    this.log({ level: LogLevel.ERROR, category: LogCategory.API, message, ...context });
  }

  // 特定分类的日志方法
  api(message: string, context?: Partial<LogEntry>): void {
    this.log({ level: LogLevel.INFO, category: LogCategory.API, message, ...context });
  }

  database(message: string, context?: Partial<LogEntry>): void {
    this.log({ level: LogLevel.INFO, category: LogCategory.DATABASE, message, ...context });
  }

  channel(message: string, context?: Partial<LogEntry>): void {
    this.log({ level: LogLevel.INFO, category: LogCategory.CHANNEL, message, ...context });
  }

  queue(message: string, context?: Partial<LogEntry>): void {
    this.log({ level: LogLevel.INFO, category: LogCategory.QUEUE, message, ...context });
  }

  auth(message: string, context?: Partial<LogEntry>): void {
    this.log({ level: LogLevel.INFO, category: LogCategory.AUTH, message, ...context });
  }

  security(message: string, context?: Partial<LogEntry>): void {
    this.log({ level: LogLevel.WARN, category: LogCategory.SECURITY, message, ...context });
  }

  performance(message: string, context?: Partial<LogEntry>): void {
    this.log({ level: LogLevel.INFO, category: LogCategory.PERFORMANCE, message, ...context });
  }

  // 错误日志
  logError(
    error: Error,
    context?: {
      requestId?: string;
      userId?: string;
      category?: LogCategory;
      severity?: ErrorSeverity;
    }
  ): void {
    const errorType = this.classifyError(error);
    const severity = context?.severity || this.determineSeverity(error, errorType);

    this.log({
      level: LogLevel.ERROR,
      category: context?.category || LogCategory.API,
      message: error.message,
      requestId: context?.requestId,
      userId: context?.userId,
      error: {
        type: errorType,
        severity,
        message: error.message,
        stack: error.stack,
        code: 'code' in error ? String(error.code) : undefined,
      },
    });
  }

  // 错误分类
  private classifyError(error: Error): ErrorType {
    if (error.name === 'ValidationError' || error.message.includes('validation')) {
      return ErrorType.VALIDATION;
    }
    if (
      error.name === 'AuthError' ||
      error.message.includes('auth') ||
      error.message.includes('unauthorized')
    ) {
      return ErrorType.AUTH;
    }
    if (
      error.message.includes('database') ||
      error.message.includes('D1') ||
      error.message.includes('SQL')
    ) {
      return ErrorType.DATABASE;
    }
    if (
      error.message.includes('network') ||
      error.message.includes('fetch') ||
      error.message.includes('ECONNREFUSED')
    ) {
      return ErrorType.NETWORK;
    }
    if (error.message.includes('timeout') || error.name === 'TimeoutError') {
      return ErrorType.TIMEOUT;
    }
    if (error.message.includes('rate') || error.message.includes('RATE_LIMIT')) {
      return ErrorType.RATE_LIMIT;
    }
    if (error.message.includes('not found') || error.message.includes('NOT_FOUND')) {
      return ErrorType.NOT_FOUND;
    }
    if (error.message.includes('conflict') || error.message.includes('CONFLICT')) {
      return ErrorType.CONFLICT;
    }
    if (error.name === 'AppError') {
      return ErrorType.INTERNAL;
    }
    if (error.message.includes('channel') || error.message.includes('webhook')) {
      return ErrorType.CHANNEL;
    }
    if (error.message.includes('queue') || error.message.includes('QUEUE')) {
      return ErrorType.QUEUE;
    }
    return ErrorType.UNKNOWN;
  }

  // 确定错误严重程度
  private determineSeverity(error: Error, type: ErrorType): ErrorSeverity {
    // 高严重性错误
    if (
      type === ErrorType.DATABASE ||
      type === ErrorType.NETWORK ||
      type === ErrorType.SECURITY ||
      type === ErrorType.CRITICAL
    ) {
      return ErrorSeverity.HIGH;
    }

    // 中严重性错误
    if (type === ErrorType.TIMEOUT || type === ErrorType.RATE_LIMIT || type === ErrorType.AUTH) {
      return ErrorSeverity.MEDIUM;
    }

    // 低严重性错误
    if (type === ErrorType.VALIDATION || type === ErrorType.NOT_FOUND) {
      return ErrorSeverity.LOW;
    }

    return ErrorSeverity.MEDIUM;
  }

  // 性能日志
  logPerformance(
    operation: string,
    duration: number,
    context?: {
      requestId?: string;
      userId?: string;
      memory?: number;
  metadata?: Record<string, string | number | boolean | null | undefined>;
    }
  ): void {
    this.log({
      level: duration > 1000 ? LogLevel.WARN : LogLevel.INFO,
      category: LogCategory.PERFORMANCE,
      message: `Performance: ${operation}`,
      requestId: context?.requestId,
      userId: context?.userId,
      metadata: context?.metadata,
      performance: {
        duration,
        memory: context?.memory || this.getMemoryUsage(),
      },
    });
  }

  private getMemoryUsage(): number {
    // @ts-ignore - Cloudflare Workers 环境
    if (typeof process !== 'undefined' && process.memoryUsage) {
      // @ts-ignore
      return process.memoryUsage().heapUsed;
    }
    return 0;
  }

  // 获取统计信息
  getStats(): {
    errorCounts: Record<string, number>;
    uptime: number;
  } {
    return {
      errorCounts: Object.fromEntries(this.errorCount),
      uptime: Date.now() - (this.lastErrorTime.get('start') || Date.now()),
    };
  }
}

// 导出单例
export const logger = new StructuredLogger();

// 请求上下文管理器
export function createRequestContext(
  requestId?: string,
  options?: {
    method?: string;
    path?: string;
    ip?: string;
    userAgent?: string;
    userId?: string;
  }
): RequestContext {
  return {
    requestId: requestId || crypto.randomUUID().slice(0, 8),
    startTime: Date.now(),
    method: options?.method,
    path: options?.path,
    ip: options?.ip,
    userAgent: options?.userAgent,
    userId: options?.userId,
  };
}

export function getElapsedTime(context: RequestContext): number {
  return Date.now() - context.startTime;
}
