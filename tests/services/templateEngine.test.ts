import { describe, it, expect } from 'vitest';
import {
  TemplateEngine,
  getDefaultCategories,
  getDefaultVariableTemplates,
  exportTemplate,
  importTemplate,
  type TemplateVariable,
  type EnhancedPushTemplate,
} from '../../src/services/templateEngine';

describe('TemplateEngine', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  describe('extractVariables', () => {
    it('应该从文本中提取变量', () => {
      const text = 'Hello {{name}}, today is {{date}}';
      const variables = engine.extractVariables(text);
      expect(variables).toEqual(['name', 'date']);
    });

    it('应该去重重复的变量', () => {
      const text = '{{name}} and {{name}} again';
      const variables = engine.extractVariables(text);
      expect(variables).toEqual(['name']);
    });

    it('应该对空文本返回空数组', () => {
      expect(engine.extractVariables('')).toEqual([]);
      expect(engine.extractVariables('   ')).toEqual([]);
    });

    it('应该对无变量的文本返回空数组', () => {
      expect(engine.extractVariables('Hello world')).toEqual([]);
    });
  });

  describe('getVariableMeta', () => {
    it('应该返回预定义变量的元信息', () => {
      const meta = engine.getVariableMeta('date');
      expect(meta.key).toBe('date');
      expect(meta.name).toBe('日期');
      expect(meta.type).toBe('date');
    });

    it('应该对自定义变量返回默认元信息', () => {
      const meta = engine.getVariableMeta('custom_var');
      expect(meta.key).toBe('custom_var');
      expect(meta.name).toBe('custom_var');
      expect(meta.type).toBe('string');
    });
  });

  describe('analyzeTemplate', () => {
    it('应该分析模板变量', () => {
      const analysis = engine.analyzeTemplate({
        title: 'Hello {{name}}',
        content: 'Today is {{date}}, project: {{project}}',
      });

      expect(analysis.variables).toEqual(['name', 'date', 'project']);
      expect(analysis.usedPredefined).toContain('date');
      expect(analysis.usedPredefined).toContain('project');
      expect(analysis.variableMeta.length).toBe(3);
    });

    it('应该处理没有变量的模板', () => {
      const analysis = engine.analyzeTemplate({
        title: 'Hello',
        content: 'World',
      });
      expect(analysis.variables).toEqual([]);
      expect(analysis.variableMeta).toEqual([]);
    });
  });

  describe('replaceVariables', () => {
    it('应该正确替换变量', () => {
      const text = 'Hello {{name}}, welcome to {{project}}';
      const result = engine.replaceVariables(text, {
        name: 'Alice',
        project: 'Test',
      });
      expect(result).toBe('Hello Alice, welcome to Test');
    });

    it('应该保留未提供值的变量', () => {
      const text = 'Hello {{name}}, today is {{date}}';
      const result = engine.replaceVariables(text, { name: 'Bob' });
      expect(result).toContain('Hello Bob');
      expect(result).toContain('{{date}}');
    });

    it('应该支持不同类型的变量值', () => {
      const text = 'Number: {{num}}, Boolean: {{bool}}';
      const result = engine.replaceVariables(text, {
        num: 42,
        bool: true,
      });
      expect(result).toContain('Number: 42');
      expect(result).toContain('Boolean: true');
    });

    it('应该在禁用默认值时不自动替换日期变量', () => {
      const text = 'Date: {{date}}';
      const result = engine.replaceVariables(text, {}, false);
      expect(result).toBe('Date: {{date}}');
    });
  });

  describe('validateVariables', () => {
    it('应该验证必填变量', () => {
      const result = engine.validateVariables(
        { title: '{{required}}', content: '' },
        {}
      );
      expect(result.valid).toBe(true);
    });

    it('应该警告未使用的变量', () => {
      const result = engine.validateVariables(
        { title: 'Hello', content: '' },
        { unused: 'value' }
      );
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('generatePreview', () => {
    it('应该生成预览', () => {
      const preview = engine.generatePreview(
        {
          title: 'Hello {{name}}',
          content: 'Today is {{date}}',
          url: 'https://example.com/{{page}}',
        },
        { name: 'Alice', date: '2024-01-01', page: 'home' }
      );

      expect(preview.title).toBe('Hello Alice');
      expect(preview.content).toContain('Today is 2024-01-01');
      expect(preview.url).toBe('https://example.com/home');
    });
  });

  describe('validateTemplate', () => {
    it('应该验证必填字段', () => {
      const result = engine.validateTemplate({
        name: '',
        title: '',
        content: '',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('应该对有效的模板返回成功', () => {
      const result = engine.validateTemplate({
        name: 'Test Template',
        title: 'Hello World',
        content: 'This is a test',
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('应该对过长的名称返回错误', () => {
      const longName = 'a'.repeat(101);
      const result = engine.validateTemplate({
        name: longName,
        title: 'Test',
        content: 'Test',
      });
      expect(result.valid).toBe(false);
    });
  });
});

describe('辅助函数', () => {
  describe('getDefaultCategories', () => {
    it('应该返回预定义分类', () => {
      const categories = getDefaultCategories();
      expect(categories.length).toBeGreaterThan(0);
      expect(categories[0].id).toBeDefined();
      expect(categories[0].name).toBeDefined();
    });
  });

  describe('getDefaultVariableTemplates', () => {
    it('应该返回预定义模板', () => {
      const templates = getDefaultVariableTemplates();
      expect(templates).toHaveProperty('alert');
      expect(templates).toHaveProperty('notification');
      expect(templates).toHaveProperty('marketing');
      expect(templates).toHaveProperty('reminder');
    });
  });

  describe('exportTemplate', () => {
    it('应该导出模板为 JSON', () => {
      const template: EnhancedPushTemplate = {
        id: 'test-id',
        name: 'Test Template',
        title: 'Hello',
        content: 'World',
        channels: [],
        useMarkdown: false,
        variables: [],
        tags: [],
        isPublic: false,
        usageCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const exported = exportTemplate(template);
      const parsed = JSON.parse(exported);
      expect(parsed.id).toBe('test-id');
      expect(parsed.name).toBe('Test Template');
      expect(parsed.exportedAt).toBeDefined();
    });
  });

  describe('importTemplate', () => {
    it('应该从 JSON 导入模板', () => {
      const json = JSON.stringify({
        name: 'Imported Template',
        title: 'Imported Title',
        content: 'Imported Content',
      });
      const template = importTemplate(json);
      expect(template).not.toBeNull();
      expect(template?.name).toBe('Imported Template');
      expect(template?.id).not.toBe('test-id');
    });

    it('应该对无效 JSON 返回 null', () => {
      const result = importTemplate('invalid json');
      expect(result).toBeNull();
    });

    it('应该对缺少必填字段的模板返回 null', () => {
      const json = JSON.stringify({});
      const result = importTemplate(json);
      expect(result).toBeNull();
    });
  });
});
