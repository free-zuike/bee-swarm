// ============================================
// AI 服务
// 处理 Workers AI 相关功能，如消息生成
// ============================================
import type { Env } from '../types';

/**
 * AI 生成消息请求
 */
export interface AIGenerateRequest {
  /** 提示词，描述想要生成的内容 */
  prompt: string;
  /** 生成内容的类型 */
  type?: 'title' | 'body' | 'both';
  /** 语言 */
  language?: 'zh' | 'en';
}

/**
 * AI 生成消息响应
 */
export interface AIGenerateResponse {
  /** 生成的标题 */
  title?: string;
  /** 生成的内容 */
  body?: string;
  /** 是否成功 */
  success: boolean;
  /** 提示信息 */
  message?: string;
}

/**
 * AI 服务类
 */
export class AIService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * 检查 AI 是否可用
   */
  isAvailable(): boolean {
    return !!this.env.AI;
  }

  /**
   * 生成推送消息
   */
  async generateMessage(request: AIGenerateRequest): Promise<AIGenerateResponse> {
    try {
      if (!this.env.AI) {
        return {
          success: false,
          message: 'AI 服务不可用，请先配置 Workers AI',
        };
      }

      const { prompt, type = 'both', language = 'zh' } = request;

      // 构建系统提示
      const systemPrompt = this.buildSystemPrompt(type, language);
      const userPrompt = this.buildUserPrompt(prompt, type);

      // 调用 AI 模型
      const response = await this.env.AI.run('@cf/qwen/qwen1.5-0.5b-chat', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });

      // 解析响应
      const aiContent = response.response || '';
      const result = this.parseAIResponse(aiContent, type);

      return {
        ...result,
        success: true,
      };
    } catch (error) {
      console.error('[AI Service] Error generating message:', error);
      return {
        success: false,
        message: `AI 生成失败: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 构建系统提示
   */
  private buildSystemPrompt(type: string, language: string): string {
    const langText = language === 'zh' ? '中文' : 'English';
    const typeText = type === 'title' ? '标题' : type === 'body' ? '正文' : '标题和正文';

    return `你是一个专业的消息写作助手。请用${langText}为用户生成高质量的推送通知${typeText}。

要求：
1. 标题要简洁明了，不超过30个字
2. 正文要内容丰富，有条理，不超过500个字
3. 语言要自然流畅，易于理解
4. 请直接返回内容，不要有额外的解释

输出格式：
- 如果只需要标题：标题内容
- 如果只需要正文：正文内容
- 如果都需要：
  【标题】标题内容
  【正文】正文内容`;
  }

  /**
   * 构建用户提示
   */
  private buildUserPrompt(prompt: string, type: string): string {
    const typeDesc = type === 'title' ? '一个标题' : type === 'body' ? '一段正文' : '标题和正文';
    return `请根据以下描述生成${typeDesc}：\n\n${prompt}`;
  }

  /**
   * 解析 AI 响应
   */
  private parseAIResponse(content: string, type: string): Partial<AIGenerateResponse> {
    const result: Partial<AIGenerateResponse> = {};

    if (type === 'both') {
      // 解析标题和正文
      const titleMatch = content.match(/【标题】\s*(.+?)\s*(?=\n【正文】|$)/s);
      const bodyMatch = content.match(/【正文】\s*(.+?)\s*$/s);

      if (titleMatch) {
        result.title = titleMatch[1].trim();
      }
      if (bodyMatch) {
        result.body = bodyMatch[1].trim();
      }

      // 如果没有匹配到格式，尝试其他方式
      if (!result.title && !result.body) {
        const lines = content.trim().split('\n');
        if (lines.length >= 1) {
          result.title = lines[0].trim();
        }
        if (lines.length >= 2) {
          result.body = lines.slice(1).join('\n').trim();
        }
      }
    } else if (type === 'title') {
      result.title = content.trim();
    } else if (type === 'body') {
      result.body = content.trim();
    }

    return result;
  }
}
