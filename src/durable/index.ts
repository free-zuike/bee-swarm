// ============================================
// Durable Objects 定义
// 用于健康检查持久化、WebSocket、分布式锁
// 免费额度：1 million 请求/月
// ============================================

/**
 * 健康状态记录
 */
export interface HealthStatus {
  channel: string;
  healthy: boolean;
  lastCheckTime: string;
  lastSuccessTime?: string;
  lastFailureTime?: string;
  consecutiveFailures: number;
  totalChecks: number;
  successRate: number;
  averageLatency: number;
  lastError?: string;
  message: string;
}

/**
 * 健康历史记录条目
 */
export interface HealthHistoryEntry {
  timestamp: string;
  status: HealthStatus;
}

/**
 * 告警配置
 */
export interface AlertConfig {
  enabled: boolean;
  consecutiveFailuresThreshold: number;
  minSuccessRate: number;
  maxLatency: number;
}

/**
 * WebSocket 消息
 */
export interface WebSocketMessage {
  type: 'push_result' | 'health_alert' | 'system' | 'ping' | 'pong' | 'user_action';
  data: unknown;
  timestamp: string;
}

/**
 * 已连接的客户端信息
 */
export interface ConnectedClient {
  id: string;
  ip?: string;
  connectedAt: string;
  lastActivity: string;
  userId?: string;
}

/**
 * 锁信息
 */
export interface LockInfo {
  locked: boolean;
  lockedBy?: string;
  lockedAt?: string;
  expiresAt?: string;
}

// ============================================
// 健康检查追踪器 Durable Object
// ============================================

export class HealthTrackerDO {
  private state: DurableObjectState;
  private healthData: Map<string, HealthStatus> = new Map();
  private history: HealthHistoryEntry[] = [];
  private alertConfig: AlertConfig = {
    enabled: true,
    consecutiveFailuresThreshold: 5,
    minSuccessRate: 0.7,
    maxLatency: 5000,
  };

  constructor(state: DurableObjectState) {
    this.state = state;
    this.loadFromStorage();
  }

  private async loadFromStorage(): Promise<void> {
    try {
      const stored = await this.state.storage.get<{
        healthData: Record<string, HealthStatus>;
        history: HealthHistoryEntry[];
        alertConfig: AlertConfig;
      }>('data');

      if (stored) {
        this.healthData = new Map(Object.entries(stored.healthData || {}));
        this.history = stored.history || [];
        this.alertConfig = { ...this.alertConfig, ...stored.alertConfig };
      }
    } catch {
      console.error('[HealthTracker] Failed to load from storage');
    }
  }

  private async saveToStorage(): Promise<void> {
    try {
      await this.state.storage.put('data', {
        healthData: Object.fromEntries(this.healthData),
        history: this.history,
        alertConfig: this.alertConfig,
      });
    } catch {
      console.error('[HealthTracker] Failed to save to storage');
    }
  }

  /**
   * 记录健康检查结果
   */
  async recordHealthCheck(status: HealthStatus): Promise<void> {
    this.healthData.set(status.channel, status);

    this.history.push({
      timestamp: new Date().toISOString(),
      status: { ...status },
    });

    if (this.history.length > 1000) {
      this.history = this.history.slice(-1000);
    }

    await this.saveToStorage();

    if (
      this.alertConfig.enabled &&
      !status.healthy &&
      status.consecutiveFailures >= this.alertConfig.consecutiveFailuresThreshold
    ) {
      console.warn(
        `[HealthTracker] Alert: Channel ${status.channel} has ${status.consecutiveFailures} consecutive failures`
      );
    }
  }

  /**
   * 获取单个渠道的健康状态
   */
  async getHealthStatus(channel: string): Promise<HealthStatus | null> {
    return this.healthData.get(channel) || null;
  }

  /**
   * 获取所有渠道的健康状态
   */
  async getAllHealthStatus(): Promise<HealthStatus[]> {
    return Array.from(this.healthData.values());
  }

  /**
   * 获取健康检查历史
   */
  async getHealthHistory(channel?: string, limit = 100): Promise<HealthHistoryEntry[]> {
    let filtered = this.history;
    if (channel) {
      filtered = this.history.filter((entry) => entry.status.channel === channel);
    }
    return filtered.slice(-limit);
  }

  /**
   * 获取健康统计摘要
   */
  async getHealthSummary(): Promise<{
    total: number;
    healthy: number;
    unhealthy: number;
    averageSuccessRate: number;
    alertEnabled: boolean;
  }> {
    const statuses = Array.from(this.healthData.values());
    const healthy = statuses.filter((s) => s.healthy).length;
    const avgRate =
      statuses.length > 0
        ? statuses.reduce((sum, s) => sum + s.successRate, 0) / statuses.length
        : 0;

    return {
      total: statuses.length,
      healthy,
      unhealthy: statuses.length - healthy,
      averageSuccessRate: Math.round(avgRate * 100) / 100,
      alertEnabled: this.alertConfig.enabled,
    };
  }

  /**
   * 更新告警配置
   */
  async updateAlertConfig(config: Partial<AlertConfig>): Promise<void> {
    this.alertConfig = { ...this.alertConfig, ...config };
    await this.saveToStorage();
  }

  /**
   * 获取告警配置
   */
  async getAlertConfig(): Promise<AlertConfig> {
    return { ...this.alertConfig };
  }

  /**
   * 获取长期趋势数据（按天聚合）
   */
  async getHealthTrend(days = 30): Promise<
    Array<{
      date: string;
      avgSuccessRate: number;
      totalChecks: number;
      channelStats: Record<string, { successRate: number; checks: number }>;
    }>
  > {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const filtered = this.history.filter((entry) => new Date(entry.timestamp) >= cutoff);

    const byDate = new Map<
      string,
      { channelData: Map<string, { successes: number; total: number }> }
    >();

    for (const entry of filtered) {
      const date = entry.timestamp.split('T')[0];
      if (!byDate.has(date)) {
        byDate.set(date, { channelData: new Map() });
      }

      const dayData = byDate.get(date)!;
      const channel = entry.status.channel;

      if (!dayData.channelData.has(channel)) {
        dayData.channelData.set(channel, { successes: 0, total: 0 });
      }

      const stats = dayData.channelData.get(channel)!;
      stats.total++;
      if (entry.status.healthy) {
        stats.successes++;
      }
    }

    const trend: Array<{
      date: string;
      avgSuccessRate: number;
      totalChecks: number;
      channelStats: Record<string, { successRate: number; checks: number }>;
    }> = [];

    for (const [date, data] of byDate) {
      const channelStats: Record<string, { successRate: number; checks: number }> = {};

      for (const [channel, stats] of data.channelData) {
        channelStats[channel] = {
          successRate: Math.round((stats.successes / stats.total) * 100) / 100,
          checks: stats.total,
        };
      }

      const totalSuccesses = Array.from(data.channelData.values()).reduce(
        (sum, s) => sum + s.successes,
        0
      );
      const totalChecks = Array.from(data.channelData.values()).reduce(
        (sum, s) => sum + s.total,
        0
      );

      trend.push({
        date,
        avgSuccessRate:
          totalChecks > 0 ? Math.round((totalSuccesses / totalChecks) * 100) / 100 : 0,
        totalChecks,
        channelStats,
      });
    }

    return trend.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * 处理 HTTP 请求
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST') {
      const body = (await request.json()) as { action: string; data?: unknown };

      switch (body.action) {
        case 'record':
          await this.recordHealthCheck(body.data as HealthStatus);
          return new Response(JSON.stringify({ success: true }), { status: 200 });

        case 'updateAlertConfig':
          await this.updateAlertConfig(body.data as Partial<AlertConfig>);
          return new Response(JSON.stringify({ success: true }), { status: 200 });

        default:
          return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400 });
      }
    }

    if (request.method === 'GET') {
      const channel = url.searchParams.get('channel');
      const limit = parseInt(url.searchParams.get('limit') || '100');
      const action = url.searchParams.get('action');

      switch (action) {
        case 'status':
          if (channel) {
            const status = await this.getHealthStatus(channel);
            return new Response(JSON.stringify(status));
          }
          return new Response(JSON.stringify(await this.getAllHealthStatus()));

        case 'history':
          return new Response(
            JSON.stringify(await this.getHealthHistory(channel || undefined, limit))
          );

        case 'summary':
          return new Response(JSON.stringify(await this.getHealthSummary()));

        case 'trend': {
          const days = parseInt(url.searchParams.get('days') || '30');
          return new Response(JSON.stringify(await this.getHealthTrend(days)));
        }

        case 'alertConfig':
          return new Response(JSON.stringify(await this.getAlertConfig()));

        default:
          return new Response(JSON.stringify(await this.getAllHealthStatus()));
      }
    }

    return new Response('Method not allowed', { status: 405 });
  }
}

// ============================================
// WebSocket 管理器 Durable Object
// ============================================

export class WebSocketManagerDO {
  private state: DurableObjectState;
  private clients: Map<string, ConnectedClient> = new Map();
  private webSocket: WebSocket | null = null;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.loadClients();
  }

  private async loadClients(): Promise<void> {
    try {
      const stored = await this.state.storage.get<Record<string, ConnectedClient>>('clients');
      if (stored) {
        this.clients = new Map(Object.entries(stored));
      }
    } catch {
      console.error('[WebSocketManager] Failed to load clients');
    }
  }

  private async saveClients(): Promise<void> {
    try {
      await this.state.storage.put('clients', Object.fromEntries(this.clients));
    } catch {
      console.error('[WebSocketManager] Failed to save clients');
    }
  }

  /**
   * 处理 WebSocket 连接
   */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected websocket', { status: 426 });
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const clientId = crypto.randomUUID();
    const pairs = new WebSocketPair();

    const client: ConnectedClient = {
      id: clientId,
      ip,
      connectedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };
    this.clients.set(clientId, client);
    await this.saveClients();

    const serverWs = pairs[1];
    serverWs.accept();
    serverWs.send(
      JSON.stringify({
        type: 'system',
        data: { message: 'Connected', clientId },
        timestamp: new Date().toISOString(),
      })
    );

    serverWs.addEventListener('message', async (event) => {
      try {
        const message = JSON.parse(event.data as string) as WebSocketMessage;
        const clientData = this.clients.get(clientId);
        if (clientData) {
          clientData.lastActivity = new Date().toISOString();

          if (
            message.type === 'system' &&
            message.data &&
            typeof message.data === 'object' &&
            'userId' in message.data
          ) {
            clientData.userId = message.data.userId as string;
            await this.saveClients();
          }
        }
      } catch {
        console.error('[WebSocketManager] Failed to handle message');
      }
    });

    serverWs.addEventListener('close', async () => {
      this.clients.delete(clientId);
      await this.saveClients();
    });

    return new Response(null, { status: 101, webSocket: serverWs });
  }

  /**
   * 获取连接统计
   */
  async getConnectionStats(): Promise<{
    totalConnections: number;
    connectionsByUser: Record<string, number>;
    oldestConnection: string | null;
  }> {
    const connectionsByUser: Record<string, number> = {};
    let oldestConnection: string | null = null;

    for (const client of this.clients.values()) {
      if (client.userId) {
        connectionsByUser[client.userId] = (connectionsByUser[client.userId] || 0) + 1;
      }
      if (!oldestConnection || client.connectedAt < oldestConnection) {
        oldestConnection = client.connectedAt;
      }
    }

    return {
      totalConnections: this.clients.size,
      connectionsByUser,
      oldestConnection,
    };
  }
}

// ============================================
// 分布式锁 Durable Object
// ============================================

export class DistributedLockDO {
  private state: DurableObjectState;
  private defaultTTL = 30000;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  /**
   * 获取锁
   */
  async acquire(
    ownerId: string,
    ttl = this.defaultTTL
  ): Promise<{ acquired: boolean; lockInfo?: LockInfo }> {
    const existing = await this.state.storage.get<LockInfo>('lock');
    const now = new Date();

    if (!existing || !existing.expiresAt || new Date(existing.expiresAt) < now) {
      const lockInfo: LockInfo = {
        locked: true,
        lockedBy: ownerId,
        lockedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + ttl).toISOString(),
      };
      await this.state.storage.put('lock', lockInfo);
      return { acquired: true, lockInfo };
    }

    return { acquired: false, lockInfo: existing };
  }

  /**
   * 释放锁
   */
  async release(ownerId: string): Promise<boolean> {
    const existing = await this.state.storage.get<LockInfo>('lock');
    if (existing && existing.lockedBy === ownerId) {
      await this.state.storage.delete('lock');
      return true;
    }
    return false;
  }

  /**
   * 续期锁
   */
  async renew(ownerId: string, ttl = this.defaultTTL): Promise<boolean> {
    const existing = await this.state.storage.get<LockInfo>('lock');
    if (existing && existing.lockedBy === ownerId) {
      existing.expiresAt = new Date(Date.now() + ttl).toISOString();
      await this.state.storage.put('lock', existing);
      return true;
    }
    return false;
  }

  /**
   * 获取锁状态
   */
  async getStatus(): Promise<LockInfo> {
    const existing = await this.state.storage.get<LockInfo>('lock');
    const now = new Date();

    if (!existing || !existing.expiresAt || new Date(existing.expiresAt) < now) {
      return { locked: false };
    }
    return existing;
  }

  /**
   * 处理 HTTP 请求
   */
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'POST') {
      const body = (await request.json()) as { action: string; ownerId?: string; ttl?: number };

      switch (body.action) {
        case 'acquire': {
          const result = await this.acquire(body.ownerId || 'unknown', body.ttl || this.defaultTTL);
          return new Response(JSON.stringify(result));
        }
        case 'release': {
          if (!body.ownerId) {
            return new Response(JSON.stringify({ error: 'ownerId required' }), { status: 400 });
          }
          const result = await this.release(body.ownerId);
          return new Response(JSON.stringify({ released: result }));
        }
        case 'renew': {
          if (!body.ownerId) {
            return new Response(JSON.stringify({ error: 'ownerId required' }), { status: 400 });
          }
          const result = await this.renew(body.ownerId, body.ttl || this.defaultTTL);
          return new Response(JSON.stringify({ renewed: result }));
        }
        default:
          return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400 });
      }
    }

    if (request.method === 'GET') {
      const status = await this.getStatus();
      return new Response(JSON.stringify(status));
    }

    return new Response('Method not allowed', { status: 405 });
  }
}
