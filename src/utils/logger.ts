import type { Context } from 'hono';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  userId?: string;
  channel?: string;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = (): LogLevel => {
  const envLevel = (globalThis as { LOG_LEVEL?: string }).LOG_LEVEL || 'info';
  return envLevel as LogLevel;
};

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel()];
}

function formatLog(entry: LogEntry): string {
  return JSON.stringify(entry);
}

export function createLogger(context?: { requestId?: string; userId?: string }) {
  function log(level: LogLevel, message: string, metadata?: Record<string, unknown>) {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      requestId: context?.requestId,
      userId: context?.userId,
      ...metadata,
    };

    if (level === 'error' && metadata?.error instanceof Error) {
      entry.error = {
        name: metadata.error.name,
        message: metadata.error.message,
        stack: metadata.error.stack,
      };
      delete metadata?.error;
    }

    if (level === 'error' || level === 'warn') {
      console.error(formatLog(entry));
    } else {
      console.log(formatLog(entry));
    }
  }

  return {
    debug: (message: string, metadata?: Record<string, unknown>) => log('debug', message, metadata),
    info: (message: string, metadata?: Record<string, unknown>) => log('info', message, metadata),
    warn: (message: string, metadata?: Record<string, unknown>) => log('warn', message, metadata),
    error: (message: string, error?: Error, metadata?: Record<string, unknown>) =>
      log('error', message, { ...metadata, error }),
  };
}

export function requestLogger(c: Context, next: () => Promise<void>) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const start = Date.now();
  const logger = createLogger({ requestId });

  c.set('requestId', requestId);
  c.set('logger', logger);

  logger.info('Request started', {
    method: c.req.method,
    path: c.req.path,
    userAgent: c.req.header('user-agent'),
  });

  return next().then(
    () => {
      const duration = Date.now() - start;
      logger.info('Request completed', { duration, status: c.res.status });
    },
    (err) => {
      const duration = Date.now() - start;
      logger.error('Request failed', err as Error, { duration });
      throw err;
    }
  );
}
