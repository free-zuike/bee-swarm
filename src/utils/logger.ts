import type { Context } from 'hono';
import type { Env } from '../types';

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

const DEFAULT_LOG_LEVEL: LogLevel = 'info';

let cachedLogLevel: LogLevel | null = null;
let lastCheckTime = 0;

function getLogLevel(env?: Env): LogLevel {
  const now = Date.now();
  if (cachedLogLevel && now - lastCheckTime < 60000) {
    return cachedLogLevel;
  }

  const level =
    env?.LOG_LEVEL || (globalThis as { LOG_LEVEL?: string }).LOG_LEVEL || DEFAULT_LOG_LEVEL;
  cachedLogLevel = (level as LogLevel) in LOG_LEVELS ? (level as LogLevel) : DEFAULT_LOG_LEVEL;
  lastCheckTime = now;
  return cachedLogLevel;
}

function shouldLog(level: LogLevel, env?: Env): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[getLogLevel(env)];
}

function formatLog(entry: LogEntry): string {
  return JSON.stringify(entry);
}

export function createLogger(context?: { requestId?: string; userId?: string }, env?: Env) {
  function log(level: LogLevel, message: string, metadata?: Record<string, unknown>) {
    if (!shouldLog(level, env)) return;

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
      delete (metadata as Record<string, unknown>).error;
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
  const logger = createLogger({ requestId }, c.env as unknown as Env);

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
