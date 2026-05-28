import { describe, it, expect } from 'vitest';
import { 
  ErrorCode, 
  AppError, 
  createErrorResponse, 
  logError 
} from '../../src/utils/errors';

describe('Error utilities', () => {
  describe('ErrorCode enum', () => {
    it('should have all expected error codes', () => {
      expect(ErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(ErrorCode.AUTH_ERROR).toBe('AUTH_ERROR');
      expect(ErrorCode.NOT_FOUND).toBe('NOT_FOUND');
      expect(ErrorCode.CONFLICT).toBe('CONFLICT');
      expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(ErrorCode.RATE_LIMITED).toBe('RATE_LIMITED');
      expect(ErrorCode.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE');
    });
  });

  describe('AppError class', () => {
    it('should create error with correct properties', () => {
      const error = new AppError(ErrorCode.AUTH_ERROR, 'Unauthorized', 401);
      
      expect(error.code).toBe(ErrorCode.AUTH_ERROR);
      expect(error.message).toBe('Unauthorized');
      expect(error.statusCode).toBe(401);
      expect(error.name).toBe('AppError');
    });

    it('should default to statusCode 500', () => {
      const error = new AppError(ErrorCode.INTERNAL_ERROR, 'Server error');
      
      expect(error.statusCode).toBe(500);
    });

    it('should be instance of Error', () => {
      const error = new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid input');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
    });

    it('should capture stack trace', () => {
      const error = new AppError(ErrorCode.NOT_FOUND, 'Resource not found');
      
      expect(error.stack).toBeDefined();
    });
  });

  describe('createErrorResponse', () => {
    it('should create response from AppError with requestId', () => {
      const error = new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid input', 400);
      const response = createErrorResponse(error, 'req-123');
      
      expect(response.error).toBe('Invalid input');
      expect(response.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(response.message).toBe('Invalid input');
      expect(response.requestId).toBe('req-123');
      expect(response.timestamp).toBeDefined();
    });

    it('should create response from generic Error', () => {
      const error = new Error('Something went wrong');
      const response = createErrorResponse(error);
      
      expect(response.error).toBe('Internal Server Error');
      expect(response.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(response.message).toBe('Something went wrong');
    });

    it('should include timestamp in response', () => {
      const error = new AppError(ErrorCode.AUTH_ERROR, 'Auth failed');
      const response = createErrorResponse(error);
      
      expect(response.timestamp).toBeDefined();
      expect(new Date(response.timestamp!).toISOString()).toBe(response.timestamp);
    });
  });

  describe('logError', () => {
    it('should not throw when logging error', () => {
      const error = new Error('Test error');
      
      expect(() => logError(error, 'Test context')).not.toThrow();
    });

    it('should handle AppError', () => {
      const error = new AppError(ErrorCode.RATE_LIMITED, 'Too many requests', 429);
      
      expect(() => logError(error, 'Rate limit')).not.toThrow();
    });
  });
});
