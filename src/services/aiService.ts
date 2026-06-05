// ============================================
// AI 辅助服务
// 利用 Workers AI 实现智能推荐和内容生成
// ============================================

import type { Env } from '../types';
import type { PushRequest } from '../../types';

/**
 * AI 服务配置
 */
const AI_CONFIG = {
  embeddingModel: '@cf/baai/bge-small-en-v1.5',
  textModel: '@cf/meta/llama-3.1-8b-instruct',
  maxTokens: 512,
  temperature: 0.7,
};

/**
 * AI 服务类
 */
export class AIService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * 检查 AI 服务是否可用
   */
  isAvailable(): boolean {
    return !!this.env.AI;
  }

  /**
   * 生成内容摘要
   * @param text 原始文本
   * @param maxLength 最大长度
   */
  async generateSummary(text: string, maxLength: number = 100): Promise<string | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const prompt = `Summarize the following text in about ${maxLength} characters:\n\n${text}`;

      const response = await this.env.AI.run(AI_CONFIG.textModel, {
        prompt,
        max_tokens: AI_CONFIG.maxTokens,
        temperature: AI_CONFIG.temperature,
      });

      const summary = typeof response === 'string' ? response : JSON.stringify(response);
      return summary.trim().substring(0, maxLength);
    } catch (error) {
      console.error('[AIService] Failed to generate summary:', error);
      return null;
    }
  }

  /**
   * 生成智能推送建议
   * 根据历史推送数据生成优化建议
   */
  async generatePushSuggestions(
    historyData: Array<{
      title: string;
      content: string;
      channels: string[];
      successRate: number;
    }>
  ): Promise<{ suggestions: string[] } | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const historyText = historyData
        .map(
          (item, index) =>
            `${index + 1}. Title: ${item.title}\nContent: ${item.content}\nChannels: ${item.channels.join(', ')}\nSuccess Rate: ${item.successRate}%`
        )
        .join('\n\n');

      const prompt = `分析以下推送历史数据，给出改进建议：\n\n${historyText}\n\n请提供3-5条具体的优化建议。`;

      const response = await this.env.AI.run(AI_CONFIG.textModel, {
        prompt,
        max_tokens: AI_CONFIG.maxTokens,
        temperature: AI_CONFIG.temperature,
      });

      const result = typeof response === 'string' ? response : JSON.stringify(response);
      const suggestions = result
        .split('\n')
        .filter((line: string) => line.trim())
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 5);

      return { suggestions };
    } catch (error) {
      console.error('[AIService] Failed to generate suggestions:', error);
      return null;
    }
  }

  /**
   * 智能优化推送内容
   * @param content 原始内容
   * @param channel 目标渠道
   */
  async optimizeContent(content: string, channel: string): Promise<string | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const prompt = `请优化以下推送内容，使其更适合${channel}渠道：\n\n${content}\n\n请直接返回优化后的内容，不需要额外解释。`;

      const response = await this.env.AI.run(AI_CONFIG.textModel, {
        prompt,
        max_tokens: AI_CONFIG.maxTokens,
        temperature: AI_CONFIG.temperature,
      });

      return typeof response === 'string' ? response.trim() : null;
    } catch (error) {
      console.error('[AIService] Failed to optimize content:', error);
      return null;
    }
  }

  /**
   * 生成向量嵌入
   * @param text 文本内容
   */
  async generateEmbedding(text: string): Promise<number[] | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const response = await this.env.AI.run(AI_CONFIG.embeddingModel, {
        text,
      });

      if (Array.isArray(response)) {
        return response as number[];
      }

      if (typeof response === 'object' && response !== null && 'embedding' in response) {
        return (response as { embedding: number[] }).embedding;
      }

      return null;
    } catch (error) {
      console.error('[AIService] Failed to generate embedding:', error);
      return null;
    }
  }

  /**
   * 智能生成推送标题
   * @param content 内容
   */
  async generateTitle(content: string): Promise<string | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const prompt = `根据以下内容生成一个简洁的推送标题（不超过20字）：\n\n${content}\n\n请直接返回标题。`;

      const response = await this.env.AI.run(AI_CONFIG.textModel, {
        prompt,
        max_tokens: 30,
        temperature: AI_CONFIG.temperature,
      });

      return typeof response === 'string' ? response.trim() : null;
    } catch (error) {
      console.error('[AIService] Failed to generate title:', error);
      return null;
    }
  }

  /**
   * 智能推荐发送时间
   * @param userActivity 用户活动数据
   */
  async recommendSendTime(
    userActivity: Array<{ hour: number; successRate: number; count: number }>
  ): Promise<{ recommendedHours: number[]; reason: string } | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const activityText = userActivity
        .map((item) => `${item.hour}时: 成功率${item.successRate}%, 次数${item.count}`)
        .join('\n');

      const prompt = `分析以下用户活动数据，推荐最佳推送时间：\n\n${activityText}\n\n请推荐2-3个最佳推送时段（以小时表示），并说明理由。`;

      const response = await this.env.AI.run(AI_CONFIG.textModel, {
        prompt,
        max_tokens: AI_CONFIG.maxTokens,
        temperature: AI_CONFIG.temperature,
      });

      const result = typeof response === 'string' ? response : JSON.stringify(response);
      
      // 提取推荐的小时
      const hours = result.match(/(\d{1,2})时/g)?.map((h) => parseInt(h.replace('时', ''))) || [];
      const uniqueHours = [...new Set(hours)].slice(0, 3);

      return {
        recommendedHours: uniqueHours.length > 0 ? uniqueHours : [9, 14, 19],
        reason: result.trim(),
      };
    } catch (error) {
      console.error('[AIService] Failed to recommend send time:', error);
      return null;
    }
  }

  /**
   * 检测敏感内容
   * @param content 待检测内容
   */
  async detectSensitiveContent(content: string): Promise<{
    isSensitive: boolean;
    categories: string[];
    confidence: number;
  } | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const prompt = `分析以下内容是否包含敏感信息：\n\n${content}\n\n请判断是否敏感，并列出类别（如：政治、色情、暴力、广告等），以及置信度（0-100）。\n\n格式：敏感: [是/否], 类别: [类别列表], 置信度: [数字]`;

      const response = await this.env.AI.run(AI_CONFIG.textModel, {
        prompt,
        max_tokens: 100,
        temperature: 0.3,
      });

      const result = typeof response === 'string' ? response : JSON.stringify(response);
      
      const isSensitiveMatch = result.match(/敏感:\s*(是|否)/);
      const categoriesMatch = result.match(/类别:\s*\[([^\]]+)\]/);
      const confidenceMatch = result.match(/置信度:\s*(\d+)/);

      return {
        isSensitive: isSensitiveMatch?.[1] === '是',
        categories: categoriesMatch ? categoriesMatch[1].split('、').map((c: string) => c.trim()) : [],
        confidence: confidenceMatch ? parseInt(confidenceMatch[1]) : 0,
      };
    } catch (error) {
      console.error('[AIService] Failed to detect sensitive content:', error);
      return null;
    }
  }

  /**
   * 生成推送消息
   */
  async generateMessage(params: {
    prompt: string;
    type?: 'title' | 'body' | 'both';
    language?: 'zh' | 'en';
    userId?: string;
  }): Promise<{ title?: string; body?: string; success: boolean; message?: string }> {
    if (!this.isAvailable()) {
      return { success: false, message: 'AI 服务不可用' };
    }

    try {
      const { prompt, type = 'both', language = 'zh' } = params;
      const results: { title?: string; body?: string } = {};

      if (type === 'title' || type === 'both') {
        const titlePrompt = language === 'zh'
          ? `根据以下内容生成一个简短的推送标题（不超过20字）：\n\n${prompt}\n\n请直接返回标题。`
          : `Generate a short push title (max 20 characters) for the following content:\n\n${prompt}\n\nReturn only the title.`;
        
        const titleResponse = await this.env.AI.run(AI_CONFIG.textModel, {
          prompt: titlePrompt,
          max_tokens: 30,
          temperature: AI_CONFIG.temperature,
        });
        
        results.title = typeof titleResponse === 'string' ? titleResponse.trim() : undefined;
      }

      if (type === 'body' || type === 'both') {
        const bodyPrompt = language === 'zh'
          ? `根据以下主题生成推送内容：\n\n${prompt}\n\n请生成详细的推送消息内容。`
          : `Generate push content for the following topic:\n\n${prompt}\n\nGenerate detailed push message content.`;
        
        const bodyResponse = await this.env.AI.run(AI_CONFIG.textModel, {
          prompt: bodyPrompt,
          max_tokens: AI_CONFIG.maxTokens,
          temperature: AI_CONFIG.temperature,
        });
        
        results.body = typeof bodyResponse === 'string' ? bodyResponse.trim() : undefined;
      }

      return { ...results, success: true };
    } catch (error) {
      console.error('[AIService] Failed to generate message:', error);
      return { success: false, message: (error as Error).message };
    }
  }

  /**
   * 执行 AI 命令
   */
  async executeCommand(params: { query: string; userId?: string; username?: string }): Promise<{ result?: string; success: boolean; message?: string }> {
    if (!this.isAvailable()) {
      return { success: false, message: 'AI 服务不可用' };
    }

    try {
      const response = await this.env.AI.run(AI_CONFIG.textModel, {
        prompt: params.query,
        max_tokens: AI_CONFIG.maxTokens,
        temperature: AI_CONFIG.temperature,
      });

      return {
        result: typeof response === 'string' ? response.trim() : JSON.stringify(response),
        success: true,
      };
    } catch (error) {
      console.error('[AIService] Failed to execute command:', error);
      return { success: false, message: (error as Error).message };
    }
  }
}
