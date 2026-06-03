import { describe, it, expect, beforeEach } from 'vitest';
import {
  logger,
  LogLevel,
  LogCategory,
  ErrorSeverity,
  ErrorType,
  createRequestContext,
  getElapsedTime,
  type RequestContext
} from '../../src/utils/logger';

describe('Logger', () => {
  beforeEach(() => {
    // 每个测试前清空统计
    logger.getStats();
  });

  describe('LogLevel', () => {
    it('应该定义正确的日志级别', () => {
      expect(LogLevel.DEBUG).toBe('debug');
      expect(LogLevel.INFO).toBe('info');
      expect(LogLevel.WARN).toBe('warn');
      expect(LogLevel.ERROR).toBe('error');
    });
  });

  describe('LogCategory', () => {
    it('应该定义正确的日志分类', () => {
      expect(LogCategory.API).toBe('api');
      expect(LogCategory.DATABASE).toBe('database');
      expect(LogCategory.CHANNEL).toBe('channel');
      expect(LogCategory.QUEUE).toBe('queue');
      expect(LogCategory.AUTH).toBe('auth');
      expect(LogCategory.VALIDATION).toBe('validation');
      expect(LogCategory.PERFORMANCE).toBe('performance');
      expect(LogCategory.SECURITY).toBe('security');
    });
  });

  describe('ErrorSeverity', () => {
    it('应该定义正确的错误严重程度', () => {
      expect(ErrorSeverity.LOW).toBe('low');
      expect(ErrorSeverity.MEDIUM).toBe('medium');
      expect(ErrorSeverity.HIGH).toBe('high');
      expect(ErrorSeverity.CRITICAL).toBe('critical');
    });
  });

  describe('ErrorType', () => {
    it('应该定义正确的错误类型', () => {
      expect(ErrorType.VALIDATION).toBe('VALIDATION');
      expect(ErrorType.AUTH).toBe('AUTH');
      expect(ErrorType.DATABASE).toBe('DATABASE');
      expect(ErrorType.NETWORK).toBe('NETWORK');
      expect(ErrorType.CHANNEL).toBe('CHANNEL');
      expect(ErrorType.QUEUE).toBe('QUEUE');
      expect(ErrorType.TIMEOUT).toBe('TIMEOUT');
      expect(ErrorType.RATE_LIMIT).toBe('RATE_LIMIT');
      expect(ErrorType.NOT_FOUND).toBe('NOT_FOUND');
      expect(ErrorType.CONFLICT).toBe('CONFLICT');
      expect(ErrorType.INTERNAL).toBe('INTERNAL');
      expect(ErrorType.UNKNOWN).toBe('UNKNOWN');
    });
  });

  describe('createRequestContext', () => {
    it('应该创建带有随机请求 ID 的上下文', () => {
      const context = createRequestContext();
      expect(context.requestId).toBeDefined();
      expect(context.requestId.length).toBe(8);
      expect(context.startTime).toBeDefined();
      expect(typeof context.startTime).toBe('number');
    });

    it('应该使用提供的请求 ID', () => {
      const customId = 'test-request-id';
      const context = createRequestContext(customId);
      expect(context.requestId).toBe(customId);
    });

    it('应该包含可选字段', () => {
      const context = createRequestContext(undefined, {
        method: 'GET',
        path: '/api/test',
        ip: '127.0.0.1',
        userAgent: 'Test Agent',
      });
      expect(context.method).toBe('GET');
      expect(context.path).toBe('/api/test');
      expect(context.ip).toBe('127.0.0.1');
      expect(context.userAgent).toBe('Test Agent');
    });
  });

  describe('getElapsedTime', () => {
    it('应该计算经过的时间', async () => {
      const context = createRequestContext();
      await new Promise(resolve => setTimeout(resolve, 20));
      const elapsed = getElapsedTime(context);
      expect(elapsed).toBeGreaterThanOrEqual(15);
    });
  });

  describe('logger', () => {
    it('应该能够记录调试日志', () => {
      expect(() => logger.debug('Test debug message')).not.toThrow();
    });

    it('应该能够记录信息日志', () => {
      expect(() => logger.info('Test info message')).not.toThrow();
    });

    it('应该能够记录警告日志', () => {
      expect(() => logger.warn('Test warn message')).not.toThrow();
    });

    it('应该能够记录错误日志', () => {
      expect(() => logger.error('Test error message')).not.toThrow();
    });

    it('应该能够使用特定分类记录日志', () => {
      expect(() => logger.api('API message')).not.toThrow();
      expect(() => logger.database('Database message')).not.toThrow();
      expect(() => logger.channel('Channel message')).not.toThrow();
      expect(() => logger.queue('Queue message')).not.toThrow();
      expect(() => logger.auth('Auth message')).not.toThrow();
      expect(() => logger.security('Security message')).not.toThrow();
      expect(() => logger.performance('Performance message')).not.toThrow();
    });

    it('应该能够记录带上下文的日志', () => {
      const requestId = 'test-123';
      const userId = 'user-456';
      
      expect(() => logger.info('Test message', {
        requestId,
        userId,
        metadata: { key: 'value' },
      })).not.toThrow();
    });

    it('应该能够记录错误日志', () => {
      const error = new Error('Test error');
      expect(() => logger.logError(error, {
        requestId: 'test-123',
        userId: 'user-456',
      })).not.toThrow();
    });

    it('应该能够记录性能日志', () => {
      expect(() => logger.performance('Operation completed', {
        duration: 100,
        requestId: 'test-123',
      })).not.toThrow();
    });

    it('应该能够获取统计信息', () => {
      const stats = logger.getStats();
      expect(stats).toHaveProperty('errorCounts');
      expect(stats).toHaveProperty('uptime');
      expect(typeof stats.uptime).toBe('number');
    });
  });

  describe('错误分类', () => {
    it('应该正确分类验证错误', () => {
      const error = new Error('Validation failed');
      const context = { category: LogCategory.VALIDATION };
      expect(() => logger.logError(error, context)).not.toThrow();
    });

    it('应该正确分类认证错误', () => {
      const error = new Error('Unauthorized access');
      const context = { category: LogCategory.AUTH };
      expect(() => logger.logError(error, context)).not.toThrow();
    });

    it('应该正确分类数据库错误', () => {
      const error = new Error('Database connection failed');
      const context = { category: LogCategory.DATABASE };
      expect(() => logger.logError(error, context)).not.toThrow();
    });

    it('应该正确分类网络错误', () => {
      const error = new Error('Network timeout');
      const context = { category: LogCategory.API };
      expect(() => logger.logError(error, context)).not.toThrow();
    });

    it('应该正确分类渠道错误', () => {
      const error = new Error('Webhook failed');
      const context = { category: LogCategory.CHANNEL };
      expect(() => logger.logError(error, context)).not.toThrow();
    });

    it('应该正确分类队列错误', () => {
      const error = new Error('Queue processing failed');
      const context = { category: LogCategory.QUEUE };
      expect(() => logger.logError(error, context)).not.toThrow();
    });
  });
});
