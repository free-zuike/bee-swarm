// ============================================
// 推送统计深度分析服务
// 提供趋势、漏斗、转化分析
// ============================================

import type { Env } from '../types';

/**
 * 时间粒度
 */
export type TimeGranularity = 'hour' | 'day' | 'week' | 'month';

/**
 * 推送趋势数据点
 */
export interface TrendDataPoint {
  timestamp: string;
  total: number;
  success: number;
  failure: number;
  avgLatency: number;
}

/**
 * 漏斗阶段
 */
export interface FunnelStage {
  name: string;
  count: number;
  percentage: number;
  description: string;
}

/**
 * 渠道统计
 */
export interface ChannelStats {
  channelId: string;
  channelName: string;
  totalSends: number;
  successRate: number;
  avgLatency: number;
  lastActive: string;
  errorsByType: Record<string, number>;
}

/**
 * 模板统计
 */
export interface TemplateStats {
  templateId: string;
  templateName: string;
  usageCount: number;
  successRate: number;
  avgLatency: number;
  lastUsed: string;
}

/**
 * 时间趋势分析结果
 */
export interface TrendAnalysis {
  periodStart: string;
  periodEnd: string;
  granularity: TimeGranularity;
  dataPoints: TrendDataPoint[];
  totalOverall: number;
  successRateOverall: number;
  trendDirection: 'increasing' | 'decreasing' | 'stable';
  peakTime: string;
  lowTime: string;
  recommendations: string[];
}

/**
 * 漏斗分析结果
 */
export interface FunnelAnalysis {
  stages: FunnelStage[];
  dropOffPoint?: {
    stage: string;
    dropOffPercentage: number;
    recommendation: string;
  };
  overallCompletionRate: number;
  totalAtStart: number;
  totalAtEnd: number;
}

/**
 * 性能分析结果
 */
export interface PerformanceAnalysis {
  avgLatency: number;
  p50Latency: number;
  p90Latency: number;
  p99Latency: number;
  slowestChannels: ChannelStats[];
  fastestChannels: ChannelStats[];
  latencyTrend: string;
  recommendations: string[];
}

/**
 * 完整分析报告
 */
export interface AnalyticsReport {
  generatedAt: string;
  period: {
    start: string;
    end: string;
  };
  summary: {
    totalPushes: number;
    successRate: number;
    avgLatency: number;
    topChannels: ChannelStats[];
    topTemplates: TemplateStats[];
  };
  trendAnalysis: TrendAnalysis;
  funnelAnalysis: FunnelAnalysis;
  performanceAnalysis: PerformanceAnalysis;
  insights: string[];
  recommendations: string[];
}

/**
 * 推送分析服务类
 */
export class PushAnalyticsService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * 生成完整分析报告
   */
  async generateReport(
    userId: string,
    startDate?: string,
    endDate?: string
  ): Promise<AnalyticsReport> {
    const end = endDate || new Date().toISOString();
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      summary,
      trendAnalysis,
      funnelAnalysis,
      performanceAnalysis,
    ] = await Promise.all([
      this.getSummaryStats(userId, start, end),
      this.getTrendAnalysis(userId, start, end, 'day'),
      this.getFunnelAnalysis(userId, start, end),
      this.getPerformanceAnalysis(userId, start, end),
    ]);

    const insights = this.generateInsights(summary, trendAnalysis, funnelAnalysis, performanceAnalysis);
    const recommendations = this.generateRecommendations(summary, trendAnalysis, performanceAnalysis);

    return {
      generatedAt: new Date().toISOString(),
      period: { start, end },
      summary,
      trendAnalysis,
      funnelAnalysis,
      performanceAnalysis,
      insights,
      recommendations,
    };
  }

  /**
   * 获取摘要统计
   */
  async getSummaryStats(userId: string, start: string, end: string): Promise<AnalyticsReport['summary']> {
    try {
      // 获取总推送
      // const totalResult = await this.env.DB!.prepare(...).bind(userId, start, end).first<any>();

      // 获取成功/失败
      // const statusResult = await this.env.DB!.prepare(...).bind(userId, start, end).all<any>();

      // 获取 top 渠道
      // const channelsResult = await this.env.DB!.prepare(...).bind(userId, start, end).all<any>();

      // 获取 top 模板
      // const templatesResult = await this.env.DB!.prepare(...).bind(userId, start, end).all<any>();

      return {
        totalPushes: 0,
        successRate: 0.95, // 模拟值
        avgLatency: 120, // 模拟值 (ms)
        topChannels: [],
        topTemplates: [],
      };
    } catch (error) {
      console.error('Failed to get summary:', error);
      return {
        totalPushes: 0,
        successRate: 0,
        avgLatency: 0,
        topChannels: [],
        topTemplates: [],
      };
    }
  }

  /**
   * 趋势分析
   */
  async getTrendAnalysis(
    userId: string,
    start: string,
    end: string,
    granularity: TimeGranularity = 'day'
  ): Promise<TrendAnalysis> {
    try {
      const dataPoints: TrendDataPoint[] = [];

      // 生成模拟的趋势数据
      const startDate = new Date(start);
      const endDate = new Date(end);
      const currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        dataPoints.push({
          timestamp: currentDate.toISOString(),
          total: Math.floor(Math.random() * 100),
          success: Math.floor(Math.random() * 95),
          failure: Math.floor(Math.random() * 10),
          avgLatency: 100 + Math.random() * 100,
        });

        if (granularity === 'hour') {
          currentDate.setHours(currentDate.getHours() + 1);
        } else if (granularity === 'day') {
          currentDate.setDate(currentDate.getDate() + 1);
        } else if (granularity === 'week') {
          currentDate.setDate(currentDate.getDate() + 7);
        } else {
          currentDate.setMonth(currentDate.getMonth() + 1);
        }
      }

      const totalOverall = dataPoints.reduce((sum, dp) => sum + dp.total, 0);
      const totalSuccess = dataPoints.reduce((sum, dp) => sum + dp.success, 0);
      const successRateOverall = totalOverall > 0 ? totalSuccess / totalOverall : 0;

      // 计算趋势方向
      const firstHalf = dataPoints.slice(0, Math.floor(dataPoints.length / 2));
      const secondHalf = dataPoints.slice(Math.floor(dataPoints.length / 2));
      const firstAvg = firstHalf.reduce((sum, dp) => sum + dp.total, 0) / firstHalf.length || 0;
      const secondAvg = secondHalf.reduce((sum, dp) => sum + dp.total, 0) / secondHalf.length || 0;
      const trendDirection = Math.abs(secondAvg - firstAvg) < firstAvg * 0.1
        ? 'stable'
        : secondAvg > firstAvg
        ? 'increasing'
        : 'decreasing';

      // 找出峰值和低谷
      const peakPoint = dataPoints.reduce((peak, dp) => dp.total > peak.total ? dp : peak, dataPoints[0]);
      const lowPoint = dataPoints.reduce((low, dp) => dp.total < low.total ? dp : low, dataPoints[0]);

      const recommendations: string[] = [];
      if (trendDirection === 'decreasing') {
        recommendations.push('推送量呈下降趋势，建议检查渠道可用性');
      }
      if (successRateOverall < 0.9) {
        recommendations.push('成功率低于90%，建议排查失败原因');
      }

      return {
        periodStart: start,
        periodEnd: end,
        granularity,
        dataPoints,
        totalOverall,
        successRateOverall,
        trendDirection,
        peakTime: peakPoint?.timestamp || '',
        lowTime: lowPoint?.timestamp || '',
        recommendations,
      };
    } catch (error) {
      console.error('Failed to analyze trend:', error);
      return {
        periodStart: start,
        periodEnd: end,
        granularity,
        dataPoints: [],
        totalOverall: 0,
        successRateOverall: 0,
        trendDirection: 'stable',
        peakTime: '',
        lowTime: '',
        recommendations: ['分析失败'],
      };
    }
  }

  /**
   * 漏斗分析
   */
  async getFunnelAnalysis(userId: string, start: string, end: string): Promise<FunnelAnalysis> {
    // 模拟漏斗分析
    const stages: FunnelStage[] = [
      { name: '任务创建', count: 1000, percentage: 100, description: '推送任务成功创建' },
      { name: '发送队列', count: 980, percentage: 98, description: '进入发送队列' },
      { name: '请求发送', count: 950, percentage: 95, description: '发送至渠道' },
      { name: '渠道接收', count: 920, percentage: 92, description: '渠道响应接收' },
      { name: '送达完成', count: 880, percentage: 88, description: '成功送达用户' },
    ];

    let dropOffPoint: FunnelAnalysis['dropOffPoint'];
    for (let i = 1; i < stages.length; i++) {
      const drop = stages[i - 1].percentage - stages[i].percentage;
      if (drop > 5) {
        dropOffPoint = {
          stage: stages[i].name,
          dropOffPercentage: drop,
          recommendation: `在 ${stages[i].name} 阶段有 ${drop.toFixed(1)}% 的下降，建议检查`,
        };
        break;
      }
    }

    return {
      stages,
      dropOffPoint,
      overallCompletionRate: 0.88,
      totalAtStart: stages[0].count,
      totalAtEnd: stages[stages.length - 1].count,
    };
  }

  /**
   * 性能分析
   */
  async getPerformanceAnalysis(userId: string, start: string, end: string): Promise<PerformanceAnalysis> {
    // 模拟性能分析
    return {
      avgLatency: 120,
      p50Latency: 100,
      p90Latency: 200,
      p99Latency: 500,
      slowestChannels: [],
      fastestChannels: [],
      latencyTrend: 'stable',
      recommendations: [
        '整体响应良好',
        '考虑优化长尾延迟',
      ],
    };
  }

  /**
   * 生成洞察
   */
  private generateInsights(
    summary: AnalyticsReport['summary'],
    trend: TrendAnalysis,
    funnel: FunnelAnalysis,
    performance: PerformanceAnalysis
  ): string[] {
    const insights: string[] = [];

    if (summary.successRate > 0.95) {
      insights.push('推送成功率表现优秀！');
    } else if (summary.successRate < 0.9) {
      insights.push('成功率有待提升，建议检查失败较多的渠道');
    }

    if (trend.trendDirection === 'increasing') {
      insights.push('推送量呈上升趋势，业务增长良好');
    }

    if (funnel.dropOffPoint) {
      insights.push(`在 ${funnel.dropOffPoint.stage} 发现明显下降，值得关注`);
    }

    if (performance.p99Latency > 400) {
      insights.push('长尾延迟较高，部分用户体验可能受影响');
    }

    return insights;
  }

  /**
   * 生成建议
   */
  private generateRecommendations(
    summary: AnalyticsReport['summary'],
    trend: TrendAnalysis,
    performance: PerformanceAnalysis
  ): string[] {
    const recommendations: string[] = [
      ...trend.recommendations,
      ...performance.recommendations,
    ];

    if (summary.topChannels.length > 0) {
      recommendations.push(`您最常用的渠道是 ${summary.topChannels[0]?.channelName}，考虑优先保证其可用性`);
    }

    return recommendations;
  }

  /**
   * 实时分析（最后 7 天）
   */
  async getQuickStats(userId: string): Promise<{
    last7Days: number;
    successRate: number;
    avgLatency: number;
    topChannel?: ChannelStats;
  }> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const summary = await this.getSummaryStats(userId, sevenDaysAgo, new Date().toISOString());

    return {
      last7Days: summary.totalPushes,
      successRate: summary.successRate,
      avgLatency: summary.avgLatency,
      topChannel: summary.topChannels[0],
    };
  }

  /**
   * 对比分析
   */
  async comparePeriods(
    userId: string,
    period1Start: string,
    period1End: string,
    period2Start: string,
    period2End: string
  ): Promise<{
    period1: AnalyticsReport['summary'];
    period2: AnalyticsReport['summary'];
    changes: {
      pushesChange: number;
      successRateChange: number;
      latencyChange: number;
    };
  }> {
    const [period1, period2] = await Promise.all([
      this.getSummaryStats(userId, period1Start, period1End),
      this.getSummaryStats(userId, period2Start, period2End),
    ]);

    const pushesChange = period2.totalPushes - period1.totalPushes;
    const successRateChange = period2.successRate - period1.successRate;
    const latencyChange = period2.avgLatency - period1.avgLatency;

    return {
      period1,
      period2,
      changes: {
        pushesChange,
        successRateChange,
        latencyChange,
      },
    };
  }

  /**
   * 按渠道分析
   */
  async analyzeByChannel(userId: string, start: string, end: string): Promise<ChannelStats[]> {
    try {
      // const result = await this.env.DB!.prepare(...).bind(userId, start, end).all<any>();
      return [];
    } catch (error) {
      console.error('Failed to analyze by channel:', error);
      return [];
    }
  }

  /**
   * 按模板分析
   */
  async analyzeByTemplate(userId: string, start: string, end: string): Promise<TemplateStats[]> {
    try {
      // const result = await this.env.DB!.prepare(...).bind(userId, start, end).all<any>();
      return [];
    } catch (error) {
      console.error('Failed to analyze by template:', error);
      return [];
    }
  }
}
