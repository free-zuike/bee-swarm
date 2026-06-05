// ============================================
// 管理员告警服务
// 提供系统监控和告警通知功能
// ============================================

import type { Env } from '../types';

/**
 * 告警级别
 */
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * 告警类型
 */
export type AlertType =
  | 'system'
  | 'performance'
  | 'security'
  | 'database'
  | 'queue'
  | 'channel';

/**
 * 告警配置
 */
export interface AlertConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 告警渠道 ID */
  alertChannelId?: string;
  /** 告警级别阈值 */
  severityThreshold: AlertSeverity;
  /** 是否发送到管理员渠道 */
  sendToAdmin: boolean;
  /** 管理员邮箱 */
  adminEmail?: string;
  /** 告警冷却时间（秒） */
  cooldownSeconds: number;
}

/**
 * 告警记录
 */
export interface AlertRecord {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  details?: any;
  createdAt: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

/**
 * 系统健康状态
 */
export interface SystemHealthStatus {
  overall: 'healthy' | 'degraded' | 'critical';
  checks: {
    database: HealthCheck;
    queue: HealthCheck;
    channels: HealthCheck;
    performance: HealthCheck;
  };
  lastChecked: string;
}

/**
 * 健康检查结果
 */
interface HealthCheck {
  status: 'ok' | 'warning' | 'error';
  latencyMs?: number;
  message?: string;
  lastChecked: string;
}

/**
 * 管理员告警服务类
 */
export class AdminAlertService {
  private env: Env;
  private config: AlertConfig;
  private lastAlertTimes: Map<string, number> = new Map();

  constructor(env: Env, config?: Partial<AlertConfig>) {
    this.env = env;
    this.config = {
      enabled: true,
      severityThreshold: 'warning',
      sendToAdmin: true,
      cooldownSeconds: 300, // 5 分钟冷却
      ...config,
    };
  }

  /**
   * 发送告警
   */
  async sendAlert(
    type: AlertType,
    severity: AlertSeverity,
    title: string,
    message: string,
    details?: any
  ): Promise<{ sent: boolean; alertId?: string; error?: string }> {
    if (!this.config.enabled) {
      return { sent: false, error: '告警功能已禁用' };
    }

    // 检查冷却时间
    const alertKey = `${type}:${severity}`;
    const lastTime = this.lastAlertTimes.get(alertKey);
    if (lastTime && Date.now() - lastTime < this.config.cooldownSeconds * 1000) {
      return { sent: false, error: '告警在冷却中' };
    }

    // 检查严重级别阈值
    if (!this.shouldAlert(severity)) {
      return { sent: false, error: '严重级别低于阈值' };
    }

    try {
      // 生成告警记录
      const alertId = crypto.randomUUID();
      const alert: AlertRecord = {
        id: alertId,
        type,
        severity,
        title,
        message,
        details,
        createdAt: new Date().toISOString(),
        acknowledged: false,
      };

      // 保存到数据库
      await this.saveAlert(alert);

      // 更新冷却时间
      this.lastAlertTimes.set(alertKey, Date.now());

      // 发送到管理员渠道（如果配置了）
      if (this.config.sendToAdmin && this.config.alertChannelId) {
        await this.sendToAdminChannel(alert);
      }

      console.log(`[AdminAlert] Alert sent: ${severity} - ${title}`);

      return { sent: true, alertId };
    } catch (error) {
      console.error('[AdminAlert] Failed to send alert:', error);
      return { sent: false, error: (error as Error).message };
    }
  }

  /**
   * 系统健康检查
   */
  async checkSystemHealth(): Promise<SystemHealthStatus> {
    const checks = {
      database: await this.checkDatabase(),
      queue: await this.checkQueue(),
      channels: await this.checkChannels(),
      performance: await this.checkPerformance(),
    };

    // 计算整体状态
    let overall: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (checks.database.status === 'error' || checks.performance.status === 'error') {
      overall = 'critical';
    } else if (
      checks.database.status === 'warning' ||
      checks.queue.status === 'warning' ||
      checks.channels.status === 'warning'
    ) {
      overall = 'degraded';
    }

    const result: SystemHealthStatus = {
      overall,
      checks,
      lastChecked: new Date().toISOString(),
    };

    // 如果状态不健康，发送告警
    if (overall !== 'healthy') {
      await this.sendSystemAlert(result);
    }

    return result;
  }

  /**
   * 数据库健康检查
   */
  private async checkDatabase(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      const result = await this.env.DB!.prepare('SELECT 1').first();

      if (result) {
        return {
          status: 'ok',
          latencyMs: Date.now() - startTime,
          lastChecked: new Date().toISOString(),
        };
      }

      return {
        status: 'error',
        message: '数据库查询失败',
        lastChecked: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        message: (error as Error).message,
        lastChecked: new Date().toISOString(),
      };
    }
  }

  /**
   * 队列健康检查
   */
  private async checkQueue(): Promise<HealthCheck> {
    if (!this.env.PUSH_QUEUE) {
      return {
        status: 'warning',
        message: '队列服务未配置',
        lastChecked: new Date().toISOString(),
      };
    }

    return {
      status: 'ok',
      lastChecked: new Date().toISOString(),
    };
  }

  /**
   * 渠道健康检查
   */
  private async checkChannels(): Promise<HealthCheck> {
    try {
      const result = await this.env.DB!.prepare(
        'SELECT COUNT(*) as total, SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) as enabled FROM channel_configs'
      ).first<{ total: number; enabled: number }>();

      if (!result || result.total === 0) {
        return {
          status: 'warning',
          message: '未配置任何渠道',
          lastChecked: new Date().toISOString(),
        };
      }

      if (result.enabled === 0) {
        return {
          status: 'error',
          message: '所有渠道已禁用',
          lastChecked: new Date().toISOString(),
        };
      }

      return {
        status: 'ok',
        lastChecked: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        message: (error as Error).message,
        lastChecked: new Date().toISOString(),
      };
    }
  }

  /**
   * 性能健康检查
   */
  private async checkPerformance(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      // 检查最近的推送延迟
      const result = await this.env.DB!.prepare(
        `SELECT AVG(latency_ms) as avgLatency 
         FROM push_history 
         WHERE created_at >= datetime('now', '-1 hour')`
      ).first<{ avgLatency: number }>();

      const latency = Date.now() - startTime;
      const avgLatency = result?.avgLatency || 0;

      // 如果平均延迟超过 5 秒或检查本身延迟过高
      if (avgLatency > 5000 || latency > 1000) {
        return {
          status: 'warning',
          latencyMs: latency,
          message: `性能下降：平均延迟 ${Math.round(avgLatency)}ms`,
          lastChecked: new Date().toISOString(),
        };
      }

      return {
        status: 'ok',
        latencyMs: latency,
        lastChecked: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'warning',
        message: (error as Error).message,
        lastChecked: new Date().toISOString(),
      };
    }
  }

  /**
   * 发送系统告警
   */
  private async sendSystemAlert(status: SystemHealthStatus): Promise<void> {
    const { overall, checks, lastChecked } = status;

    const messages: string[] = [];
    messages.push(`系统状态: ${overall.toUpperCase()}`);
    messages.push(`检查时间: ${lastChecked}`);
    messages.push('');
    messages.push('详细检查:');

    for (const [name, check] of Object.entries(checks)) {
      const icon = check.status === 'ok' ? '✅' : check.status === 'warning' ? '⚠️' : '❌';
      messages.push(`${icon} ${name}: ${check.status}${check.message ? ` - ${check.message}` : ''}`);
    }

    await this.sendAlert(
      'system',
      overall === 'critical' ? 'critical' : 'warning',
      `系统状态: ${overall}`,
      messages.join('\n'),
      status
    );
  }

  /**
   * 保存告警记录
   */
  private async saveAlert(alert: AlertRecord): Promise<void> {
    if (!this.env.DB) return;

    try {
      await this.env.DB.prepare(
        `INSERT INTO alert_records (id, type, severity, title, message, details, created_at, acknowledged)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          alert.id,
          alert.type,
          alert.severity,
          alert.title,
          alert.message,
          JSON.stringify(alert.details || {}),
          alert.createdAt,
          alert.acknowledged ? 1 : 0
        )
        .run();

      // 同时发送到 KV 存储以便快速查询
      if (this.env.RATE_LIMIT_KV) {
        await this.env.RATE_LIMIT_KV.put(`alert:${alert.id}`, JSON.stringify(alert), {
          expirationTtl: 86400 * 7, // 7 天过期
        });
      }
    } catch (error) {
      console.error('[AdminAlert] Failed to save alert:', error);
    }
  }

  /**
   * 发送到管理员渠道
   */
  private async sendToAdminChannel(alert: AlertRecord): Promise<void> {
    // 这里应该调用推送服务发送告警
    // 由于是管理员告警，应该使用系统级推送
    console.log(`[AdminAlert] Would send alert to admin channel: ${alert.title}`);
  }

  /**
   * 检查是否应该告警
   */
  private shouldAlert(severity: AlertSeverity): boolean {
    const levels: Record<AlertSeverity, number> = {
      info: 0,
      warning: 1,
      error: 2,
      critical: 3,
    };

    return levels[severity] >= levels[this.config.severityThreshold];
  }

  /**
   * 获取告警列表
   */
  async getAlerts(options: {
    limit?: number;
    offset?: number;
    severity?: AlertSeverity;
    type?: AlertType;
    acknowledged?: boolean;
  } = {}): Promise<AlertRecord[]> {
    if (!this.env.DB) return [];

    const { limit = 50, offset = 0, severity, type, acknowledged } = options;

    let query = 'SELECT * FROM alert_records WHERE 1=1';
    const params: any[] = [];

    if (severity) {
      query += ' AND severity = ?';
      params.push(severity);
    }

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    if (acknowledged !== undefined) {
      query += ' AND acknowledged = ?';
      params.push(acknowledged ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    try {
      const result = await this.env.DB.prepare(query).bind(...params).all<any>();

      return (result.results || []).map((row: any) => ({
        id: row.id,
        type: row.type,
        severity: row.severity,
        title: row.title,
        message: row.message,
        details: row.details ? JSON.parse(row.details) : undefined,
        createdAt: row.created_at,
        acknowledged: !!row.acknowledged,
        acknowledgedBy: row.acknowledged_by,
        acknowledgedAt: row.acknowledged_at,
      }));
    } catch (error) {
      console.error('[AdminAlert] Failed to get alerts:', error);
      return [];
    }
  }

  /**
   * 确认告警
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<boolean> {
    if (!this.env.DB) return false;

    try {
      const result = await this.env.DB.prepare(
        `UPDATE alert_records SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = ? WHERE id = ?`
      )
        .bind(acknowledgedBy, new Date().toISOString(), alertId)
        .run();

      return (result.meta?.changes || 0) > 0;
    } catch (error) {
      console.error('[AdminAlert] Failed to acknowledge alert:', error);
      return false;
    }
  }

  /**
   * 获取告警统计
   */
  async getAlertStats(hours: number = 24): Promise<{
    total: number;
    bySeverity: Record<AlertSeverity, number>;
    byType: Record<AlertType, number>;
    unacknowledged: number;
  }> {
    if (!this.env.DB) {
      return {
        total: 0,
        bySeverity: { info: 0, warning: 0, error: 0, critical: 0 },
        byType: { system: 0, performance: 0, security: 0, database: 0, queue: 0, channel: 0 },
        unacknowledged: 0,
      };
    }

    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    try {
      const [totalResult, bySeverityResult, byTypeResult, unacknowledgedResult] = await Promise.all([
        this.env.DB.prepare('SELECT COUNT(*) as count FROM alert_records WHERE created_at >= ?')
          .bind(cutoffTime)
          .first<{ count: number }>(),
        this.env.DB.prepare(
          `SELECT severity, COUNT(*) as count FROM alert_records WHERE created_at >= ? GROUP BY severity`
        )
          .bind(cutoffTime)
          .all<{ severity: string; count: number }>(),
        this.env.DB.prepare(
          `SELECT type, COUNT(*) as count FROM alert_records WHERE created_at >= ? GROUP BY type`
        )
          .bind(cutoffTime)
          .all<{ type: string; count: number }>(),
        this.env.DB.prepare(
          'SELECT COUNT(*) as count FROM alert_records WHERE created_at >= ? AND acknowledged = 0'
        )
          .bind(cutoffTime)
          .first<{ count: number }>(),
      ]);

      return {
        total: totalResult?.count || 0,
        bySeverity: Object.fromEntries(
          (bySeverityResult.results || []).map((r) => [r.severity, r.count])
        ) as Record<AlertSeverity, number>,
        byType: Object.fromEntries(
          (byTypeResult.results || []).map((r) => [r.type, r.count])
        ) as Record<AlertType, number>,
        unacknowledged: unacknowledgedResult?.count || 0,
      };
    } catch (error) {
      console.error('[AdminAlert] Failed to get alert stats:', error);
      return {
        total: 0,
        bySeverity: { info: 0, warning: 0, error: 0, critical: 0 },
        byType: { system: 0, performance: 0, security: 0, database: 0, queue: 0, channel: 0 },
        unacknowledged: 0,
      };
    }
  }
}
