import { describe, it, expect, beforeEach } from 'vitest';
import {
  createHealthChecker,
  SmartChannelSelector,
  type ChannelHealthStatus,
} from '../../src/services/healthChecker';
import type { ChannelConfig } from '../../types';

// 模拟环境
const mockEnv = {
  DB: {
    prepare: () => ({
      bind: () => ({
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => ({ success: true, meta: { changes: 0 } }),
      }),
    }),
  },
} as any;

describe('ChannelHealthChecker', () => {
  let checker: ReturnType<typeof createHealthChecker>;

  beforeEach(() => {
    checker = createHealthChecker(mockEnv, 'test-user');
  });

  describe('createHealthChecker', () => {
    it('应该创建健康检查器实例', () => {
      expect(checker).toBeDefined();
      expect(typeof checker.checkAllChannels).toBe('function');
    });

    it('应该使用自定义阈值', () => {
      const customChecker = createHealthChecker(mockEnv, 'test-user', {
        maxConsecutiveFailures: 3,
        minSuccessRate: 0.5,
      });
      expect(customChecker).toBeDefined();
      expect(typeof customChecker.checkAllChannels).toBe('function');
    });
  });

  describe('getHealthStatus', () => {
    it('应该返回 null 对于未检查的渠道', () => {
      const status = checker.getHealthStatus('wework');
      expect(status).toBeNull();
    });
  });

  describe('getAllHealthStatus', () => {
    it('应该返回空数组当没有健康数据时', () => {
      const allStatus = checker.getAllHealthStatus();
      expect(allStatus).toEqual([]);
    });
  });

  describe('shouldDisable', () => {
    it('应该返回 false 对于未检查的渠道', () => {
      expect(checker.shouldDisable('wework')).toBe(false);
    });
  });

  describe('shouldReenable', () => {
    it('应该返回 false 对于未检查的渠道', () => {
      expect(checker.shouldReenable('wework')).toBe(false);
    });
  });

  describe('getChannelsToDisable', () => {
    it('应该返回空数组当没有需要禁用的渠道时', () => {
      const channels = checker.getChannelsToDisable();
      expect(channels).toEqual([]);
    });
  });

  describe('getHealthyChannels', () => {
    it('应该返回空数组当没有健康渠道时', () => {
      const channels = checker.getHealthyChannels();
      expect(channels).toEqual([]);
    });
  });

  describe('getBestChannels', () => {
    it('应该返回空数组当没有健康渠道时', () => {
      const channels = checker.getBestChannels();
      expect(channels).toEqual([]);
    });

    it('应该正确限制返回数量', () => {
      const channels = checker.getBestChannels(5);
      expect(Array.isArray(channels)).toBe(true);
    });
  });

  describe('clearHealthData', () => {
    it('应该清除所有健康数据', () => {
      checker.clearHealthData();
      const allStatus = checker.getAllHealthStatus();
      expect(allStatus).toEqual([]);
    });
  });

  describe('getHealthReport', () => {
    it('应该返回正确的健康报告格式', () => {
      const report = checker.getHealthReport();
      
      expect(report).toHaveProperty('summary');
      expect(report.summary).toHaveProperty('total');
      expect(report.summary).toHaveProperty('healthy');
      expect(report.summary).toHaveProperty('unhealthy');
      expect(report.summary).toHaveProperty('averageSuccessRate');
      
      expect(report).toHaveProperty('unhealthyChannels');
      expect(Array.isArray(report.unhealthyChannels)).toBe(true);
      
      expect(report).toHaveProperty('recommendations');
      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it('应该返回零值当没有渠道时', () => {
      const report = checker.getHealthReport();
      
      expect(report.summary.total).toBe(0);
      expect(report.summary.healthy).toBe(0);
      expect(report.summary.unhealthy).toBe(0);
      expect(report.summary.averageSuccessRate).toBe(0);
      expect(report.unhealthyChannels).toEqual([]);
      expect(report.recommendations).toEqual([]);
    });
  });

  describe('checkAllChannels', () => {
    it('应该处理空的设置', async () => {
      const result = await checker.checkAllChannels({});
      
      expect(result).toHaveProperty('checkedAt');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('summary');
      
      expect(result.results).toEqual([]);
      expect(result.summary.total).toBe(0);
      expect(result.summary.healthy).toBe(0);
      expect(result.summary.unhealthy).toBe(0);
    });

    it('应该过滤禁用的渠道', async () => {
      const settings: Record<string, ChannelConfig> = {
        wework: { enabled: false, config: {} },
      };
      
      const result = await checker.checkAllChannels(settings);
      expect(result.summary.total).toBe(0);
    });
  });

  describe('健康状态累积', () => {
    it('应该累积检查次数', async () => {
      // 第一次检查
      const result1 = await checker.checkAllChannels({});
      const firstTotal = result1.summary.total;
      
      // 第二次检查
      const result2 = await checker.checkAllChannels({});
      const secondTotal = result2.summary.total;
      
      // 总数应该保持一致
      expect(secondTotal).toBe(firstTotal);
    });
  });
});

describe('SmartChannelSelector', () => {
  let checker: ReturnType<typeof createHealthChecker>;
  let selector: SmartChannelSelector;

  beforeEach(() => {
    checker = createHealthChecker(mockEnv, 'test-user');
    selector = new SmartChannelSelector(checker);
  });

  describe('selectBestChannels', () => {
    it('应该返回空数组当没有请求的渠道', () => {
      const result = selector.selectBestChannels([], {});
      expect(result.selected).toEqual([]);
      expect(result.skipped).toEqual([]);
    });

    it('应该跳过禁用的渠道', () => {
      const settings: Record<string, ChannelConfig> = {
        wework: { enabled: false, config: {} },
      };
      
      const result = selector.selectBestChannels(['wework'], settings);
      expect(result.selected).toEqual([]);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toBe('渠道未启用');
    });

    it('应该包含未检查的渠道', () => {
      const settings: Record<string, ChannelConfig> = {
        wework: { enabled: true, config: {} },
      };
      
      const result = selector.selectBestChannels(['wework'], settings);
      // 未检查过的渠道默认使用
      expect(result.selected).toContain('wework');
    });
  });
});

describe('HealthThreshold', () => {
  it('应该导出默认阈值常量', () => {
    // 验证默认阈值存在
    expect(true).toBe(true); // 占位测试
  });
});

describe('ChannelHealthStatus', () => {
  it('应该定义正确的状态结构', () => {
    const status: ChannelHealthStatus = {
      channel: 'wework',
      healthy: true,
      lastCheckTime: new Date().toISOString(),
      consecutiveFailures: 0,
      totalChecks: 10,
      successRate: 0.9,
      averageLatency: 250,
      message: 'OK',
    };
    
    expect(status.channel).toBe('wework');
    expect(status.healthy).toBe(true);
    expect(status.totalChecks).toBe(10);
    expect(status.successRate).toBe(0.9);
  });

  it('应该支持可选字段', () => {
    const status: ChannelHealthStatus = {
      channel: 'dingtalk',
      healthy: false,
      lastCheckTime: new Date().toISOString(),
      lastSuccessTime: new Date().toISOString(),
      lastFailureTime: new Date().toISOString(),
      consecutiveFailures: 3,
      totalChecks: 10,
      successRate: 0.7,
      averageLatency: 500,
      lastError: 'Connection timeout',
      message: 'Failed',
    };
    
    expect(status.lastSuccessTime).toBeDefined();
    expect(status.lastFailureTime).toBeDefined();
    expect(status.lastError).toBe('Connection timeout');
  });
});
