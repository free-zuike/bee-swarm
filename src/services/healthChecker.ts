// ============================================
// 渠道健康检查服务
// ============================================

import type { Env, PushChannel, ChannelConfig } from '../types';
import { BaseChannel, type ChannelPayload } from './channels/base';
import { WeworkChannel } from './channels/wework';
import { DingtalkChannel } from './channels/dingtalk';
import { FeishuChannel } from './channels/feishu';
import { DiscordChannel } from './channels/discord';
import { SlackChannel } from './channels/slack';
import { TeamsChannel } from './channels/teams';
import { TelegramChannel } from './channels/telegram';
import { BarkChannel } from './channels/bark';
import { ServerchanChannel } from './channels/serverchan';
import { PushplusChannel } from './channels/pushplus';
import { NtfyChannel } from './channels/ntfy';
import { GotifyChannel } from './channels/gotify';
import { LineNotifyChannel } from './channels/line';
import { EmailChannel } from './channels/email';
import { WebhookChannel } from './channels/webhook';
import { PushoverChannel } from './channels/pushover';

export interface ChannelHealthStatus {
  channel: PushChannel;
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

export interface HealthCheckResult {
  checkedAt: string;
  duration: number;
  results: ChannelHealthStatus[];
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    averageSuccessRate: number;
  };
}

export interface HealthThreshold {
  maxConsecutiveFailures: number;
  minSuccessRate: number;
  maxLatency: number;
  checkIntervalMinutes: number;
}

const DEFAULT_THRESHOLDS: HealthThreshold = {
  maxConsecutiveFailures: 5,
  minSuccessRate: 0.7,
  maxLatency: 5000,
  checkIntervalMinutes: 5,
};

class ChannelHealthChecker {
  private env: Env;
  private userId: string;
  private healthData: Map<PushChannel, ChannelHealthStatus> = new Map();
  private thresholds: HealthThreshold;
  private testPayload: ChannelPayload = {
    title: '🔔 Health Check',
    body: 'This is a test message from health checker.',
  };

  constructor(env: Env, userId: string, thresholds?: Partial<HealthThreshold>) {
    this.env = env;
    this.userId = userId;
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * 创建渠道实例
   */
  private createChannelInstance(
    channel: PushChannel,
    config: Record<string, string>
  ): BaseChannel | null {
    try {
      switch (channel) {
        case 'wework':
          return new WeworkChannel('wework', config, { timeout: 10000, retries: 1 });
        case 'dingtalk':
          return new DingtalkChannel('dingtalk', config, { timeout: 10000, retries: 1 });
        case 'feishu':
          return new FeishuChannel('feishu', config, { timeout: 10000, retries: 1 });
        case 'discord':
          return new DiscordChannel('discord', config, { timeout: 10000, retries: 1 });
        case 'slack':
          return new SlackChannel('slack', config, { timeout: 10000, retries: 1 });
        case 'teams':
          return new TeamsChannel('teams', config, { timeout: 10000, retries: 1 });
        case 'telegram':
          return new TelegramChannel('telegram', config, { timeout: 10000, retries: 1 });
        case 'bark':
          return new BarkChannel('bark', config, { timeout: 10000, retries: 1 });
        case 'serverchan':
          return new ServerchanChannel('serverchan', config, { timeout: 10000, retries: 1 });
        case 'pushplus':
          return new PushplusChannel('pushplus', config, { timeout: 10000, retries: 1 });
        case 'ntfy':
          return new NtfyChannel('ntfy', config, { timeout: 10000, retries: 1 });
        case 'gotify':
          return new GotifyChannel('gotify', config, { timeout: 10000, retries: 1 });
        case 'line':
          return new LineNotifyChannel('line', config, { timeout: 10000, retries: 1 });
        case 'email':
          return new EmailChannel('email', config, { timeout: 10000, retries: 1 });
        case 'pushover':
          return new PushoverChannel('pushover', config, { timeout: 10000, retries: 1 });
        default:
          return null;
      }
    } catch (error) {
      console.error(`Failed to create channel instance for ${channel}:`, error);
      return null;
    }
  }

  /**
   * 检查单个渠道健康状态
   */
  async checkChannel(
    channel: PushChannel,
    config: Record<string, string>
  ): Promise<ChannelHealthStatus> {
    const startTime = Date.now();
    const existing = this.healthData.get(channel);

    const status: ChannelHealthStatus = {
      channel,
      healthy: false,
      lastCheckTime: new Date().toISOString(),
      consecutiveFailures: existing?.consecutiveFailures || 0,
      totalChecks: (existing?.totalChecks || 0) + 1,
      successRate: existing?.successRate || 1.0,
      averageLatency: existing?.averageLatency || 0,
      message: '',
    };

    try {
      const channelInstance = this.createChannelInstance(channel, config);
      if (!channelInstance) {
        status.message = '不支持的渠道类型';
        status.lastError = 'Unsupported channel type';
        return status;
      }

      const result = await channelInstance.healthCheck();
      const duration = Date.now() - startTime;

      status.healthy = result.healthy;
      status.message = result.message;
      status.averageLatency = Math.round(
        (status.averageLatency * (status.totalChecks - 1) + duration) / status.totalChecks
      );

      if (result.healthy) {
        status.lastSuccessTime = new Date().toISOString();
        status.consecutiveFailures = 0;
      } else {
        status.lastFailureTime = new Date().toISOString();
        status.consecutiveFailures++;
        status.lastError = result.message;
      }

      // 更新成功率
      const successfulChecks = Math.round(status.successRate * (status.totalChecks - 1));
      const newSuccesses = result.healthy ? 1 : 0;
      status.successRate = (successfulChecks + newSuccesses) / status.totalChecks;
    } catch (error) {
      status.lastFailureTime = new Date().toISOString();
      status.consecutiveFailures++;
      status.lastError = (error as Error).message;
      status.message = '健康检查失败';
    }

    this.healthData.set(channel, status);
    return status;
  }

  /**
   * 检查所有渠道健康状态
   */
  async checkAllChannels(settings: Record<string, any>): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const results: ChannelHealthStatus[] = [];

    const checkPromises = Object.entries(settings)
      .filter(([_, config]) => config.enabled)
      .map(async ([channel, config]) => {
        // config.config 是 Record<string, string> 类型的配置
        const channelConfig = config.config || config;
        return this.checkChannel(channel as PushChannel, channelConfig);
      });

    const allResults = await Promise.allSettled(checkPromises);

    for (const result of allResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
    }

    const duration = Date.now() - startTime;
    const healthy = results.filter((r) => r.healthy).length;
    const unhealthy = results.length - healthy;
    const avgSuccessRate =
      results.length > 0 ? results.reduce((sum, r) => sum + r.successRate, 0) / results.length : 0;

    return {
      checkedAt: new Date().toISOString(),
      duration,
      results: results.sort((a, b) => b.successRate - a.successRate),
      summary: {
        total: results.length,
        healthy,
        unhealthy,
        averageSuccessRate: Math.round(avgSuccessRate * 100) / 100,
      },
    };
  }

  /**
   * 获取健康状态
   */
  getHealthStatus(channel: PushChannel): ChannelHealthStatus | null {
    return this.healthData.get(channel) || null;
  }

  /**
   * 获取所有健康状态
   */
  getAllHealthStatus(): ChannelHealthStatus[] {
    return Array.from(this.healthData.values());
  }

  /**
   * 检查是否应该自动禁用渠道
   */
  shouldDisable(channel: PushChannel): boolean {
    const status = this.healthData.get(channel);
    if (!status) return false;

    return (
      status.consecutiveFailures >= this.thresholds.maxConsecutiveFailures ||
      status.successRate < this.thresholds.minSuccessRate
    );
  }

  /**
   * 检查是否应该重新启用渠道
   */
  shouldReenable(channel: PushChannel): boolean {
    const status = this.healthData.get(channel);
    if (!status) return false;

    // 如果之前被禁用，现在连续成功超过阈值则重新启用
    return status.consecutiveFailures === 0 && status.successRate >= this.thresholds.minSuccessRate;
  }

  /**
   * 获取需要禁用的渠道列表
   */
  getChannelsToDisable(): PushChannel[] {
    return Array.from(this.healthData.entries())
      .filter(([channel]) => this.shouldDisable(channel))
      .map(([channel]) => channel);
  }

  /**
   * 获取健康的渠道列表
   */
  getHealthyChannels(): PushChannel[] {
    return Array.from(this.healthData.entries())
      .filter(([_, status]) => status.healthy)
      .map(([channel]) => channel);
  }

  /**
   * 获取最佳渠道（按成功率排序）
   */
  getBestChannels(count: number = 3): PushChannel[] {
    return Array.from(this.healthData.values())
      .filter((status) => status.healthy)
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, count)
      .map((status) => status.channel);
  }

  /**
   * 清除健康数据
   */
  clearHealthData(): void {
    this.healthData.clear();
  }

  /**
   * 获取健康报告
   */
  getHealthReport(): {
    summary: {
      total: number;
      healthy: number;
      unhealthy: number;
      averageSuccessRate: number;
    };
    unhealthyChannels: ChannelHealthStatus[];
    recommendations: string[];
  } {
    const allStatus = this.getAllHealthStatus();
    const healthy = allStatus.filter((s) => s.healthy);
    const unhealthy = allStatus.filter((s) => !s.healthy);
    const avgSuccessRate =
      allStatus.length > 0
        ? allStatus.reduce((sum, s) => sum + s.successRate, 0) / allStatus.length
        : 0;

    const recommendations: string[] = [];

    // 生成建议
    for (const status of unhealthy) {
      if (status.consecutiveFailures >= this.thresholds.maxConsecutiveFailures) {
        recommendations.push(
          `渠道 ${status.channel} 连续失败 ${status.consecutiveFailures} 次，建议检查配置或暂时禁用`
        );
      }
      if (status.successRate < this.thresholds.minSuccessRate) {
        recommendations.push(
          `渠道 ${status.channel} 成功率 ${(status.successRate * 100).toFixed(1)}% 低于阈值，考虑更换`
        );
      }
      if (status.averageLatency > this.thresholds.maxLatency) {
        recommendations.push(
          `渠道 ${status.channel} 平均延迟 ${status.averageLatency}ms 过高，可能存在网络问题`
        );
      }
    }

    return {
      summary: {
        total: allStatus.length,
        healthy: healthy.length,
        unhealthy: unhealthy.length,
        averageSuccessRate: Math.round(avgSuccessRate * 100) / 100,
      },
      unhealthyChannels: unhealthy,
      recommendations,
    };
  }
}

export function createHealthChecker(
  env: Env,
  userId: string,
  thresholds?: Partial<HealthThreshold>
): ChannelHealthChecker {
  return new ChannelHealthChecker(env, userId, thresholds);
}

/**
 * 智能渠道选择器
 * 根据健康状态和性能选择最佳渠道
 */
export class SmartChannelSelector {
  private checker: ChannelHealthChecker;

  constructor(checker: ChannelHealthChecker) {
    this.checker = checker;
  }

  /**
   * 选择最佳渠道（考虑健康状态和性能）
   */
  selectBestChannels(
    requestedChannels: PushChannel[],
    settings: Record<string, ChannelConfig>
  ): {
    selected: PushChannel[];
    skipped: { channel: PushChannel; reason: string }[];
  } {
    const selected: PushChannel[] = [];
    const skipped: { channel: PushChannel; reason: string }[] = [];

    for (const channel of requestedChannels) {
      const config = settings[channel];
      if (!config || !config.enabled) {
        skipped.push({ channel, reason: '渠道未启用' });
        continue;
      }

      const healthStatus = this.checker.getHealthStatus(channel);

      if (!healthStatus) {
        // 未检查过的渠道，默认使用
        selected.push(channel);
        continue;
      }

      if (!healthStatus.healthy) {
        skipped.push({
          channel,
          reason: `健康检查失败: ${healthStatus.lastError || '未知错误'}`,
        });
        continue;
      }

      if (this.checker.shouldDisable(channel)) {
        skipped.push({
          channel,
          reason: `连续失败 ${healthStatus.consecutiveFailures} 次，成功率 ${(healthStatus.successRate * 100).toFixed(1)}%`,
        });
        continue;
      }

      // 检查延迟
      if (healthStatus.averageLatency > DEFAULT_THRESHOLDS.maxLatency) {
        skipped.push({
          channel,
          reason: `延迟过高: ${healthStatus.averageLatency}ms`,
        });
        continue;
      }

      selected.push(channel);
    }

    return { selected, skipped };
  }
}
