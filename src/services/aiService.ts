// ============================================
// AI 服务
// 处理 Workers AI 相关功能，支持消息生成和工具调用
// ============================================
import type { Env, PushChannel } from '../types';
import { PushService } from './push';
import { executeAllBackups } from './backup';
import { loadUserChannelSettings, CHANNEL_DEFINITIONS } from './dispatcher';
import type { UserSettings } from './userService';

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
        const model = settings.ai_model_name || '@cf/meta/llama-3.1-8b-instruct';
        const response = await this.env.AI.run(model, { messages });
        return response.response || '';
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
        const customProviderName = settings.custom_ai_providers?.find(
          p => p.id === settings.ai_provider
        )?.name?.toLowerCase() || '';

        if (!apiKey) {
          throw new Error('API key 未配置');
        }

        // 检测是否是 Gemini API
        const isGemini = customProviderName.includes('gemini') || 
                         (model && model.toLowerCase().includes('gemini')) ||
                         (settings.ai_api_url && settings.ai_api_url.includes('generativelanguage.googleapis.com'));

        if (isGemini) {
          // Gemini API 格式
          const geminiModel = model || 'gemini-1.5-flash';
          const apiUrl = settings.ai_api_url || `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`;
          
          // 转换消息格式
          const geminiContents = messages.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
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
              }
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error: ${response.status} ${errorText}`);
          }

          const data = (await response.json()) as {
            candidates?: Array<{
              content?: {
                parts?: Array<{ text?: string }>
              }
            }>
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
        ai_model_name: '@cf/meta/llama-3.1-8b-instruct',
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
      const tools = this.getAvailableTools();
      const systemPrompt = this.buildToolSystemPrompt(tools);

      const aiContent = await this.callAI(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query },
        ],
        settings
      );

      console.log('[AI Service] === 收到 AI 响应 ===');
      console.log('[AI Service] 提供商:', settings.ai_provider);
      console.log('[AI Service] 模型:', settings.ai_model_name);
      console.log('[AI Service] 原始响应:', aiContent);

      const toolCall = this.parseToolCall(aiContent);

      if (toolCall) {
        console.log('[AI Service] 解析成功，工具调用:', toolCall);
        const result = await this.executeTool(toolCall, userId, username);
        console.log('[AI Service] 工具执行结果:', result);
        return result;
      } else {
        console.log('[AI Service] 未解析到工具调用，直接返回 AI 响应');
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
        name: 'listTemplates',
        description: '获取模板列表',
        parameters: [],
      },
      {
        name: 'createGroup',
        description: '创建渠道分组',
        parameters: [
          { name: 'name', type: 'string', description: '分组名称', required: true },
          {
            name: 'channels',
            type: 'string[]',
            description: '渠道列表，用逗号分隔',
            required: true,
          },
        ],
      },
      {
        name: 'listGroups',
        description: '获取分组列表',
        parameters: [],
      },
      {
        name: 'deleteGroup',
        description: '删除分组',
        parameters: [{ name: 'id', type: 'string', description: '分组ID', required: true }],
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
        description: '获取已配置的渠道列表',
        parameters: [],
      },
    ];
  }

  private buildToolSystemPrompt(tools: unknown[]): string {
    return `你是一个智能助手，可以帮助用户管理推送服务。你可以调用以下工具来执行操作：

可用工具：
${JSON.stringify(tools, null, 2)}

=== 工具调用规则 ===
当用户请求执行某个操作时，请严格按照以下步骤：

1. 分析用户意图，判断需要调用哪个工具
2. 如果需要调用工具，**只输出**如下格式的 JSON，不要有任何其他文本：
   {"tool":"工具名称","params":{"参数名":"参数值"}}

3. 如果不需要调用工具（如回答问题、聊天），直接用自然语言回复用户

请用中文回答用户问题。

=== 重要注意事项 ===
- 工具名称必须完全匹配列表中的名称
- 参数名必须完全匹配
- 工具调用必须是纯 JSON，不要用 markdown 包裹，不要有任何解释性文本
- 如果需要调用 listTemplates，params 应该是空对象 {}
- 如果没有合适的工具或无法理解请求，直接用自然语言回复
`;
  }

  private parseToolCall(content: string): { tool: string; params: Record<string, unknown> } | null {
    try {
      // 方式1: 尝试解析简单的 "工具名 {}" 格式
      const simpleMatch = content.match(/^\s*(\w+)\s*(\{[\s\S]*\})?\s*$/);
      if (simpleMatch) {
        const toolName = simpleMatch[1];
        let params = {};
        
        if (simpleMatch[2]) {
          try {
            params = JSON.parse(simpleMatch[2]);
          } catch {
            // 如果参数解析失败，就用空对象
          }
        }
        
        return { tool: toolName, params };
      }
      
      // 方式2: 尝试多种 JSON 提取方式
      let jsonStr = null;
      
      // 方式2a: 直接匹配整个 JSON 对象
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      } 
      // 方式2b: 尝试匹配 markdown 代码块中的 JSON
      else if (content.includes('```')) {
        const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (codeBlockMatch) {
          jsonStr = codeBlockMatch[1];
        }
      }
      
      if (!jsonStr) {
        return null;
      }
      
      const parsed = JSON.parse(jsonStr);
      
      // 兼容多种 JSON 格式
      if (parsed.tool) {
        return { 
          tool: parsed.tool, 
          params: parsed.params || {} 
        };
      } else if (parsed.name) {
        // 兼容 OpenAI 风格的工具调用格式
        return { 
          tool: parsed.name, 
          params: parsed.arguments || {} 
        };
      } else if (parsed.function_name) {
        // 兼容另一种常见格式
        return { 
          tool: parsed.function_name, 
          params: parsed.parameters || {} 
        };
      } else if (parsed.action) {
        // 兼容 LangChain 风格
        return { 
          tool: parsed.action, 
          params: parsed.action_input || {} 
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
    const pushService = new PushService(this.env, username);

    switch (tool) {
      case 'createTemplate': {
        const result = await pushService.saveTemplate({
          name: String(params.name),
          title: String(params.title),
          content: String(params.content || ''),
          url: String(params.url || ''),
          category: String(params.category || ''),
        });
        return { success: true, result: `模板 "${params.name}" 创建成功`, data: result };
      }

      case 'listTemplates': {
        const templates = await pushService.getTemplates();
        return { success: true, result: `共找到 ${templates.length} 个模板`, data: templates };
      }

      case 'createGroup': {
        const channels = (
          Array.isArray(params.channels)
            ? params.channels.map(String)
            : String(params.channels || '')
                .split(',')
                .filter(Boolean)
        ) as PushChannel[];
        const result = await pushService.saveChannelGroup({
          name: String(params.name),
          channels,
        });
        return { success: true, result: `分组 "${params.name}" 创建成功`, data: result };
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
