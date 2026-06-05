// ============================================
// 结构化日志服务
// 提供更完善的日志记录和分类功能
// ============================================

/**
 * 日志级别
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

/**
 * 日志分类
 */
export type LogCategory =
  | 'api'
  | 'database'
  | 'channel'
  | 'queue'
  | 'auth'
  | 'security'
  | 'performance'
  | 'backup'
  | 'cron'
  | 'webhook'
  | 'health'
  | 'circuit_breaker'
  | 'template_version'
  | 'unknown';

/**
 * 结构化日志条目
 */
export interface StructuredLog {
  id: string;
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  user_id: string | null;
  request_id: string | null;
  channel_id: string | null;
  template_id: string | null;
  metadata: Record<string, any>;
  error: Error | null;
  stack_trace: string | null;
}

/**
 * 日志服务配置
 */
interface LogConfig {
  min_level: LogLevel;
  max_stack_trace_lines: number;
  metadata_max_size: number;
}

/**
 * 日志统计
 */
export interface LogStats {
  total: number;
  by_level: Record<LogLevel, number>;
  by_category: Record<LogCategory, number>;
  by_hour: Record<string, number>;
  errors_last_hour: number;
  errors_last_day: number;
}

/**
 * 结构化日志服务类
 */
export class StructuredLogger {
  private config: LogConfig;
  private logs_in_memory: StructuredLog[] = [];
  private max_in_memory_logs = 1000;

  constructor(config: Partial<LogConfig> = {}) {
    this.config = {
      min_level: 'info',
      max_stack_trace_lines: 50,
      metadata_max_size: 10000,
      ...config,
    };
  }

  /**
   * 日志级别权重
   */
  private level_weight(level: LogLevel): number {
    const weights: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
      critical: 4,
    };
    return weights[level];
  }

  /**
   * 检查是否应该记录
   */
  private should_log(level: LogLevel): boolean {
    return this.level_weight(level) >= this.level_weight(this.config.min_level);
  }

  /**
   * 记录日志
   */
  log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    options: {
      user_id?: string;
      request_id?: string;
      channel_id?: string;
      template_id?: string;
      metadata?: Record<string, any>;
      error?: Error;
    } = {}
  ): StructuredLog {
    const log: StructuredLog = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      user_id: options.user_id || null,
      request_id: options.request_id || null,
      channel_id: options.channel_id || null,
      template_id: options.template_id || null,
      metadata: this.safe_stringify_metadata(options.metadata),
      error: options.error || null,
      stack_trace: options.error ? this.truncate_stack_trace(options.error.stack) : null,
    };

    if (this.should_log(level)) {
      // 输出到控制台
      this.log_to_console(log);
      
      // 保存到内存
      this.save_in_memory(log);
    }

    return log;
  }

  /**
   * 安全处理 metadata
   */
  private safe_stringify_metadata(
    metadata: Record<string, any> | undefined
  ): Record<string, any> {
    if (!metadata) return {};

    try {
      const stringified = JSON.stringify(metadata);
      if (stringified.length <= this.config.metadata_max_size) {
        return metadata;
      }

      // 截断过长的 metadata
      const truncated: Record<string, any> = {};
      let size = 0;

      for (const [key, value] of Object.entries(metadata)) {
        const value_str = JSON.stringify(value);
        if (size + value_str.length <= this.config.metadata_max_size) {
          truncated[key] = value;
          size += value_str.length;
        } else {
          truncated[key] = `<truncated: ${typeof value}>`;
        }
      }

      truncated['_truncated'] = true;
      return truncated;
    } catch {
      return { _error: 'Metadata serialization failed' };
    }
  }

  /**
   * 截断堆栈跟踪
   */
  private truncate_stack_trace(stack: string | undefined): string | null {
    if (!stack) return null;

    const lines = stack.split('\n');
    const truncated = lines.slice(0, this.config.max_stack_trace_lines);
    
    if (lines.length > this.config.max_stack_trace_lines) {
      truncated.push(`... (${lines.length - this.config.max_stack_trace_lines} more lines)`);
    }

    return truncated.join('\n');
  }

  /**
   * 输出到控制台
   */
  private log_to_console(log: StructuredLog): void {
    const colors: Record<LogLevel, string> = {
      debug: '\x1b[36m', // Cyan
      info: '\x1b[32m',  // Green
      warn: '\x1b[33m',  // Yellow
      error: '\x1b[31m', // Red
      critical: '\x1b[35m', // Magenta
    };

    const reset = '\x1b[0m';
    const color = colors[log.level] || '';

    let console_message = `${color}[${log.timestamp}] [${log.level.toUpperCase()}] [${log.category}] ${reset}${log.message}`;
    
    if (log.user_id) {
      console_message += ` (user: ${log.user_id})`;
    }
    
    if (log.request_id) {
      console_message += ` [${log.request_id}]`;
    }

    console.log(console_message);

    if (log.stack_trace) {
      console.error(log.stack_trace);
    }
  }

  /**
   * 保存到内存
   */
  private save_in_memory(log: StructuredLog): void {
    this.logs_in_memory.push(log);
    
    // 限制内存日志数量
    if (this.logs_in_memory.length > this.max_in_memory_logs) {
      this.logs_in_memory = this.logs_in_memory.slice(-this.max_in_memory_logs);
    }
  }

  // 便捷方法

  debug(category: LogCategory, message: string, options = {}) {
    return this.log('debug', category, message, options);
  }

  info(category: LogCategory, message: string, options = {}) {
    return this.log('info', category, message, options);
  }

  warn(category: LogCategory, message: string, options = {}) {
    return this.log('warn', category, message, options);
  }

  error(category: LogCategory, message: string, options = {}) {
    return this.log('error', category, message, options);
  }

  critical(category: LogCategory, message: string, options = {}) {
    return this.log('critical', category, message, options);
  }

  // 分类日志快捷方法

  api(message: string, level: LogLevel = 'info', options = {}) {
    return this.log(level, 'api', message, options);
  }

  db(message: string, level: LogLevel = 'info', options = {}) {
    return this.log(level, 'database', message, options);
  }

  channel(message: string, level: LogLevel = 'info', options = {}) {
    return this.log(level, 'channel', message, options);
  }

  auth(message: string, level: LogLevel = 'info', options = {}) {
    return this.log(level, 'auth', message, options);
  }

  security(message: string, level: LogLevel = 'warn', options = {}) {
    return this.log(level, 'security', message, options);
  }

  performance(message: string, level: LogLevel = 'info', options = {}) {
    return this.log(level, 'performance', message, options);
  }

  circuit_breaker(message: string, level: LogLevel = 'warn', options = {}) {
    return this.log(level, 'circuit_breaker', message, options);
  }

  template_version(message: string, level: LogLevel = 'info', options = {}) {
    return this.log(level, 'template_version', message, options);
  }

  /**
   * 获取内存中的日志
   */
  get_logs(
    filters: {
      level?: LogLevel;
      category?: LogCategory;
      user_id?: string;
      channel_id?: string;
      start_time?: string;
      end_time?: string;
      limit?: number;
    } = {}
  ): StructuredLog[] {
    let result = [...this.logs_in_memory];

    if (filters.level) {
      result = result.filter(l => l.level === filters.level);
    }

    if (filters.category) {
      result = result.filter(l => l.category === filters.category);
    }

    if (filters.user_id) {
      result = result.filter(l => l.user_id === filters.user_id);
    }

    if (filters.channel_id) {
      result = result.filter(l => l.channel_id === filters.channel_id);
    }

    const start_time = filters.start_time;
    const end_time = filters.end_time;

    if (start_time) {
      result = result.filter(l => l.timestamp >= start_time);
    }

    if (end_time) {
      result = result.filter(l => l.timestamp <= end_time);
    }

    if (filters.limit) {
      result = result.slice(-filters.limit);
    }

    return result;
  }

  /**
   * 获取日志统计
   */
  get_stats(last_hours = 24): LogStats {
    const cutoff = new Date(Date.now() - last_hours * 60 * 60 * 1000).toISOString();
    const logs = this.logs_in_memory.filter(l => l.timestamp >= cutoff);

    const stats: LogStats = {
      total: logs.length,
      by_level: { debug: 0, info: 0, warn: 0, error: 0, critical: 0 },
      by_category: {
        api: 0, database: 0, channel: 0, queue: 0, auth: 0, security: 0,
        performance: 0, backup: 0, cron: 0, webhook: 0, health: 0,
        circuit_breaker: 0, template_version: 0, unknown: 0,
      },
      by_hour: {},
      errors_last_hour: 0,
      errors_last_day: logs.filter(l => l.level === 'error' || l.level === 'critical').length,
    };

    const one_hour_ago = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    for (const log of logs) {
      stats.by_level[log.level]++;
      stats.by_category[log.category]++;
      
      // 按小时统计
      const hour_key = log.timestamp.slice(0, 13);
      stats.by_hour[hour_key] = (stats.by_hour[hour_key] || 0) + 1;

      // 最近1小时错误
      if (log.timestamp >= one_hour_ago && (log.level === 'error' || log.level === 'critical')) {
        stats.errors_last_hour++;
      }
    }

    return stats;
  }

  /**
   * 清除内存日志
   */
  clear_logs(): void {
    this.logs_in_memory = [];
  }

  /**
   * 导出自定义格式
   */
  export_logs(format: 'json' | 'ndjson' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify(this.logs_in_memory, null, 2);
    } else {
      return this.logs_in_memory.map(log => JSON.stringify(log)).join('\n');
    }
  }
}

// 全局实例
let global_logger: StructuredLogger | null = null;

/**
 * 获取全局日志实例
 */
export function get_logger(): StructuredLogger {
  if (!global_logger) {
    global_logger = new StructuredLogger();
  }
  return global_logger;
}

/**
 * 设置全局日志配置
 */
export function configure_logger(config: Partial<LogConfig>): void {
  global_logger = new StructuredLogger(config);
}
