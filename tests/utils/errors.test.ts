import { describe, it, expect } from 'vitest';
import { ErrorCode, AppError, createErrorResponse } from '../../src/utils/errors';

describe('ErrorCode', () => {
  it('should have correct error codes', () => {
    expect(ErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
    expect(ErrorCode.AUTH_ERROR).toBe('AUTH_ERROR');
    expect(ErrorCode.NOT_FOUND).toBe('NOT_FOUND');
    expect(ErrorCode.CONFLICT).toBe('CONFLICT');
    expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    expect(ErrorCode.RATE_LIMITED).toBe('RATE_LIMITED');
    expect(ErrorCode.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE');
  });
});

describe('AppError', () => {
  it('should create an AppError with correct properties', () => {
    const error = new AppError(ErrorCode.AUTH_ERROR, 'Test error', 401);
    
    expect(error.code).toBe(ErrorCode.AUTH_ERROR);
    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(401);
    expect(error.name).toBe('AppError');
  });

  it('should default statusCode to 500', () => {
    const error = new AppError(ErrorCode.INTERNAL_ERROR, 'Test error');
    
    expect(error.statusCode).toBe(500);
  });
});

describe('createErrorResponse', () => {
  it('should create correct response for AppError', () => {
    const error = new AppError(ErrorCode.VALIDATION_ERROR, 'Validation failed', 400);
    const response = createErrorResponse(error, 'test-123');
    
    expect(response.error).toBe('Validation failed');
    expect(response.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(response.message).toBe('Validation failed');
    expect(response.requestId).toBe('test-123');
    expect(response.timestamp).toBeDefined();
  });

  it('should create correct response for generic Error', () => {
    const error = new Error('Generic error');
    const response = createErrorResponse(error);
    
    expect(response.error).toBe('Internal Server Error');
    expect(response.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(response.message).toBe('Generic error');
  });
});