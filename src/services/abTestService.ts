// ============================================
// A/B 测试服务
// 支持多版本模板对比推送效果
// ============================================

import type { Env } from '../types';

/**
 * A/B 测试状态
 */
export type ABTestStatus = 'draft' | 'running' | 'paused' | 'completed' | 'analyzing';

/**
 * A/B 测试变体
 */
export interface ABTestVariant {
  id: string;
  name: string;
  templateId: string;
  percentage: number;
  sentCount: number;
  successCount: number;
  clickCount?: number;
  conversionRate?: number;
}

/**
 * A/B 测试数据
 */
export interface ABTest {
  id: string;
  userId: string;
  name: string;
  description?: string;
  variants: ABTestVariant[];
  channelIds: string[];
  status: ABTestStatus;
  winnerId?: string;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  targetSampleSize: number;
  significanceLevel: number;
}

/**
 * A/B 测试分析结果
 */
export interface ABTestAnalysis {
  testId: string;
  totalSent: number;
  totalSuccess: number;
  winner?: {
    variantId: string;
    confidence: number;
  };
  variants: Array<{
    variantId: string;
    name: string;
    sent: number;
    success: number;
    rate: number;
    improvement?: number;
  }>;
  recommendations: string[];
}

/**
 * A/B 测试服务类
 */
export class ABTestService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * 创建 A/B 测试
   */
  async createTest(params: {
    userId: string;
    name: string;
    description?: string;
    templateIds: string[];
    channelIds: string[];
    percentages?: number[];
    targetSampleSize?: number;
    significanceLevel?: number;
  }): Promise<ABTest | null> {
    try {
      const {
        userId,
        name,
        description,
        templateIds,
        channelIds,
        percentages,
        targetSampleSize = 1000,
        significanceLevel = 0.05,
      } = params;

      // 计算每个变体的百分比
      const variantCount = templateIds.length;
      const perVariant = percentages || Array(variantCount).fill(Math.floor(100 / variantCount));

      // 调整百分比总和为100
      const totalPercent = perVariant.reduce((sum, p) => sum + p, 0);
      if (totalPercent !== 100) {
        perVariant[0] += 100 - totalPercent;
      }

      const variants: ABTestVariant[] = templateIds.map((templateId, index) => ({
        id: crypto.randomUUID(),
        name: `变体 ${String.fromCharCode(65 + index)}`,
        templateId,
        percentage: perVariant[index],
        sentCount: 0,
        successCount: 0,
      }));

      const testId = crypto.randomUUID();
      const now = new Date().toISOString();

      const test: ABTest = {
        id: testId,
        userId,
        name,
        description,
        variants,
        channelIds,
        status: 'draft',
        createdAt: now,
        targetSampleSize,
        significanceLevel,
      };

      // 保存到数据库（模拟，实际需要创建表）
      // await this.env.DB!.prepare(`INSERT INTO ab_tests ...`).bind(...).run();

      return test;
    } catch (error) {
      console.error('Failed to create A/B test:', error);
      return null;
    }
  }

  /**
   * 启动 A/B 测试
   */
  async startTest(testId: string, userId: string): Promise<boolean> {
    try {
      // 获取测试
      // const test = await this.getTest(testId, userId);
      // if (!test || test.status !== 'draft') return false;

      // 更新状态
      // await this.env.DB!.prepare(`UPDATE ab_tests SET status = 'running', started_at = ? WHERE id = ? AND user_id = ?`).bind(...).run();

      return true;
    } catch (error) {
      console.error('Failed to start A/B test:', error);
      return false;
    }
  }

  /**
   * 选择测试变体（基于百分比）
   */
  async selectVariant(testId: string, userId: string): Promise<ABTestVariant | null> {
    try {
      const test = await this.getTest(testId, userId);
      if (!test || test.status !== 'running') return null;

      // 生成随机数选择变体
      const random = Math.random() * 100;
      let accumulative = 0;

      for (const variant of test.variants) {
        accumulative += variant.percentage;
        if (random <= accumulative) {
          return variant;
        }
      }

      return test.variants[0]; // 兜底
    } catch (error) {
      console.error('Failed to select variant:', error);
      return null;
    }
  }

  /**
   * 记录推送结果
   */
  async recordResult(testId: string, variantId: string, success: boolean): Promise<void> {
    try {
      // 更新变体统计
      // await this.env.DB!.prepare(`UPDATE ab_test_variants SET sent_count = sent_count + 1, success_count = success_count + ? WHERE id = ?`).bind(...).run();
    } catch (error) {
      console.error('Failed to record result:', error);
    }
  }

  /**
   * 分析测试结果
   */
  async analyzeTest(testId: string, userId: string): Promise<ABTestAnalysis | null> {
    try {
      const test = await this.getTest(testId, userId);
      if (!test) return null;

      const analysis: ABTestAnalysis = {
        testId,
        totalSent: 0,
        totalSuccess: 0,
        variants: [],
        recommendations: [],
      };

      // 计算总体统计
      for (const variant of test.variants) {
        analysis.totalSent += variant.sentCount;
        analysis.totalSuccess += variant.successCount;

        const rate = variant.sentCount > 0 ? variant.successCount / variant.sentCount : 0;
        analysis.variants.push({
          variantId: variant.id,
          name: variant.name,
          sent: variant.sentCount,
          success: variant.successCount,
          rate,
        });
      }

      // 找出最佳变体
      const sortedVariants = [...analysis.variants].sort((a, b) => b.rate - a.rate);
      const best = sortedVariants[0];
      const secondBest = sortedVariants[1];

      if (best && secondBest) {
        // 简单的统计显著性检查（示例）
        const improvement = best.rate - secondBest.rate;
        best.improvement = improvement;

        // 样本量足够且有显著改善才建议
        if (best.sent >= test.targetSampleSize / test.variants.length && improvement > 0.05) {
          analysis.winner = {
            variantId: best.variantId,
            confidence: 0.95, // 模拟置信度
          };
          analysis.recommendations.push(`建议选择 ${best.name}，相比第二好提升 ${(improvement * 100).toFixed(1)}%`);
        }
      }

      // 添加其他建议
      if (analysis.totalSent < test.targetSampleSize) {
        analysis.recommendations.push(`样本量不足，建议继续测试直到达到 ${test.targetSampleSize}`);
      }

      return analysis;
    } catch (error) {
      console.error('Failed to analyze test:', error);
      return null;
    }
  }

  /**
   * 结束 A/B 测试
   */
  async endTest(testId: string, userId: string, winnerVariantId?: string): Promise<boolean> {
    try {
      const now = new Date().toISOString();

      // await this.env.DB!.prepare(`UPDATE ab_tests SET status = 'completed', winner_id = ?, ended_at = ? WHERE id = ? AND user_id = ?`).bind(...).run();

      return true;
    } catch (error) {
      console.error('Failed to end test:', error);
      return false;
    }
  }

  /**
   * 获取测试列表
   */
  async listTests(userId: string, status?: ABTestStatus, limit = 20, offset = 0): Promise<ABTest[]> {
    try {
      // let query = `SELECT * FROM ab_tests WHERE user_id = ?`;
      // const params = [userId];

      // if (status) {
      //   query += ' AND status = ?';
      //   params.push(status);
      // }

      // query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      // params.push(limit, offset);

      return [];
    } catch (error) {
      console.error('Failed to list tests:', error);
      return [];
    }
  }

  /**
   * 获取单个测试
   */
  async getTest(testId: string, userId: string): Promise<ABTest | null> {
    try {
      // const result = await this.env.DB!.prepare(`SELECT * FROM ab_tests WHERE id = ? AND user_id = ?`).bind(testId, userId).first<any>();
      // return result || null;
      return null; // 临时返回
    } catch (error) {
      console.error('Failed to get test:', error);
      return null;
    }
  }

  /**
   * 删除测试
   */
  async deleteTest(testId: string, userId: string): Promise<boolean> {
    try {
      // await this.env.DB!.prepare(`DELETE FROM ab_tests WHERE id = ? AND user_id = ?`).bind(testId, userId).run();
      return true;
    } catch (error) {
      console.error('Failed to delete test:', error);
      return false;
    }
  }

  /**
   * 获取测试统计
   */
  async getTestStats(userId: string): Promise<{
    total: number;
    running: number;
    completed: number;
    totalSamples: number;
  }> {
    try {
      // const result = await this.env.DB!.prepare(...).bind(userId).first<any>();
      return {
        total: 0,
        running: 0,
        completed: 0,
        totalSamples: 0,
      };
    } catch (error) {
      console.error('Failed to get stats:', error);
      return {
        total: 0,
        running: 0,
        completed: 0,
        totalSamples: 0,
      };
    }
  }
}
