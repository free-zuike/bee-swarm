// ============================================
// 渠道熔断与健康管理服务
// 提供渠道故障检测、自动熔断和恢复功能
// ============================================

import type { Env } from '../types';

/**
 * 熔断状态
 */
export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

/**
 * 渠道健康状态
 */
export interface ChannelHealth {
  channel_id: string;
  user_id: string;
  state: CircuitBreakerState;
  failure_count: number;
  success_count: number;
  last_failure_time: string | null;
  last_success_time: string | null;
  failure_threshold: number;
  recovery_timeout_ms: number;
  half_open_attempts: number;
}

/**
 * 渠道熔断服务类
 */
export class CircuitBreakerService {
  private env: Env;
  private default_failure_threshold = 5;
  private default_recovery_timeout = 300000; // 5 分钟

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * 记录渠道请求成功
   */
  async recordSuccess(
    channel_id: string,
    user_id: string
  ): Promise<void> {
    try {
      const now = new Date().toISOString();
      
      // 先获取当前状态
      const health = await this.getChannelHealth(channel_id, user_id);
      
      if (!health) {
        // 创建新记录
        await this.env.DB!.prepare(
          `INSERT INTO channel_health (
            channel_id, user_id, state, failure_count, success_count, 
            last_success_time, failure_threshold, recovery_timeout_ms, half_open_attempts
          ) VALUES (?, ?, 'closed', 0, 1, ?, ?, ?, 0)`
        )
          .bind(
            channel_id,
            user_id,
            now,
            this.default_failure_threshold,
            this.default_recovery_timeout
          )
          .run();
        return;
      }

      if (health.state === 'half-open') {
        // 半开状态下成功，关闭断路器
        await this.env.DB!.prepare(
          `UPDATE channel_health 
           SET state = 'closed', failure_count = 0, success_count = success_count + 1, last_success_time = ?, half_open_attempts = 0
           WHERE channel_id = ? AND user_id = ?`
        )
          .bind(now, channel_id, user_id)
          .run();
      } else if (health.state === 'open') {
        // 打开状态下不应该有请求，重置为半开
        await this.env.DB!.prepare(
          `UPDATE channel_health 
           SET state = 'half-open', success_count = success_count + 1, last_success_time = ?, half_open_attempts = 1
           WHERE channel_id = ? AND user_id = ?`
        )
          .bind(now, channel_id, user_id)
          .run();
      } else {
        // 关闭状态，增加成功计数，重置失败计数
        await this.env.DB!.prepare(
          `UPDATE channel_health 
           SET failure_count = 0, success_count = success_count + 1, last_success_time = ?
           WHERE channel_id = ? AND user_id = ?`
        )
          .bind(now, channel_id, user_id)
          .run();
      }
    } catch (error) {
      console.error('Failed to record success:', error);
    }
  }

  /**
   * 记录渠道请求失败
   */
  async recordFailure(
    channel_id: string,
    user_id: string
  ): Promise<void> {
    try {
      const now = new Date().toISOString();
      
      // 获取当前状态
      const health = await this.getChannelHealth(channel_id, user_id);
      
      if (!health) {
        // 创建新记录
        await this.env.DB!.prepare(
          `INSERT INTO channel_health (
            channel_id, user_id, state, failure_count, success_count, 
            last_failure_time, failure_threshold, recovery_timeout_ms, half_open_attempts
          ) VALUES (?, ?, 'closed', 1, 0, ?, ?, ?, 0)`
        )
          .bind(
            channel_id,
            user_id,
            now,
            this.default_failure_threshold,
            this.default_recovery_timeout
          )
          .run();
        return;
      }

      const new_failure_count = health.failure_count + 1;
      
      if (health.state === 'closed') {
        // 检查是否超过阈值
        if (new_failure_count >= health.failure_threshold) {
          // 打开断路器
          await this.env.DB!.prepare(
            `UPDATE channel_health 
             SET state = 'open', failure_count = ?, last_failure_time = ?
             WHERE channel_id = ? AND user_id = ?`
          )
            .bind(new_failure_count, now, channel_id, user_id)
            .run();
        } else {
          // 增加失败计数
          await this.env.DB!.prepare(
            `UPDATE channel_health 
             SET failure_count = ?, last_failure_time = ?
             WHERE channel_id = ? AND user_id = ?`
          )
            .bind(new_failure_count, now, channel_id, user_id)
            .run();
        }
      } else if (health.state === 'half-open') {
        // 半开状态下失败，重新打开断路器
        await this.env.DB!.prepare(
          `UPDATE channel_health 
           SET state = 'open', failure_count = failure_count + 1, last_failure_time = ?
           WHERE channel_id = ? AND user_id = ?`
        )
          .bind(now, channel_id, user_id)
          .run();
      }
    } catch (error) {
      console.error('Failed to record failure:', error);
    }
  }

  /**
   * 检查渠道是否允许请求
   */
  async allowRequest(
    channel_id: string,
    user_id: string
  ): Promise<{ allowed: boolean; reason?: string; state?: CircuitBreakerState }> {
    try {
      const health = await this.getChannelHealth(channel_id, user_id);
      
      if (!health || health.state === 'closed') {
        return { allowed: true };
      }

      if (health.state === 'open') {
        // 检查是否应该进入半开状态
        if (health.last_failure_time) {
          const recovery_timeout = health.recovery_timeout_ms || this.default_recovery_timeout;
          const last_failure = new Date(health.last_failure_time).getTime();
          const now = Date.now();
          
          if (now - last_failure >= recovery_timeout) {
            // 进入半开状态，允许一个请求
            await this.env.DB!.prepare(
              `UPDATE channel_health 
               SET state = 'half-open', half_open_attempts = 1
               WHERE channel_id = ? AND user_id = ?`
            )
              .bind(channel_id, user_id)
              .run();
            
            return { allowed: true, state: 'half-open' };
          }
        }
        
        return { allowed: false, reason: 'Circuit breaker is open', state: 'open' };
      }

      if (health.state === 'half-open') {
        // 半开状态下只允许一个请求
        if (health.half_open_attempts === 0) {
          await this.env.DB!.prepare(
            `UPDATE channel_health 
             SET half_open_attempts = 1
             WHERE channel_id = ? AND user_id = ?`
          )
            .bind(channel_id, user_id)
            .run();
          
          return { allowed: true, state: 'half-open' };
        }
        
        return { allowed: false, reason: 'Circuit breaker is in half-open state', state: 'half-open' };
      }

      return { allowed: true };
    } catch (error) {
      console.error('Failed to check if request is allowed:', error);
      // 出错时默认允许请求
      return { allowed: true };
    }
  }

  /**
   * 获取渠道健康状态
   */
  async getChannelHealth(
    channel_id: string,
    user_id: string
  ): Promise<ChannelHealth | null> {
    try {
      const result = await this.env.DB!.prepare(
        'SELECT * FROM channel_health WHERE channel_id = ? AND user_id = ?'
      )
        .bind(channel_id, user_id)
        .first<ChannelHealth>();

      return result;
    } catch (error) {
      console.error('Failed to get channel health:', error);
      return null;
    }
  }

  /**
   * 获取用户所有渠道健康状态
   */
  async getUserChannelsHealth(
    user_id: string
  ): Promise<ChannelHealth[]> {
    try {
      const result = await this.env.DB!.prepare(
        'SELECT * FROM channel_health WHERE user_id = ?'
      )
        .bind(user_id)
        .all<ChannelHealth>();

      return result.results || [];
    } catch (error) {
      console.error('Failed to get user channels health:', error);
      return [];
    }
  }

  /**
   * 重置渠道断路器状态
   */
  async resetCircuitBreaker(
    channel_id: string,
    user_id: string
  ): Promise<void> {
    try {
      const now = new Date().toISOString();
      
      await this.env.DB!.prepare(
        `UPDATE channel_health 
         SET state = 'closed', failure_count = 0, success_count = 0, half_open_attempts = 0, 
             last_success_time = ?, last_failure_time = NULL
         WHERE channel_id = ? AND user_id = ?`
      )
        .bind(now, channel_id, user_id)
        .run();
    } catch (error) {
      console.error('Failed to reset circuit breaker:', error);
    }
  }

  /**
   * 更新渠道熔断配置
   */
  async updateConfig(
    channel_id: string,
    user_id: string,
    config: {
      failure_threshold?: number;
      recovery_timeout_ms?: number;
    }
  ): Promise<void> {
    try {
      const updates: string[] = [];
      const binds: any[] = [];

      if (config.failure_threshold) {
        updates.push('failure_threshold = ?');
        binds.push(config.failure_threshold);
      }

      if (config.recovery_timeout_ms) {
        updates.push('recovery_timeout_ms = ?');
        binds.push(config.recovery_timeout_ms);
      }

      if (updates.length === 0) return;

      binds.push(channel_id);
      binds.push(user_id);

      await this.env.DB!.prepare(
        `UPDATE channel_health SET ${updates.join(', ')} WHERE channel_id = ? AND user_id = ?`
      )
        .bind(...binds)
        .run();
    } catch (error) {
      console.error('Failed to update circuit breaker config:', error);
    }
  }

  /**
   * 获取用户所有故障渠道
   */
  async getFailingChannels(
    user_id: string
  ): Promise<{ channel_id: string; state: CircuitBreakerState; last_failure_time: string | null }[]> {
    try {
      const result = await this.env.DB!.prepare(
        'SELECT channel_id, state, last_failure_time FROM channel_health WHERE user_id = ? AND state != ?'
      )
        .bind(user_id, 'closed')
        .all<{ channel_id: string; state: CircuitBreakerState; last_failure_time: string | null }>();

      return result.results || [];
    } catch (error) {
      console.error('Failed to get failing channels:', error);
      return [];
    }
  }

  /**
   * 清理过期的健康记录
   */
  async cleanOldRecords(
    user_id: string,
    older_than_days = 30
  ): Promise<number> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - older_than_days);
      
      const result = await this.env.DB!.prepare(
        `DELETE FROM channel_health 
         WHERE user_id = ? 
         AND state = 'closed' 
         AND (last_success_time IS NULL OR last_success_time < ?) 
         AND (last_failure_time IS NULL OR last_failure_time < ?)`
      )
        .bind(user_id, cutoff.toISOString(), cutoff.toISOString())
        .run();

      return result.meta?.changes || 0;
    } catch (error) {
      console.error('Failed to clean old records:', error);
      return 0;
    }
  }

  /**
   * 获取健康统计
   */
  async getHealthStats(
    user_id: string
  ): Promise<{
    total: number;
    healthy: number;
    failing: number;
    recovering: number;
  }> {
    try {
      const health_records = await this.getUserChannelsHealth(user_id);
      
      let healthy = 0;
      let failing = 0;
      let recovering = 0;

      for (const record of health_records) {
        if (record.state === 'closed') healthy++;
        else if (record.state === 'open') failing++;
        else if (record.state === 'half-open') recovering++;
      }

      return {
        total: health_records.length,
        healthy,
        failing,
        recovering,
      };
    } catch (error) {
      console.error('Failed to get health stats:', error);
      return { total: 0, healthy: 0, failing: 0, recovering: 0 };
    }
  }
}
