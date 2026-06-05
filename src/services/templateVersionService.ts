// ============================================
// 模板版本管理服务
// 提供模板历史记录查看和回滚功能
// ============================================

import type { Env } from '../types';

/**
 * 模板版本
 */
export interface TemplateVersion {
  id: string;
  template_id: string;
  user_id: string;
  name: string;
  title_template: string;
  content_template: string;
  description: string | null;
  category: string | null;
  variables: string | null;
  version: number;
  created_at: string;
  created_by: string | null;
  change_message: string | null;
}

/**
 * 模板版本比较结果
 */
export interface TemplateVersionDiff {
  version_id: string;
  version_number: number;
  changes: {
    field: string;
    old_value: string | null;
    new_value: string | null;
    type: 'added' | 'modified' | 'deleted';
  }[];
}

/**
 * 模板版本管理服务类
 */
export class TemplateVersionService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * 创建模板版本
   */
  async createVersion(
    template_id: string,
    user_id: string,
    change_message?: string,
    created_by?: string
  ): Promise<TemplateVersion | null> {
    try {
      // 获取当前模板
      const template = await this.env.DB!.prepare(
        'SELECT * FROM push_templates WHERE id = ? AND user_id = ?'
      )
        .bind(template_id, user_id)
        .first<any>();

      if (!template) {
        return null;
      }

      // 获取下一个版本号
      const version_result = await this.env.DB!.prepare(
        'SELECT COALESCE(MAX(version), 0) as last_version FROM template_versions WHERE template_id = ?'
      )
        .bind(template_id)
        .first<{ last_version: number }>();

      const next_version = (version_result?.last_version || 0) + 1;

      // 创建版本记录
      const version_id = crypto.randomUUID();
      const now = new Date().toISOString();

      await this.env.DB!.prepare(
        `INSERT INTO template_versions (
          id, template_id, user_id, name, title_template, content_template, 
          description, category, variables, version, created_at, created_by, change_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          version_id,
          template_id,
          user_id,
          template.name,
          template.title_template,
          template.content_template,
          template.description,
          template.category,
          template.variables,
          next_version,
          now,
          created_by || null,
          change_message || null
        )
        .run();

      return {
        id: version_id,
        template_id,
        user_id,
        name: template.name,
        title_template: template.title_template,
        content_template: template.content_template,
        description: template.description,
        category: template.category,
        variables: template.variables,
        version: next_version,
        created_at: now,
        created_by: created_by || null,
        change_message: change_message || null,
      };
    } catch (error) {
      console.error('Failed to create template version:', error);
      return null;
    }
  }

  /**
   * 获取模板的所有版本
   */
  async getVersions(template_id: string, user_id: string, limit = 20, offset = 0): Promise<TemplateVersion[]> {
    try {
      const result = await this.env.DB!.prepare(
        'SELECT * FROM template_versions WHERE template_id = ? AND user_id = ? ORDER BY version DESC LIMIT ? OFFSET ?'
      )
        .bind(template_id, user_id, limit, offset)
        .all<TemplateVersion>();

      return result.results || [];
    } catch (error) {
      console.error('Failed to get template versions:', error);
      return [];
    }
  }

  /**
   * 获取单个版本
   */
  async getVersion(version_id: string, user_id: string): Promise<TemplateVersion | null> {
    try {
      const result = await this.env.DB!.prepare(
        'SELECT * FROM template_versions WHERE id = ? AND user_id = ?'
      )
        .bind(version_id, user_id)
        .first<TemplateVersion>();

      return result;
    } catch (error) {
      console.error('Failed to get template version:', error);
      return null;
    }
  }

  /**
   * 回滚到指定版本
   */
  async rollbackToVersion(version_id: string, user_id: string): Promise<{ success: boolean; new_version: number | null; error?: string }> {
    try {
      // 获取目标版本
      const version = await this.getVersion(version_id, user_id);
      if (!version) {
        return { success: false, new_version: null, error: '版本不存在' };
      }

      // 先保存当前状态作为新版本
      await this.createVersion(version.template_id, user_id, '回滚前的快照');

      // 更新当前模板
      const now = new Date().toISOString();
      await this.env.DB!.prepare(
        `UPDATE push_templates 
         SET name = ?, title_template = ?, content_template = ?, description = ?, category = ?, variables = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`
      )
        .bind(
          version.name,
          version.title_template,
          version.content_template,
          version.description,
          version.category,
          version.variables,
          now,
          version.template_id,
          user_id
        )
        .run();

      // 创建回滚版本记录
      const new_version_obj = await this.createVersion(
        version.template_id,
        user_id,
        `回滚到版本 ${version.version}`,
        user_id
      );

      return {
        success: true,
        new_version: new_version_obj?.version || null,
      };
    } catch (error) {
      console.error('Failed to rollback template:', error);
      return { success: false, new_version: null, error: (error as Error).message };
    }
  }

  /**
   * 比较两个版本
   */
  async compareVersions(
    template_id: string,
    user_id: string,
    version_id1: string,
    version_id2: string
  ): Promise<TemplateVersionDiff | null> {
    try {
      const [v1, v2] = await Promise.all([
        this.getVersion(version_id1, user_id),
        this.getVersion(version_id2, user_id),
      ]);

      if (!v1 || !v2 || v1.template_id !== v2.template_id) {
        return null;
      }

      const changes = [];
      const fields = ['name', 'title_template', 'content_template', 'description', 'category', 'variables'];

      for (const field of fields) {
        const val1 = (v1 as any)[field];
        const val2 = (v2 as any)[field];
        const isEqual = val1 === val2;

        if (!isEqual) {
          let type: 'added' | 'modified' | 'deleted';
          if (val1 === null || val1 === undefined) {
            type = 'deleted';
          } else if (val2 === null || val2 === undefined) {
            type = 'added';
          } else {
            type = 'modified';
          }

          changes.push({ field, old_value: val1, new_value: val2, type });
        }
      }

      return {
        version_id: version_id2,
        version_number: v2.version,
        changes,
      };
    } catch (error) {
      console.error('Failed to compare versions:', error);
      return null;
    }
  }

  /**
   * 清理旧版本（保留最近N个）
   */
  async cleanOldVersions(template_id: string, user_id: string, keep_count = 10): Promise<number> {
    try {
      // 获取需要保留的版本的最大version
      const versions = await this.getVersions(template_id, user_id, keep_count);
      if (versions.length === 0) return 0;

      const min_version_to_keep = Math.min(...versions.map(v => v.version));

      // 删除旧版本
      const result = await this.env.DB!.prepare(
        'DELETE FROM template_versions WHERE template_id = ? AND user_id = ? AND version < ?'
      )
        .bind(template_id, user_id, min_version_to_keep)
        .run();

      return result.meta?.changes || 0;
    } catch (error) {
      console.error('Failed to clean old versions:', error);
      return 0;
    }
  }

  /**
   * 获取版本统计
   */
  async getVersionStats(template_id: string, user_id: string): Promise<{
    total_versions: number;
    first_version_date: string | null;
    last_version_date: string | null;
    last_change_message: string | null;
  }> {
    try {
      const result = await this.env.DB!.prepare(
        `SELECT 
          COUNT(*) as total_versions,
          MIN(created_at) as first_version_date,
          MAX(created_at) as last_version_date
        FROM template_versions 
        WHERE template_id = ? AND user_id = ?`
      )
        .bind(template_id, user_id)
        .first<any>();

      // 获取最近的变更信息
      const last_version_result = await this.env.DB!.prepare(
        'SELECT change_message FROM template_versions WHERE template_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1'
      )
        .bind(template_id, user_id)
        .first<{ change_message: string | null }>();

      return {
        total_versions: result?.total_versions || 0,
        first_version_date: result?.first_version_date || null,
        last_version_date: result?.last_version_date || null,
        last_change_message: last_version_result?.change_message || null,
      };
    } catch (error) {
      console.error('Failed to get version stats:', error);
      return {
        total_versions: 0,
        first_version_date: null,
        last_version_date: null,
        last_change_message: null,
      };
    }
  }

  /**
   * 导出版本历史
   */
  async exportVersions(template_id: string, user_id: string): Promise<TemplateVersion[]> {
    return this.getVersions(template_id, user_id, 1000);
  }
}
