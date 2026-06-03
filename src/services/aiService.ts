// ============================================
// AI 服务
// 处理 Workers AI 相关功能，支持消息生成和工具调用
// ============================================
import type { Env } from '../types';
import { PushService } from './push';
import { UserGroupService } from './groupService';
import { ScheduledTaskService } from './scheduledTaskService';
import { backupAllEndpoints } from './backup';

/**
 * AI 生成消息请求
 */
export interface AIGenerateRequest {
  prompt: string;
  type?: 'title' | 'body' | 'both';
  language?: 'zh' | 'en';
}

/**
 * AI 生成消息响应
 */
export interface AIGenerateResponse {
  title?: string;
  body?: string;
  success: boolean;
  message?: string;
}

/**
 * AI 工具调用请求
 */
export interface AIExecuteRequest {
  query: string;
  userId: string;
  username: string;
}

/**
 * AI 工具调用响应
 */
export interface AIExecuteResponse {
  success: boolean;
  result: string;
  data?: unknown;
  error?: string;
}

/**
 * AI 服务类
 */
export class AIService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  isAvailable(): boolean {
    return !!this.env.AI;
  }

  async generateMessage(request: AIGenerateRequest): Promise<AIGenerateResponse> {
    try {
      if (!this.env.AI) {
        return { success: false, message: 'AI 服务不可用' };
      }

      const { prompt, type = 'both', language = 'zh' } = request;
      const systemPrompt = this.buildSystemPrompt(type, language);
      const userPrompt = this.buildUserPrompt(prompt, type);

      const response = await this.env.AI.run('@cf/meta/llama-3.2-1b-instruct', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });

      const aiContent = response.response || '';
      const result = this.parseAIResponse(aiContent, type);

      return { ...result, success: true };
    } catch (error) {
      console.error('[AI Service] Error generating message:', error);
      return { success: false, message: `AI 生成失败: ${(error as Error).message}` };
    }
  }

  async executeCommand(request: AIExecuteRequest): Promise<AIExecuteResponse> {
    try {
      if (!this.env.AI) {
        return { success: false, result: 'AI 服务不可用', error: '请先配置 Workers AI' };
      }

      const { query, userId, username } = request;
      const tools = this.getAvailableTools();
      const systemPrompt = this.buildToolSystemPrompt(tools);

      const response = await this.env.AI.run('@cf/meta/llama-3.2-1b-instruct', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query },
        ],
      });

      const aiContent = response.response || '';
      const toolCall = this.parseToolCall(aiContent);

      if (toolCall) {
        return await this.executeTool(toolCall, userId, username);
      } else {
        return { success: true, result: aiContent };
      }
    } catch (error) {
      console.error('[AI Service] Error executing command:', error);
      return { success: false, result: '执行命令时发生错误', error: (error as Error).message };
    }
  }

  private getAvailableTools() {
    return [
      {
        name: 'createTemplate',
        description: '创建推送模板',
        parameters: [
          { name: 'name', type: 'string', description: '模板名称', required: true },
          { name: 'title', type: 'string', description: '推送标题', required: true },
          { name: 'content', type: 'string', description: '推送内容', required: false },
          { name: 'url', type: 'string', description: '跳转链接', required: false },
          { name: 'category', type: 'string', description: '分类', required: false },
        ],
      },
      {
        name: 'updateTemplate',
        description: '更新推送模板',
        parameters: [
          { name: 'id', type: 'string', description: '模板ID', required: true },
          { name: 'name', type: 'string', description: '模板名称', required: false },
          { name: 'title', type: 'string', description: '推送标题', required: false },
          { name: 'content', type: 'string', description: '推送内容', required: false },
          { name: 'url', type: 'string', description: '跳转链接', required: false },
          { name: 'category', type: 'string', description: '分类', required: false },
        ],
      },
      {
        name: 'deleteTemplate',
        description: '删除推送模板',
        parameters: [{ name: 'id', type: 'string', description: '模板ID', required: true }],
      },
      {
        name: 'listTemplates',
        description: '获取模板列表',
        parameters: [],
      },
      {
        name: 'getTemplate',
        description: '获取单个模板详情',
        parameters: [{ name: 'id', type: 'string', description: '模板ID', required: true }],
      },
      {
        name: 'createGroup',
        description: '创建分组',
        parameters: [
          { name: 'name', type: 'string', description: '分组名称', required: true },
          { name: 'description', type: 'string', description: '分组描述', required: false },
          { name: 'channels', type: 'string[]', description: '渠道列表，用逗号分隔', required: true },
        ],
      },
      {
        name: 'updateGroup',
        description: '更新分组',
        parameters: [
          { name: 'id', type: 'string', description: '分组ID', required: true },
          { name: 'name', type: 'string', description: '分组名称', required: false },
          { name: 'description', type: 'string', description: '分组描述', required: false },
          { name: 'channels', type: 'string[]', description: '渠道列表，用逗号分隔', required: false },
        ],
      },
      {
        name: 'deleteGroup',
        description: '删除分组',
        parameters: [{ name: 'id', type: 'string', description: '分组ID', required: true }],
      },
      {
        name: 'listGroups',
        description: '获取分组列表',
        parameters: [],
      },
      {
        name: 'createScheduledTask',
        description: '创建定时任务',
        parameters: [
          { name: 'name', type: 'string', description: '任务名称', required: true },
          { name: 'title', type: 'string', description: '推送标题', required: true },
          { name: 'body', type: 'string', description: '推送内容', required: false },
          { name: 'url', type: 'string', description: '跳转链接', required: false },
          { name: 'recurringType', type: 'string', description: '重复类型: daily/weekly/monthly/yearly/cron', required: true },
          { name: 'cronExpression', type: 'string', description: 'Cron表达式', required: false },
          { name: 'time', type: 'string', description: '执行时间，格式HH:MM', required: true },
          { name: 'channels', type: 'string[]', description: '渠道列表，用逗号分隔', required: true },
        ],
      },
      {
        name: 'deleteScheduledTask',
        description: '删除定时任务',
        parameters: [{ name: 'id', type: 'string', description: '任务ID', required: true }],
      },
      {
        name: 'listScheduledTasks',
        description: '获取定时任务列表',
        parameters: [],
      },
      {
        name: 'runBackup',
        description: '执行备份',
        parameters: [],
      },
      {
        name: 'listChannels',
        description: '获取渠道列表',
        parameters: [],
      },
      {
        name: 'enableChannel',
        description: '启用渠道',
        parameters: [{ name: 'channelId', type: 'string', description: '渠道ID', required: true }],
      },
      {
        name: 'disableChannel',
        description: '禁用渠道',
        parameters: [{ name: 'channelId', type: 'string', description: '渠道ID', required: true }],
      },
    ];
  }

  private buildToolSystemPrompt(tools: unknown[]): string {
    return `你是一个智能助手，可以帮助用户管理推送服务。你可以调用以下工具来执行操作：

可用工具：
${JSON.stringify(tools, null, 2)}

当用户请求执行某个操作时：
1. 分析用户意图
2. 如果需要调用工具，输出 JSON 格式的工具调用，格式如下：
   {"tool":"工具名称","params":{"参数名":"参数值"}}
3. 如果不需要调用工具（如回答问题、聊天），直接用自然语言回复用户

请用中文回答用户问题。

注意：
- 工具名称必须完全匹配
- 参数名必须完全匹配
- 如果没有合适的工具或无法理解请求，直接用自然语言回复
`;
  }

  private parseToolCall(content: string): { tool: string; params: Record<string, unknown> } | null {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.tool && typeof parsed.params === 'object') {
          return parsed;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private async executeTool(
    toolCall: { tool: string; params: Record<string, unknown> },
    userId: string,
    username: string
  ): Promise<AIExecuteResponse> {
    const { tool, params } = toolCall;

    switch (tool) {
      case 'createTemplate': {
        const pushService = new PushService(this.env);
        const result = await pushService.saveTemplate({
          userId,
          name: String(params.name),
          title: String(params.title),
          content: String(params.content || ''),
          url: String(params.url || ''),
          category: String(params.category || ''),
        });
        return { success: true, result: `模板 "${params.name}" 创建成功`, data: result };
      }

      case 'updateTemplate': {
        const pushService = new PushService(this.env);
        const updateData: Record<string, unknown> = {};
        if (params.name) updateData.name = String(params.name);
        if (params.title) updateData.title = String(params.title);
        if (params.content !== undefined) updateData.content = String(params.content);
        if (params.url) updateData.url = String(params.url);
        if (params.category) updateData.category = String(params.category);
        const result = await pushService.updateTemplate({ id: String(params.id), userId, ...updateData });
        return { success: true, result: '模板更新成功', data: result };
      }

      case 'deleteTemplate': {
        const pushService = new PushService(this.env);
        await pushService.deleteTemplate(String(params.id), userId);
        return { success: true, result: '模板删除成功' };
      }

      case 'listTemplates': {
        const pushService = new PushService(this.env);
        const templates = await pushService.getTemplates(userId);
        return { success: true, result: `共找到 ${templates.length} 个模板`, data: templates };
      }

      case 'getTemplate': {
        const pushService = new PushService(this.env);
        const template = await pushService.getTemplateById(String(params.id), userId);
        if (template) {
          return { success: true, result: '获取模板成功', data: template };
        }
        return { success: false, result: '模板不存在' };
      }

      case 'createGroup': {
        const groupService = new UserGroupService(this.env);
        const channels = Array.isArray(params.channels)
          ? params.channels.map(String)
          : String(params.channels || '').split(',').filter(Boolean);
        const result = await groupService.createGroup({
          userId,
          name: String(params.name),
          description: String(params.description || ''),
          channels,
        });
        return { success: true, result: `分组 "${params.name}" 创建成功`, data: result };
      }

      case 'updateGroup': {
        const groupService = new UserGroupService(this.env);
        const updateData: Record<string, unknown> = {};
        if (params.name) updateData.name = String(params.name);
        if (params.description) updateData.description = String(params.description);
        if (params.channels) {
          updateData.channels = Array.isArray(params.channels)
            ? params.channels.map(String)
            : String(params.channels).split(',').filter(Boolean);
        }
        const result = await groupService.updateGroup(String(params.id), userId, updateData);
        return { success: true, result: '分组更新成功', data: result };
      }

      case 'deleteGroup': {
        const groupService = new UserGroupService(this.env);
        await groupService.deleteGroup(String(params.id), userId);
        return { success: true, result: '分组删除成功' };
      }

      case 'listGroups': {
        const groupService = new UserGroupService(this.env);
        const groups = await groupService.getUserGroups(userId);
        return { success: true, result: `共找到 ${groups.length} 个分组`, data: groups };
      }

      case 'createScheduledTask': {
        const taskService = new ScheduledTaskService(this.env);
        const channels = Array.isArray(params.channels)
          ? params.channels.map(String)
          : String(params.channels || '').split(',').filter(Boolean);
        const result = await taskService.createTask({
          userId,
          name: String(params.name),
          title: String(params.title),
          body: String(params.body || ''),
          url: String(params.url || ''),
          recurringType: String(params.recurringType) as 'daily' | 'weekly' | 'monthly' | 'yearly' | 'cron',
          cronExpression: String(params.cronExpression || ''),
          time: String(params.time),
          channels,
        });
        return { success: true, result: `定时任务 "${params.name}" 创建成功`, data: result };
      }

      case 'deleteScheduledTask': {
        const taskService = new ScheduledTaskService(this.env);
        await taskService.deleteTask(String(params.id), userId);
        return { success: true, result: '定时任务删除成功' };
      }

      case 'listScheduledTasks': {
        const taskService = new ScheduledTaskService(this.env);
        const tasks = await taskService.getUserTasks(userId);
        return { success: true, result: `共找到 ${tasks.length} 个定时任务`, data: tasks };
      }

      case 'runBackup': {
        const result = await backupAllEndpoints(username, this.env);
        const successCount = result.filter((r: { success: boolean }) => r.success).length;
        const failCount = result.length - successCount;
        return { success: true, result: `备份完成：成功 ${successCount} 个，失败 ${failCount} 个`, data: result };
      }

      case 'listChannels': {
        const pushService = new PushService(this.env);
        const settings = await pushService.loadUserChannelSettings(username);
        const channels = Object.entries(settings).map(([id, config]) => ({
          id,
          enabled: config?.enabled || false,
        }));
        return { success: true, result: `共找到 ${channels.length} 个渠道`, data: channels };
      }

      case 'enableChannel': {
        const pushService = new PushService(this.env);
        await pushService.saveUserChannelSetting(username, String(params.channelId), { enabled: true });
        return { success: true, result: `渠道 "${params.channelId}" 已启用` };
      }

      case 'disableChannel': {
        const pushService = new PushService(this.env);
        await pushService.saveUserChannelSetting(username, String(params.channelId), { enabled: false });
        return { success: true, result: `渠道 "${params.channelId}" 已禁用` };
      }

      default:
        return { success: false, result: `未知工具: ${tool}`, error: '工具不存在' };
    }
  }

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

  private buildUserPrompt(prompt: string, type: string): string {
    const typeDesc = type === 'title' ? '一个标题' : type === 'body' ? '一段正文' : '标题和正文';
    return `请根据以下描述生成${typeDesc}：\n\n${prompt}`;
  }

  private parseAIResponse(content: string, type: string): Partial<AIGenerateResponse> {
    const result: Partial<AIGenerateResponse> = {};

    if (type === 'both') {
      const titleMatch = content.match(/【标题】\s*(.+?)\s*(?=\n【正文】|$)/s);
      const bodyMatch = content.match(/【正文】\s*(.+?)\s*$/s);

      if (titleMatch) result.title = titleMatch[1].trim();
      if (bodyMatch) result.body = bodyMatch[1].trim();

      if (!result.title && !result.body) {
        const lines = content.trim().split('\n');
        if (lines.length >= 1) result.title = lines[0].trim();
        if (lines.length >= 2) result.body = lines.slice(1).join('\n').trim();
      }
    } else if (type === 'title') {
      result.title = content.trim();
    } else if (type === 'body') {
      result.body = content.trim();
    }

    return result;
  }
}