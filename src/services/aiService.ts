// ============================================
// AI 服务
// 处理 Workers AI 相关功能，支持消息生成和工具调用
// ============================================
import type { Env, PushChannel } from '../types';
import { PushService } from './push';
import { executeAllBackups } from './backup';
import { loadUserChannelSettings, CHANNEL_DEFINITIONS } from './dispatcher';
import type { UserSettings, AITool } from './userService';

/**
 * AI 生成消息请求
 */
export interface AIGenerateRequest {
  prompt: string;
  type?: 'title' | 'body' | 'both';
  language?: 'zh' | 'en';
  userId?: string;
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

type AIProvider = string;

/**
 * AI 服务类
 */
export class AIService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  isAvailable(settings?: UserSettings): boolean {
    if (!settings) {
      return !!this.env.AI;
    }
    if (!settings.ai_enabled) return false;

    const provider = settings.ai_provider || 'workers-ai';

    // 检查是否是预定义的提供商
    switch (provider) {
      case 'workers-ai':
        return !!this.env.AI;
      case 'openai':
      case 'azure-openai':
      case 'anthropic':
      case 'custom':
        return !!(settings.ai_api_key && settings.ai_api_url);
      default:
        // 对于自定义提供商，检查是否有 API key 和 URL
        return !!(settings.ai_api_key && settings.ai_api_url);
    }
  }

  private async callAI(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    settings: UserSettings
  ): Promise<string> {
    const provider = settings.ai_provider || 'workers-ai';

    // 检查是否是预定义的提供商
    switch (provider) {
      case 'workers-ai': {
        if (!this.env.AI) {
          throw new Error('Workers AI 未配置');
        }
        const model = settings.ai_model_name || '@cf/meta/llama-3.3-8b-instruct';
        try {
          const response = await this.env.AI.run(model, { messages });
          return response.response || '';
        } catch (error) {
          console.error(`[AI Service] Workers AI 调用失败，尝试备用模型:`, error);
          // 如果主模型失败，尝试其他可用模型
          const fallbackModel = '@cf/meta/llama-3.2-3b-instruct';
          console.log(`[AI Service] 尝试备用模型: ${fallbackModel}`);
          const response = await this.env.AI.run(fallbackModel, { messages });
          return response.response || '';
        }
      }

      case 'openai':
      case 'custom': {
        const apiUrl = settings.ai_api_url || 'https://api.openai.com/v1/chat/completions';
        const apiKey = settings.ai_api_key;
        const model = settings.ai_model_name || 'gpt-4o';

        if (!apiKey) {
          throw new Error('API key 未配置');
        }

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.7,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
        }

        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        return data.choices?.[0]?.message?.content || '';
      }

      case 'azure-openai': {
        const apiUrl = settings.ai_api_url;
        const apiKey = settings.ai_api_key;
        const model = settings.ai_model_name;

        if (!apiUrl || !apiKey || !model) {
          throw new Error('Azure OpenAI 配置不完整');
        }

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey,
          },
          body: JSON.stringify({
            messages,
            temperature: 0.7,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Azure OpenAI API error: ${response.status} ${errorText}`);
        }

        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        return data.choices?.[0]?.message?.content || '';
      }

      case 'anthropic': {
        const apiUrl = settings.ai_api_url || 'https://api.anthropic.com/v1/messages';
        const apiKey = settings.ai_api_key;
        const model = settings.ai_model_name || 'claude-3-5-sonnet-20240620';

        if (!apiKey) {
          throw new Error('Anthropic API key 未配置');
        }

        const systemMessage = messages.find((m) => m.role === 'system');
        const otherMessages = messages.filter((m) => m.role !== 'system');

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            messages: otherMessages,
            system: systemMessage?.content,
            max_tokens: 4096,
            temperature: 0.7,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
        }

        const data = (await response.json()) as {
          content?: Array<{ text?: string }>;
        };
        return data.content?.[0]?.text || '';
      }

      default:
        const apiKey = settings.ai_api_key;
        const model = settings.ai_model_name;
        const customProviderName =
          settings.custom_ai_providers
            ?.find((p) => p.id === settings.ai_provider)
            ?.name?.toLowerCase() || '';

        if (!apiKey) {
          throw new Error('API key 未配置');
        }

        // 检测是否是 Gemini API
        const isGemini =
          customProviderName.includes('gemini') ||
          (model && model.toLowerCase().includes('gemini')) ||
          (settings.ai_api_url &&
            settings.ai_api_url.includes('generativelanguage.googleapis.com'));

        if (isGemini) {
          // Gemini API 格式
          const geminiModel = model || 'gemini-1.5-flash';
          const apiUrl =
            settings.ai_api_url ||
            `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`;

          // 转换消息格式
          const geminiContents = messages.map((msg) => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }],
          }));

          const response = await fetch(`${apiUrl}?key=${apiKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: geminiContents,
              generationConfig: {
                temperature: 0.7,
              },
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error: ${response.status} ${errorText}`);
          }

          const data = (await response.json()) as {
            candidates?: Array<{
              content?: {
                parts?: Array<{ text?: string }>;
              };
            }>;
          };
          return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } else {
          // 对于其他自定义提供商，使用 OpenAI 兼容的 API 格式
          const apiUrl = settings.ai_api_url || 'https://api.openai.com/v1/chat/completions';
          const openaiModel = model || 'gpt-4o';

          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: openaiModel,
              messages,
              temperature: 0.7,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`AI API error: ${response.status} ${errorText}`);
          }

          const data = (await response.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          return data.choices?.[0]?.message?.content || '';
        }
    }
  }

  async generateMessage(request: AIGenerateRequest): Promise<AIGenerateResponse> {
    try {
      let settings: UserSettings = {
        ai_enabled: true,
        ai_provider: 'workers-ai',
        ai_model_name: '@cf/meta/llama-3.3-8b-instruct',
        ai_api_key: '',
        ai_api_url: '',
      };

      // 如果有用户 ID，尝试获取用户设置
      if (request.userId) {
        const { UserService } = await import('./userService');
        const userService = new UserService(this.env);
        settings = await userService.getUserSettings(request.userId);
      }

      if (!this.isAvailable(settings)) {
        return { success: false, message: 'AI 服务不可用，请先配置 AI' };
      }

      const { prompt, type = 'both', language = 'zh' } = request;
      const systemPrompt = this.buildSystemPrompt(type, language);
      const userPrompt = this.buildUserPrompt(prompt, type);

      const aiContent = await this.callAI(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        settings
      );

      const result = this.parseAIResponse(aiContent, type);

      return { ...result, success: true };
    } catch (error) {
      console.error('[AI Service] Error generating message:', error);
      return { success: false, message: `AI 生成失败: ${(error as Error).message}` };
    }
  }

  async executeCommand(request: AIExecuteRequest): Promise<AIExecuteResponse> {
    try {
      const { UserService } = await import('./userService');
      const userService = new UserService(this.env);
      const settings = await userService.getUserSettings(request.userId);

      if (!this.isAvailable(settings)) {
        return { success: false, result: 'AI 服务不可用', error: '请先配置 AI' };
      }

      const { query, userId, username } = request;

      // 获取用户配置的 AI 工具
      const userTools = userService.getUserAITools(settings);
      const tools = userTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      }));

      // 如果没有可用工具，返回提示
      if (tools.length === 0) {
        console.warn('[AI Service] 没有可用的 AI 工具');
        return { 
          success: false, 
          result: '没有可用的工具，请联系管理员配置 AI 工具', 
          error: '工具列表为空' 
        };
      }

      const systemPrompt = this.buildToolSystemPrompt(tools);

      console.log('[AI Service] === 开始 AI 命令执行 ===');
      console.log('[AI Service] 查询:', query);
      console.log('[AI Service] 提供商:', settings.ai_provider);
      console.log('[AI Service] 模型:', settings.ai_model_name);
      console.log('[AI Service] 可用工具:', tools.map((t) => t.name));

      const aiContent = await this.callAI(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query },
        ],
        settings
      );

      console.log('[AI Service] === 收到 AI 响应 ===');
      console.log('[AI Service] 原始响应:', aiContent);

      const toolCall = this.parseToolCall(aiContent);

      if (toolCall) {
        console.log('[AI Service] 解析成功，工具调用:', toolCall.tool, toolCall.params);
        const result = await this.executeTool(toolCall, userId, username);
        console.log('[AI Service] 工具执行结果:', result);
        return result;
      } else {
        console.log('[AI Service] 未解析到工具调用，AI 可能直接回复');
        // 检查是否是对话性回复而非工具调用
        if (aiContent.length > 0 && aiContent.length < 200) {
          return { success: true, result: aiContent };
        }
        return { 
          success: false, 
          result: '无法理解您的请求，请尝试更明确的表达', 
          error: '未识别到有效的工具调用' 
        };
      }
    } catch (error) {
      console.error('[AI Service] 执行命令时发生错误:', error);
      return { success: false, result: '执行命令时发生错误', error: (error as Error).message };
    }
  }

  private buildToolSystemPrompt(tools: unknown[]): string {
    const toolsList = tools
      .map((t) => `- ${(t as any).name}: ${(t as any).description}`)
      .join('\n');
    return `你是一个推送服务助手，帮助用户管理模板、分组、定时任务等。

可用工具：
${toolsList}

重要规则：
1. 当用户询问"列出"、"查询"、"获取"、"展示"、"显示"、"创建"、"新建"、"备份"、"执行"时，必须调用对应的工具
2. 只需要调用一个工具，不要多个
3. 严格输出纯JSON格式，不要任何解释，不要markdown代码块：
   {"tool":"listTemplates","params":{}}
4. 如果用户询问的内容没有对应的工具，用中文简单回复
5. 工具返回的是数据，不是让你再调工具
6. 不要输出多余的文字，只输出JSON或简短对话
7. 不要在JSON前后加任何文字`;
  }

  private parseToolCall(content: string): { tool: string; params: Record<string, unknown> } | null {
    try {
      if (!content || !content.trim()) {
        return null;
      }

      const knownTools = [
        'listTemplates',
        'createTemplate',
        'listGroups',
        'createGroup',
        'listScheduledTasks',
        'runBackup',
        'listChannels',
      ];

      const trimmedContent = content.trim();

      // --- 方式 0: 工具名 + 空格 + 空对象格式 (如 "listChannels {}") ---
      const spaceBraceMatch = trimmedContent.match(/^(\w+)\s*(\{\s*\})\s*$/);
      if (spaceBraceMatch) {
        const lowerTool = spaceBraceMatch[1].toLowerCase();
        const matched = knownTools.find((t) => t.toLowerCase() === lowerTool);
        if (matched) {
          return { tool: matched, params: {} };
        }
      }

      // --- 方式 1: 精确工具名匹配 ---
      if (/^\w+$/.test(trimmedContent)) {
        const lowerTool = trimmedContent.toLowerCase();
        const matched = knownTools.find((t) => t.toLowerCase() === lowerTool);
        if (matched) {
          return { tool: matched, params: {} };
        }
      }

      // --- 方式 2: 带中文前缀的工具名（如 "调用工具：listTemplates"、"工具调用：listTemplates"、"执行listTemplates"）---
      const prefixMatch = trimmedContent.match(/^(?:调用工具|工具调用|工具|tool|调用|执行)\s*[:：]?\s*(\w+)\s*[：:]?.*$/i);
      if (prefixMatch) {
        const lowerTool = prefixMatch[1].toLowerCase();
        const matched = knownTools.find((t) => t.toLowerCase() === lowerTool);
        if (matched) {
          return { tool: matched, params: {} };
        }
      }

      // --- 方式 3: 带冒号的工具名 + JSON (如 "listTemplates: {...}") ---
      const colonJsonMatch = trimmedContent.match(/^(\w+)\s*[:：]\s*(\{[\s\S]*\})\s*$/);
      if (colonJsonMatch) {
        const toolName = colonJsonMatch[1];
        let params = {};
        try {
          params = JSON.parse(colonJsonMatch[2]);
        } catch {
        }
        const lowerTool = toolName.toLowerCase();
        const matched = knownTools.find((t) => t.toLowerCase() === lowerTool);
        if (matched) {
          return { tool: matched, params };
        }
        return { tool: toolName, params };
      }

      // --- 方式 4: 带冒号的工具名 + 文本描述 (如 "listTemplates: 所有模板") ---
      const colonTextMatch = trimmedContent.match(/^(\w+)\s*[:：]\s*([^\n{][^\n]*)$/);
      if (colonTextMatch) {
        const lowerTool = colonTextMatch[1].toLowerCase();
        const matched = knownTools.find((t) => t.toLowerCase() === lowerTool);
        if (matched) {
          return { tool: matched, params: {} };
        }
      }

      // --- 方式 5: 纯冒号后缀工具名 (如 "listTemplates:") ---
      const colonOnlyMatch = trimmedContent.match(/^(\w+)\s*[:：]\s*$/);
      if (colonOnlyMatch) {
        const lowerTool = colonOnlyMatch[1].toLowerCase();
        const matched = knownTools.find((t) => t.toLowerCase() === lowerTool);
        if (matched) {
          return { tool: matched, params: {} };
        }
      }

      // --- 方式 6: JSON 格式解析 ---
      let jsonStr = null;
      const jsonObjectMatch = trimmedContent.match(/\{[\s\S]*\}/);
      if (jsonObjectMatch) {
        jsonStr = jsonObjectMatch[0];
      }

      if (!jsonStr && trimmedContent.includes('```')) {
        const codeBlockMatch = trimmedContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
        if (codeBlockMatch) {
          jsonStr = codeBlockMatch[1];
        }
      }

      // --- 方式 7: 工具名+空花括号紧凑格式 (如 "listChannels{}") ---
      if (!jsonStr) {
        const compactBraceMatch = trimmedContent.match(/^(\w+)(\{\})$/);
        if (compactBraceMatch) {
          const lowerTool = compactBraceMatch[1].toLowerCase();
          const matched = knownTools.find((t) => t.toLowerCase() === lowerTool);
          if (matched) {
            return { tool: matched, params: {} };
          }
        }
      }

      // --- 方式 8: 如果没有 JSON，则使用关键词模糊匹配 ---
      if (!jsonStr) {
        const lowerContent = trimmedContent.toLowerCase();

        // 模板相关
        if (
          lowerContent.includes('模板') ||
          lowerContent.includes('template') ||
          lowerContent.includes('templates')
        ) {
          if (lowerContent.includes('创建') || lowerContent.includes('新建') || lowerContent.includes('create')) {
            // 从内容中尝试提取参数
            const params: Record<string, unknown> = {};
            const nameMatch = trimmedContent.match(/(?:模板|template)[^，。,\n]*?[：:"']([^，。,\n"']+)[："']?/i);
            if (nameMatch) {
              params.name = nameMatch[1].trim();
            }
            const titleMatch = trimmedContent.match(/(?:标题|title)[^，。,\n]*?[：:"']([^，。,\n"']+)[："']?/i);
            if (titleMatch) {
              params.title = titleMatch[1].trim();
            }
            const contentMatch = trimmedContent.match(/(?:内容|content)[^，。,\n]*?[：:"']([^，。,\n"']+)[："']?/i);
            if (contentMatch) {
              params.content = contentMatch[1].trim();
            }
            return { tool: 'createTemplate', params };
          }
          return { tool: 'listTemplates', params: {} };
        }

        // 分组相关
        if (lowerContent.includes('分组') || lowerContent.includes('group') || lowerContent.includes('groups')) {
          if (lowerContent.includes('创建') || lowerContent.includes('新建') || lowerContent.includes('create')) {
            const params: Record<string, unknown> = {};
            const nameMatch = trimmedContent.match(/(?:分组|group)[^，。,\n]*?[：:"']([^，。,\n"']+)[："']?/i);
            if (nameMatch) {
              params.name = nameMatch[1].trim();
            } else {
              params.name = '默认分组';
            }
            params.channels = [];
            return { tool: 'createGroup', params };
          }
          return { tool: 'listGroups', params: {} };
        }

        // 定时任务相关
        if (
          lowerContent.includes('定时') ||
          lowerContent.includes('scheduled') ||
          lowerContent.includes('定时任务') ||
          lowerContent.includes('定时推送') ||
          lowerContent.includes('任务列表')
        ) {
          return { tool: 'listScheduledTasks', params: {} };
        }

        // 渠道相关
        if (lowerContent.includes('渠道') || lowerContent.includes('channel') || lowerContent.includes('channels')) {
          return { tool: 'listChannels', params: {} };
        }

        // 备份相关
        if (
          lowerContent.includes('备份') ||
          lowerContent.includes('backup') ||
          lowerContent.includes('back up')
        ) {
          return { tool: 'runBackup', params: {} };
        }

        // 没有匹配到工具
        return null;
      }

      // --- 方式 9: 解析 JSON 对象 ---
      let parsed: any;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        // JSON 解析失败，尝试清理一下
        try {
          // 去除可能的注释和尾随逗号等问题
          const cleaned = jsonStr
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/[^\n]*/g, '')
            .replace(/,(\s*[}\]])/g, '$1');
          parsed = JSON.parse(cleaned);
        } catch {
          return null;
        }
      }

      // 9a: 标准格式: {"tool": "...", "params": {...}}
      if (parsed.tool) {
        const toolName = String(parsed.tool);
        const matchedTool =
          knownTools.find((t) => t.toLowerCase() === toolName.toLowerCase()) || toolName;
        return {
          tool: matchedTool,
          params: parsed.params || {},
        };
      }

      // 9b: OpenAI 风格: {"name": "...", "arguments": {...}}
      if (parsed.name) {
        const toolName = String(parsed.name);
        const matchedTool =
          knownTools.find((t) => t.toLowerCase() === toolName.toLowerCase()) || toolName;
        return {
          tool: matchedTool,
          params: parsed.arguments || {},
        };
      }

      // 9c: function_name 风格: {"function_name": "...", "parameters": {...}}
      if (parsed.function_name) {
        const toolName = String(parsed.function_name);
        const matchedTool =
          knownTools.find((t) => t.toLowerCase() === toolName.toLowerCase()) || toolName;
        return {
          tool: matchedTool,
          params: parsed.parameters || {},
        };
      }

      // 9d: LangChain 风格: {"action": "...", "action_input": {...}}
      if (parsed.action) {
        const toolName = String(parsed.action);
        const matchedTool =
          knownTools.find((t) => t.toLowerCase() === toolName.toLowerCase()) || toolName;
        return {
          tool: matchedTool,
          params: parsed.action_input || {},
        };
      }

      // 9e: workers-ai 风格: {"tools": [{"Name": "listTemplates", "params": {}}]}
      if (parsed.tools && Array.isArray(parsed.tools) && parsed.tools.length > 0) {
        const toolCall = parsed.tools[0];
        const rawName = toolCall.Name || toolCall.name;
        if (rawName) {
          const toolName = String(rawName);
          const matchedTool =
            knownTools.find((t) => t.toLowerCase() === toolName.toLowerCase()) || toolName;
          return {
            tool: matchedTool,
            params: toolCall.params || {},
          };
        }
      }

      // 9f: tools 数组简写格式: {"tools": ["listTemplates"]}
      if (parsed.tools && Array.isArray(parsed.tools) && typeof parsed.tools[0] === 'string') {
        const toolName = String(parsed.tools[0]);
        const matchedTool =
          knownTools.find((t) => t.toLowerCase() === toolName.toLowerCase()) || toolName;
        return {
          tool: matchedTool,
          params: {},
        };
      }

      // 9g: 数组格式: [{"tool": "...", "params": {...}}]
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].tool) {
        const firstCall = parsed[0];
        const toolName = String(firstCall.tool);
        const matchedTool =
          knownTools.find((t) => t.toLowerCase() === toolName.toLowerCase()) || toolName;
        return {
          tool: matchedTool,
          params: firstCall.params || {},
        };
      }

      return null;
    } catch (error) {
      console.error('[AI Service] 解析工具调用失败:', error, '原始内容:', content);
      return null;
    }
  }

  private async executeTool(
    toolCall: { tool: string; params: Record<string, unknown> },
    userId: string,
    username: string
  ): Promise<AIExecuteResponse> {
    const { tool, params } = toolCall;

    // 使用 username（email）作为数据库 user_id 字段的查询条件，确保数据正确查询
    const pushService = new PushService(this.env, username);

    switch (tool) {
      case 'createTemplate': {
        const templateName = params.name || '新模板';
        const templateTitle = params.title || '通知标题';
        const templateContent = params.content || '通知内容';
        const result = await pushService.saveTemplate({
          name: String(templateName),
          title: String(templateTitle),
          content: String(templateContent),
          url: String(params.url || ''),
          category: String(params.category || ''),
        });
        return { success: true, result: `模板 "${templateName}" 创建成功`, data: result };
      }

      case 'listTemplates': {
        const templates = await pushService.getTemplates();
        return { success: true, result: `共找到 ${templates.length} 个模板`, data: templates };
      }

      case 'createGroup': {
        const groupName = params.name || '新分组';
        const channels = (
          Array.isArray(params.channels)
            ? params.channels.map(String)
            : String(params.channels || '')
                .split(',')
                .filter(Boolean)
        ) as PushChannel[];
        const result = await pushService.saveChannelGroup({
          name: String(groupName),
          channels,
        });
        return { success: true, result: `分组 "${groupName}" 创建成功`, data: result };
      }

      case 'listGroups': {
        const groups = await pushService.getChannelGroups();
        return { success: true, result: `共找到 ${groups.length} 个分组`, data: groups };
      }

      case 'deleteGroup': {
        const result = await pushService.deleteChannelGroup(String(params.id));
        return result
          ? { success: true, result: '分组删除成功' }
          : { success: false, result: '分组删除失败，可能不存在' };
      }

      case 'listScheduledTasks': {
        const tasks = await pushService.getScheduledPushes();
        return { success: true, result: `共找到 ${tasks.length} 个定时任务`, data: tasks };
      }

      case 'runBackup': {
        // runBackup 需要 username 用于存储路径
        const result = await executeAllBackups(this.env, username);
        const successCount = result.filter((r: { success: boolean }) => r.success).length;
        const failCount = result.length - successCount;
        return {
          success: true,
          result: `备份完成：成功 ${successCount} 个，失败 ${failCount} 个`,
          data: result,
        };
      }

      case 'listChannels': {
        const settings = await loadUserChannelSettings(username, this.env);
        const channels = CHANNEL_DEFINITIONS.map((ch) => {
          const channelPrefix = `channel:${ch.id}:`;
          const isConfigured = Object.keys(settings).some((key) => key.startsWith(channelPrefix));
          return {
            id: ch.id,
            name: ch.name,
            icon: ch.icon,
            enabled: isConfigured,
          };
        });
        return { success: true, result: `共找到 ${channels.length} 个渠道`, data: channels };
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
