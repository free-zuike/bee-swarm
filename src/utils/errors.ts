export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

export interface ErrorResponse {
  error: string;
  code: ErrorCode;
  message?: string;
  timestamp?: string;
  requestId?: string;
}

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function createErrorResponse(error: Error | AppError, requestId?: string): ErrorResponse {
  if (error instanceof AppError) {
    return {
      error: error.message,
      code: error.code,
      message: error.message,
      timestamp: new Date().toISOString(),
      requestId,
    };
  }

  return {
    error: 'Internal Server Error',
    code: ErrorCode.INTERNAL_ERROR,
    message: error.message,
    timestamp: new Date().toISOString(),
    requestId,
  };
}

export function logError(error: Error, context?: string): void {
  const requestId = crypto.randomUUID().slice(0, 8);
  const timestamp = new Date().toISOString();

  console.error(`[${timestamp}] [${requestId}] ${context || 'Error'}:`);
  console.error(`  Message: ${error.message}`);
  console.error(`  Stack: ${error.stack}`);

  if (error instanceof AppError) {
    console.error(`  Code: ${error.code}`);
    console.error(`  Status: ${error.statusCode}`);
  }
}
