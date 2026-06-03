// ============================================
// 推送模板系统
// ============================================

export interface TemplateVariable {
  key: string;
  name: string;
  description: string;
  defaultValue?: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean' | 'date';
}

export interface TemplateCategory {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  isDefault?: boolean;
}

export interface EnhancedPushTemplate {
  id: string;
  name: string;
  description?: string;
  title: string;
  content: string;
  channels: string[];
  url?: string;
  imageUrl?: string;
  useMarkdown: boolean;
  variables: TemplateVariable[];
  categoryId?: string;
  tags: string[];
  isPublic: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

export interface TemplatePreview {
  title: string;
  content: string;
  url?: string;
  imageUrl?: string;
  variables: Record<string, string>;
}

export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const PREDEFINED_CATEGORIES: TemplateCategory[] = [
  {
    id: 'alert',
    name: '告警通知',
    description: '系统告警和错误通知',
    color: '#f56c6c',
    icon: 'alert',
    isDefault: true,
  },
  {
    id: 'notification',
    name: '普通通知',
    description: '日常通知和提醒',
    color: '#409eff',
    icon: 'bell',
    isDefault: true,
  },
  {
    id: 'marketing',
    name: '营销消息',
    description: '营销和推广信息',
    color: '#e6a23c',
    icon: 'trending_up',
    isDefault: true,
  },
  {
    id: 'reminder',
    name: '提醒事项',
    description: '待办和日程提醒',
    color: '#67c23a',
    icon: 'schedule',
    isDefault: true,
  },
];

const PREDEFINED_VARIABLES: Record<string, TemplateVariable> = {
  date: {
    key: 'date',
    name: '日期',
    description: '当前日期',
    type: 'date',
    required: false,
  },
  time: {
    key: 'time',
    name: '时间',
    description: '当前时间',
    type: 'date',
    required: false,
  },
  datetime: {
    key: 'datetime',
    name: '日期时间',
    description: '完整日期时间',
    type: 'date',
    required: false,
  },
  username: {
    key: 'username',
    name: '用户名',
    description: '用户名称',
    type: 'string',
    required: false,
  },
  url: {
    key: 'url',
    name: '链接地址',
    description: '链接 URL',
    type: 'string',
    required: false,
  },
  project: {
    key: 'project',
    name: '项目名称',
    description: '项目或应用名称',
    type: 'string',
    required: false,
  },
};

export class TemplateEngine {
  constructor() {}

  /**
   * 从模板中提取所有变量
   */
  extractVariables(text: string): string[] {
    if (!text) return [];
    const matches = text.match(/\{\{(\w+)\}\}/g);
    if (!matches) return [];
    const variables = matches.map((m) => m.slice(2, -2));
    return [...new Set(variables)];
  }

  /**
   * 获取变量的元信息
   */
  getVariableMeta(key: string): TemplateVariable {
    if (PREDEFINED_VARIABLES[key]) {
      return PREDEFINED_VARIABLES[key];
    }
    return {
      key,
      name: key,
      description: `自定义变量 ${key}`,
      type: 'string',
      required: false,
    };
  }

  /**
   * 分析模板变量
   */
  analyzeTemplate(template: { title: string; content: string }): {
    variables: string[];
    variableMeta: TemplateVariable[];
    usedPredefined: string[];
  } {
    const titleVars = this.extractVariables(template.title);
    const contentVars = this.extractVariables(template.content);
    const allVars = [...new Set([...titleVars, ...contentVars])];

    const variableMeta = allVars.map((k) => this.getVariableMeta(k));
    const usedPredefined = allVars.filter((k) => PREDEFINED_VARIABLES[k]);

    return {
      variables: allVars,
      variableMeta,
      usedPredefined,
    };
  }

  /**
   * 替换模板变量
   */
  replaceVariables(
    text: string,
    variables: Record<string, string | number | boolean>,
    useDefaults: boolean = false
  ): string {
    if (!text) return text;

    const now = new Date();
    const defaultVars: Record<string, string> = {
      date: now.toLocaleDateString('zh-CN'),
      time: now.toLocaleTimeString('zh-CN'),
      datetime: now.toLocaleString('zh-CN'),
      year: now.getFullYear().toString(),
      month: (now.getMonth() + 1).toString().padStart(2, '0'),
      day: now.getDate().toString().padStart(2, '0'),
    };

    let result = text;

    if (useDefaults) {
      result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        if (variables[key] !== undefined) {
          return String(variables[key]);
        }
        if (defaultVars[key] !== undefined) {
          return defaultVars[key];
        }
        const meta = this.getVariableMeta(key);
        if (meta.defaultValue !== undefined) {
          return meta.defaultValue;
        }
        return `{{${key}}}`;
      });
    } else {
      result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        if (variables[key] !== undefined) {
          return String(variables[key]);
        }
        return `{{${key}}}`;
      });
    }

    return result;
  }

  /**
   * 验证模板变量
   */
  validateVariables(
    template: { title: string; content: string },
    variables: Record<string, string | number | boolean>
  ): TemplateValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const analysis = this.analyzeTemplate(template);

    for (const varMeta of analysis.variableMeta) {
      if (varMeta.required && variables[varMeta.key] === undefined) {
        errors.push(`必须变量 ${varMeta.name} (${varMeta.key}) 未提供`);
        continue;
      }

      const value = variables[varMeta.key];
      if (value !== undefined) {
        const strValue = String(value);
        if (varMeta.type === 'number' && isNaN(Number(strValue))) {
          errors.push(`变量 ${varMeta.name} 必须是数字类型`);
        } else if (varMeta.type === 'boolean' && strValue !== 'true' && strValue !== 'false') {
          warnings.push(`变量 ${varMeta.name} 建议使用 boolean 类型`);
        } else if (varMeta.type === 'date') {
          const date = new Date(strValue);
          if (isNaN(date.getTime())) {
            warnings.push(`变量 ${varMeta.name} 建议使用有效的日期格式`);
          }
        }
      }
    }

    for (const key of Object.keys(variables)) {
      if (!analysis.variables.includes(key)) {
        warnings.push(`变量 ${key} 在模板中未使用`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 生成模板预览
   */
  generatePreview(
    template: {
      title: string;
      content: string;
      url?: string;
      imageUrl?: string;
    },
    variables: Record<string, string | number | boolean> = {}
  ): TemplatePreview {
    // 将所有变量转换为字符串
    const stringVariables: Record<string, string> = {};
    for (const [key, value] of Object.entries(variables)) {
      stringVariables[key] = String(value);
    }

    return {
      title: this.replaceVariables(template.title, variables, true),
      content: this.replaceVariables(template.content, variables, true),
      url: template.url ? this.replaceVariables(template.url, variables, true) : undefined,
      imageUrl: template.imageUrl
        ? this.replaceVariables(template.imageUrl, variables, true)
        : undefined,
      variables: stringVariables,
    };
  }

  /**
   * 验证模板格式
   */
  validateTemplate(template: {
    name: string;
    title: string;
    content: string;
  }): TemplateValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!template.name || template.name.trim().length === 0) {
      errors.push('模板名称不能为空');
    } else if (template.name.length > 100) {
      errors.push('模板名称不能超过 100 字符');
    }

    if (!template.title) {
      warnings.push('建议设置模板标题');
    } else if (template.title.length > 200) {
      warnings.push('标题建议不超过 200 字符');
    }

    if (!template.content) {
      warnings.push('建议设置模板内容');
    }

    const analysis = this.analyzeTemplate(template);
    const requiredVars = analysis.variableMeta.filter((v) => v.required);
    for (const reqVar of requiredVars) {
      if (!reqVar.defaultValue) {
        warnings.push(`变量 ${reqVar.name} 为必填，建议设置默认值`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

export function getDefaultCategories(): TemplateCategory[] {
  return [...PREDEFINED_CATEGORIES];
}

export function getDefaultVariableTemplates(): Record<string, { title: string; content: string }> {
  return {
    alert: {
      title: '⚠️ 系统告警 - {{datetime}}',
      content: '检测到问题，请立即查看。\n\n项目: {{project}}\n时间: {{datetime}}',
    },
    notification: {
      title: '📢 通知 - {{date}}',
      content: '您有一条新通知。\n\n{{content}}',
    },
    marketing: {
      title: '🎉 新活动上线！',
      content: '亲爱的用户：\n\n欢迎参与我们的新活动。\n\n点击查看详情: {{url}}',
    },
    reminder: {
      title: '📅 提醒 - {{date}}',
      content: '您有以下待办事项提醒：\n\n{{content}}\n\n时间: {{time}}',
    },
  };
}

export function exportTemplate(template: EnhancedPushTemplate): string {
  const exportData = {
    ...template,
    exportedAt: new Date().toISOString(),
    version: '1.0.0',
  };
  return JSON.stringify(exportData, null, 2);
}

export function importTemplate(jsonString: string): EnhancedPushTemplate | null {
  try {
    const data = JSON.parse(jsonString);
    if (!data.name || !data.title) {
      return null;
    }
    return {
      id: crypto.randomUUID(),
      name: data.name,
      description: data.description || '',
      title: data.title,
      content: data.content || '',
      channels: data.channels || [],
      url: data.url,
      imageUrl: data.imageUrl,
      useMarkdown: data.useMarkdown || false,
      variables: data.variables || [],
      categoryId: data.categoryId,
      tags: data.tags || [],
      isPublic: false,
      usageCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
