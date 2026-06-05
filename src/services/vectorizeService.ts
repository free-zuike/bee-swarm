// ============================================
// Vectorize AI 向量搜索服务
// 用于模板语义搜索和智能推荐
// 免费额度：30 million 向量维度/月
// ============================================

import type { Env } from '../types';

/**
 * 向量元数据
 */
export interface VectorMetadata {
  templateId?: string;
  name?: string;
  category?: string;
  userId?: string;
  createdAt?: string;
}

/**
 * 向量条目
 */
export interface VectorEntry {
  id: string;
  vector: number[];
  metadata: VectorMetadata;
}

/**
 * 搜索结果
 */
export interface SearchResult {
  id: string;
  score: number;
  metadata: VectorMetadata;
}

// Vectorize API 类型定义
interface VectorizeIndexType {
  insert(options: {
    ids: string[];
    vectors: number[][];
    metadata?: VectorMetadata[];
  }): Promise<void>;
  deleteByIds(ids: string[]): Promise<void>;
  query(
    vector: number[],
    options?: {
      topK?: number;
      filter?: Record<string, string>;
      returnMetadata?: boolean;
    }
  ): Promise<{
    matches: Array<{
      id: string;
      score: number;
      metadata?: VectorMetadata;
    }>;
  }>;
  queryById(
    vectorId: string,
    options?: {
      topK?: number;
      filter?: Record<string, string>;
      returnMetadata?: boolean;
    }
  ): Promise<{
    matches: Array<{
      id: string;
      score: number;
      metadata?: VectorMetadata;
    }>;
  }>;
}

/**
 * Vectorize 向量搜索服务
 */
export class VectorizeService {
  private env: Env;
  private index: VectorizeIndexType | undefined;

  constructor(env: Env) {
    this.env = env;
    this.index = env.VECTORIZE_INDEX as VectorizeIndexType | undefined;
  }

  /**
   * 检查是否可用
   */
  isAvailable(): boolean {
    return !!this.index;
  }

  /**
   * 将文本转换为向量
   */
  async embedText(text: string): Promise<number[]> {
    if (!this.env.AI) {
      throw new Error('Workers AI not configured');
    }

    const result = await this.env.AI.run('@cf/baai/bge-large-en-v1.5', {
      text: text.slice(0, 1000),
    });

    return result.data[0].embedding as number[];
  }

  /**
   * 为模板生成向量
   */
  async generateTemplateVector(
    templateId: string,
    name: string,
    content: string,
    category: string,
    userId: string
  ): Promise<VectorEntry> {
    const combinedText = `${name} ${content} ${category}`.slice(0, 1000);
    const vector = await this.embedText(combinedText);

    return {
      id: templateId,
      vector,
      metadata: {
        templateId,
        name,
        category,
        userId,
        createdAt: new Date().toISOString(),
      },
    };
  }

  /**
   * 插入向量
   */
  async insertVector(entry: VectorEntry): Promise<void> {
    if (!this.index) {
      console.warn('[Vectorize] Vectorize not configured');
      return;
    }

    await this.index.insert({
      ids: [entry.id],
      vectors: [entry.vector],
      metadata: [entry.metadata],
    });
  }

  /**
   * 批量插入向量
   */
  async insertVectors(entries: VectorEntry[]): Promise<{ success: number; failed: number }> {
    if (!this.index) {
      return { success: 0, failed: entries.length };
    }

    try {
      await this.index.insert({
        ids: entries.map((e) => e.id),
        vectors: entries.map((e) => e.vector),
        metadata: entries.map((e) => e.metadata),
      });
      return { success: entries.length, failed: 0 };
    } catch {
      return { success: 0, failed: entries.length };
    }
  }

  /**
   * 删除向量
   */
  async deleteVector(id: string): Promise<void> {
    if (!this.index) {
      return;
    }
    await this.index.deleteByIds([id]);
  }

  /**
   * 搜索相似向量
   */
  async searchSimilar(
    query: string,
    options: {
      topK?: number;
      userId?: string;
      category?: string;
      minScore?: number;
    } = {}
  ): Promise<SearchResult[]> {
    if (!this.index) {
      return [];
    }

    const { topK = 10, userId, category, minScore = 0.5 } = options;

    try {
      const queryVector = await this.embedText(query);

      const filter: Record<string, string> = {};
      if (userId) filter.userId = userId;
      if (category) filter.category = category;

      const hasFilter = Object.keys(filter).length > 0;

      const results = await this.index.query(queryVector, {
        topK,
        filter: hasFilter ? filter : undefined,
        returnMetadata: true,
      });

      const searchResults: SearchResult[] = [];

      for (const match of results.matches) {
        if (match.score >= minScore) {
          searchResults.push({
            id: match.id,
            score: match.score,
            metadata: match.metadata || {},
          });
        }
      }

      return searchResults;
    } catch {
      return [];
    }
  }

  /**
   * 搜索相似模板
   */
  async searchTemplates(
    query: string,
    userId: string,
    searchOptions: { topK?: number; category?: string } = {}
  ): Promise<{
    templates: Array<{ id: string; name: string; category: string; score: number }>;
    query: string;
  }> {
    const results = await this.searchSimilar(query, {
      ...searchOptions,
      userId,
      minScore: 0.6,
    });

    const templates = results.map((r) => ({
      id: r.metadata.templateId || r.id,
      name: r.metadata.name || '',
      category: r.metadata.category || '',
      score: r.score,
    }));

    return { templates, query };
  }

  /**
   * 获取相似模板推荐
   */
  async getRecommendations(
    templateId: string,
    userId: string,
    limit = 5
  ): Promise<Array<{ id: string; name: string; score: number }>> {
    if (!this.index) {
      return [];
    }

    try {
      const results = await this.index.queryById(templateId, {
        topK: limit + 1,
        filter: { userId },
        returnMetadata: true,
      });

      return results.matches
        .filter((m) => m.id !== templateId)
        .slice(0, limit)
        .map((m) => ({
          id: m.id,
          name: m.metadata?.name || m.id,
          score: m.score,
        }));
    } catch {
      return [];
    }
  }

  /**
   * 获取索引统计
   */
  async getStats(): Promise<{ available: boolean; dimensions: number }> {
    return {
      available: !!this.index,
      dimensions: 1024,
    };
  }
}

/**
 * 模板向量管理器
 */
export class TemplateVectorManager {
  private vectorizeService: VectorizeService;

  constructor(env: Env) {
    this.vectorizeService = new VectorizeService(env);
  }

  /**
   * 为模板创建向量并存储
   */
  async createTemplateVector(
    template: { id: string; name: string; content: string; category: string },
    userId: string
  ): Promise<boolean> {
    try {
      const entry = await this.vectorizeService.generateTemplateVector(
        template.id,
        template.name,
        template.content,
        template.category,
        userId
      );
      await this.vectorizeService.insertVector(entry);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 更新模板向量
   */
  async updateTemplateVector(
    template: { id: string; name: string; content: string; category: string },
    userId: string
  ): Promise<boolean> {
    try {
      await this.vectorizeService.deleteVector(template.id);
      return await this.createTemplateVector(template, userId);
    } catch {
      return false;
    }
  }

  /**
   * 删除模板向量
   */
  async deleteTemplateVector(templateId: string): Promise<boolean> {
    try {
      await this.vectorizeService.deleteVector(templateId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 搜索模板
   */
  async searchTemplates(
    query: string,
    userId: string,
    options?: { topK?: number; category?: string }
  ): Promise<{
    templates: Array<{ id: string; name: string; category: string; score: number }>;
    query: string;
  }> {
    return this.vectorizeService.searchTemplates(query, userId, options);
  }

  /**
   * 获取模板推荐
   */
  async getRecommendations(
    templateId: string,
    userId: string,
    limit = 5
  ): Promise<Array<{ id: string; name: string; score: number }>> {
    return this.vectorizeService.getRecommendations(templateId, userId, limit);
  }

  /**
   * 批量同步模板向量
   */
  async syncTemplates(
    templates: Array<{ id: string; name: string; content: string; category: string }>,
    userId: string
  ): Promise<{ success: number; failed: number }> {
    if (!this.vectorizeService.isAvailable()) {
      return { success: 0, failed: templates.length };
    }

    try {
      const entries: VectorEntry[] = [];

      for (const template of templates) {
        const entry = await this.vectorizeService.generateTemplateVector(
          template.id,
          template.name,
          template.content,
          template.category,
          userId
        );
        entries.push(entry);
      }

      return await this.vectorizeService.insertVectors(entries);
    } catch {
      return { success: 0, failed: templates.length };
    }
  }
}
