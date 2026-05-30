import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  replaceTemplateVariables,
  extractVariables,
  PushService,
  type PushTemplate,
  type ChannelGroup,
  type ScheduledPush
} from '../../src/services/push';
import type { PushChannel, ChannelConfig } from '../../types';

describe('PushService 模板工具', () => {
  describe('replaceTemplateVariables', () => {
    it('应该正确替换简单变量', () => {
      const result = replaceTemplateVariables('Hello {{name}}!', { name: 'World' });
      expect(result).toBe('Hello World!');
    });

    it('应该保留未找到的变量', () => {
      const result = replaceTemplateVariables('Hello {{name}}, {{missing}}!', { name: 'World' });
      expect(result).toBe('Hello World, {{missing}}!');
    });

    it('应该正确处理多个变量', () => {
      const result = replaceTemplateVariables(
        '{{greeting}} {{name}}!',
        { greeting: 'Hello', name: 'World' }
      );
      expect(result).toBe('Hello World!');
    });

    it('应该在启用自动变量时自动添加日期时间变量', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-30T12:00:00Z'));
      
      const result = replaceTemplateVariables('Date: {{date}}', {}, true);
      expect(result).toContain('Date:');
      
      vi.useRealTimers();
    });

    it('应该在禁用自动变量时不添加额外变量', () => {
      const result = replaceTemplateVariables('{{date}}', {}, false);
      expect(result).toBe('{{date}}');
    });
  });

  describe('extractVariables', () => {
    it('应该正确提取变量名', () => {
      const variables = extractVariables('Hello {{name}}, how are {{you}}?');
      expect(variables).toEqual(['name', 'you']);
    });

    it('应该去重重复的变量', () => {
      const variables = extractVariables('{{name}} and {{name}}');
      expect(variables).toEqual(['name']);
    });

    it('应该对空文本返回空数组', () => {
      expect(extractVariables('')).toEqual([]);
      expect(extractVariables('  ')).toEqual([]);
    });

    it('应该正确处理没有变量的文本', () => {
      expect(extractVariables('Hello World')).toEqual([]);
    });
  });
});

describe('PushService', () => {
  let env: any;
  let pushService: PushService;

  beforeEach(() => {
    const kvStore = new Map<string, string>();
    env = {
      SUBSCRIPTIONS: {
        get: vi.fn(async (key: string) => kvStore.get(key) || null),
        put: vi.fn(async (key: string, value: string) => {
          kvStore.set(key, value);
        }),
        delete: vi.fn(async (key: string) => {
          kvStore.delete(key);
        }),
        list: vi.fn(async () => ({ keys: [], list_complete: true })),
      },
    };
    pushService = new PushService(env, 'test-user');
  });

  describe('模板管理', () => {
    it('应该初始返回空模板列表', async () => {
      const templates = await pushService.getTemplates();
      expect(templates).toEqual([]);
    });

    it('应该正确创建和保存新模板', async () => {
      const templateData = {
        name: 'Test Template',
        title: 'Test Title',
        content: 'Test Content',
        channels: ['wework'] as PushChannel[],
      };

      const template = await pushService.saveTemplate(templateData);

      expect(template.id).toBeDefined();
      expect(template.name).toBe(templateData.name);
      expect(template.createdAt).toBeDefined();
      expect(template.updatedAt).toBeDefined();

      const savedTemplates = await pushService.getTemplates();
      expect(savedTemplates.length).toBe(1);
      expect(savedTemplates[0].id).toBe(template.id);
    });

    it('应该正确更新现有模板', async () => {
      const template = await pushService.saveTemplate({
        name: 'Original',
        title: 'Original Title',
        content: 'Original Content',
      });

      const updated = await pushService.updateTemplate(template.id, { name: 'Updated' });

      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('Updated');
      expect(updated?.title).toBe('Original Title');
    });

    it('应该返回 null 当更新不存在的模板', async () => {
      const updated = await pushService.updateTemplate('non-existent-id', { name: 'Test' });
      expect(updated).toBeNull();
    });

    it('应该正确删除模板', async () => {
      const template = await pushService.saveTemplate({
        name: 'To Delete',
        title: 'Test',
        content: 'Test',
      });

      const deleted = await pushService.deleteTemplate(template.id);
      expect(deleted).toBe(true);

      const templates = await pushService.getTemplates();
      expect(templates.length).toBe(0);
    });

    it('应该返回 false 当删除不存在的模板', async () => {
      const deleted = await pushService.deleteTemplate('non-existent-id');
      expect(deleted).toBe(false);
    });
  });

  describe('渠道组管理', () => {
    it('应该正确创建渠道组', async () => {
      const group = await pushService.saveChannelGroup({
        name: 'Test Group',
        channels: ['wework', 'dingtalk'] as PushChannel[],
      });

      expect(group.id).toBeDefined();
      expect(group.name).toBe('Test Group');
      expect(group.channels).toEqual(['wework', 'dingtalk']);

      const groups = await pushService.getChannelGroups();
      expect(groups.length).toBe(1);
    });

    it('应该正确更新渠道组', async () => {
      const group = await pushService.saveChannelGroup({
        name: 'Original',
        channels: ['wework'] as PushChannel[],
      });

      const updated = await pushService.updateChannelGroup(group.id, {
        name: 'Updated',
        channels: ['dingtalk'],
      });

      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('Updated');
      expect(updated?.channels).toEqual(['dingtalk']);
    });

    it('应该正确删除渠道组', async () => {
      const group = await pushService.saveChannelGroup({
        name: 'To Delete',
        channels: [],
      });

      const deleted = await pushService.deleteChannelGroup(group.id);
      expect(deleted).toBe(true);

      const groups = await pushService.getChannelGroups();
      expect(groups.length).toBe(0);
    });
  });

  describe('定时推送管理', () => {
    it('应该正确创建定时推送', async () => {
      const push = await pushService.createScheduledPush({
        title: 'Test Scheduled Push',
        content: 'Test Content',
        channels: ['wework'] as PushChannel[],
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });

      expect(push.id).toBeDefined();
      expect(push.status).toBe('pending');
      expect(push.createdBy).toBe('test-user');
    });

    it('应该正确取消定时推送', async () => {
      const push = await pushService.createScheduledPush({
        title: 'Test',
        content: 'Test',
        channels: [],
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });

      const cancelled = await pushService.cancelScheduledPush(push.id);
      expect(cancelled).toBe(true);

      const pushes = await pushService.getScheduledPushes();
      expect(pushes[0].status).toBe('failed');
    });

    it('应该正确批量取消定时推送', async () => {
      const push1 = await pushService.createScheduledPush({
        title: 'Test 1',
        content: 'Test',
        channels: [],
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });

      const push2 = await pushService.createScheduledPush({
        title: 'Test 2',
        content: 'Test',
        channels: [],
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });

      const result = await pushService.batchCancelScheduledPushes([push1.id, push2.id, 'non-existent']);
      
      expect(result.cancelled).toBe(2);
      expect(result.notFound).toBe(1);
    });

    it('应该正确批量启用定时推送', async () => {
      const push = await pushService.createScheduledPush({
        title: 'Test',
        content: 'Test',
        channels: [],
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });

      await pushService.cancelScheduledPush(push.id);
      
      const result = await pushService.batchEnableScheduledPushes([push.id]);
      expect(result.enabled).toBe(1);

      const pushes = await pushService.getScheduledPushes();
      expect(pushes[0].status).toBe('pending');
    });
  });

  describe('推送并发功能', () => {
    it('应该正确处理空渠道列表', async () => {
      const sendFn = vi.fn().mockResolvedValue({
        channel: 'wework',
        success: true,
        message: 'OK',
      });

      const result = await pushService.pushConcurrent(
        [],
        {},
        { title: 'Test' },
        sendFn
      );

      expect(result.metrics.total).toBe(0);
      expect(sendFn).not.toHaveBeenCalled();
    });

    it('应该正确过滤禁用的渠道', async () => {
      const sendFn = vi.fn().mockResolvedValue({
        channel: 'wework',
        success: true,
        message: 'OK',
      });

      const settings: Record<string, ChannelConfig> = {
        wework: { enabled: true, config: {} },
        dingtalk: { enabled: false, config: {} },
      };

      await pushService.pushConcurrent(
        ['wework', 'dingtalk'] as PushChannel[],
        settings,
        { title: 'Test' },
        sendFn
      );

      expect(sendFn).toHaveBeenCalledTimes(1);
    });
  });
});
