// ============================================
// AI 响应解析策略 - 通用设计方案
// ============================================

// 1. 标准化响应接口
export interface AIResponse {
  content: string;
  toolCalls?: Array<{
    tool: string;
    params: Record<string, unknown>;
  }>;
  finishReason?: string;
}

// 2. 响应解析策略接口
export interface AIResponseParser {
  provider: string;
  parse(response: unknown): AIResponse;
}

// 3. 具体解析策略实现

export class WorkerAIResponseParser implements AIResponseParser {
  provider = 'workers-ai';

  parse(response: unknown): AIResponse {
    if (typeof response === 'string') {
      return { content: response };
    }

    const obj = response as Record<string, unknown>;

    if (obj.response && typeof obj.response === 'string') {
      return { content: obj.response };
    }

    if (obj.response && typeof obj.response === 'object') {
      const inner = obj.response as Record<string, unknown>;
      if (inner.choices && Array.isArray(inner.choices)) {
        const choice = inner.choices[0] as Record<string, unknown>;
        const message = choice.message as Record<string, unknown>;
        if (message && message.content) {
          return { content: String(message.content) };
        }
      }
      return { content: JSON.stringify(inner) };
    }

    if (obj.choices && Array.isArray(obj.choices)) {
      const choice = obj.choices[0] as Record<string, unknown>;
      const message = choice.message as Record<string, unknown>;
      if (message && message.content) {
        return { content: String(message.content) };
      }
    }

    if (obj.tools && Array.isArray(obj.tools)) {
      const toolCalls: Array<{ tool: string; params: Record<string, unknown> }> = [];
      for (const t of obj.tools) {
        const tool = t as Record<string, unknown>;
        const toolName = String(tool.Name || tool.name || '');
        if (toolName) {
          toolCalls.push({
            tool: toolName,
            params: (tool.params as Record<string, unknown>) || {},
          });
        }
      }
      return { content: '', toolCalls };
    }

    return { content: typeof response === 'object' ? JSON.stringify(response) : String(response) };
  }
}

export class OpenAIResponseParser implements AIResponseParser {
  provider = 'openai';

  parse(response: unknown): AIResponse {
    const obj = response as Record<string, unknown>;

    if (obj.choices && Array.isArray(obj.choices)) {
      const choice = obj.choices[0] as Record<string, unknown>;
      const message = choice.message as Record<string, unknown>;

      if (message && message.tool_calls && Array.isArray(message.tool_calls)) {
        const toolCalls: Array<{ tool: string; params: Record<string, unknown> }> = [];
        for (const tc of message.tool_calls) {
          const toolCall = tc as Record<string, unknown>;
          const func = toolCall.function as Record<string, unknown>;
          const toolName = String(func.name || '');
          if (toolName) {
            let params: Record<string, unknown> = {};
            if (func.arguments && typeof func.arguments === 'string') {
              try {
                params = JSON.parse(func.arguments);
              } catch {
                params = {};
              }
            }
            toolCalls.push({ tool: toolName, params });
          }
        }
        return { content: '', toolCalls, finishReason: String(choice.finish_reason || '') };
      }

      if (message && message.content) {
        return {
          content: String(message.content),
          finishReason: String(choice.finish_reason || ''),
        };
      }
    }

    return { content: typeof response === 'object' ? JSON.stringify(response) : String(response) };
  }
}

export class AnthropicResponseParser implements AIResponseParser {
  provider = 'anthropic';

  parse(response: unknown): AIResponse {
    const obj = response as Record<string, unknown>;

    if (obj.content && Array.isArray(obj.content)) {
      const textParts: string[] = [];
      for (const c of obj.content) {
        const contentItem = c as Record<string, unknown>;
        if (contentItem.type === 'text' && contentItem.text) {
          textParts.push(String(contentItem.text));
        }
      }
      return { content: textParts.join('\n') };
    }

    return { content: typeof response === 'object' ? JSON.stringify(response) : String(response) };
  }
}

/**
 * 通用响应解析器 - 自动检测响应格式
 * 适用于所有未知的自定义 AI 提供商
 */
export class UniversalResponseParser implements AIResponseParser {
  provider = 'universal';

  parse(response: unknown): AIResponse {
    if (typeof response === 'string') {
      return { content: response };
    }

    const obj = response as Record<string, unknown>;

    // 按优先级尝试各种格式检测

    // 1. 检测 Worker AI 格式: { response: "..." }
    if (obj.response !== undefined) {
      if (typeof obj.response === 'string') {
        return { content: obj.response };
      }
      if (typeof obj.response === 'object' && obj.response !== null) {
        // response 是对象，递归处理
        return this.parse(obj.response);
      }
    }

    // 2. 检测 OpenAI 格式: { choices: [{ message: { content: "..." } }] }
    if (obj.choices && Array.isArray(obj.choices) && obj.choices.length > 0) {
      const choice = obj.choices[0] as Record<string, unknown>;
      const message = choice.message as Record<string, unknown>;

      if (message) {
        // 检测工具调用
        if (message.tool_calls && Array.isArray(message.tool_calls)) {
          const toolCalls: Array<{ tool: string; params: Record<string, unknown> }> = [];
          for (const tc of message.tool_calls) {
            const toolCall = tc as Record<string, unknown>;
            const func = toolCall.function as Record<string, unknown>;
            if (func && func.name) {
              let params: Record<string, unknown> = {};
              if (func.arguments) {
                try {
                  params =
                    typeof func.arguments === 'string'
                      ? JSON.parse(func.arguments)
                      : (func.arguments as Record<string, unknown>);
                } catch {
                  params = {};
                }
              }
              toolCalls.push({ tool: String(func.name), params });
            }
          }
          return { content: '', toolCalls };
        }

        // 普通文本响应
        if (message.content) {
          return { content: String(message.content) };
        }
      }

      // choices[0] 可能是纯文本
      if (choice.content) {
        return { content: String(choice.content) };
      }
    }

    // 3. 检测 Anthropic 格式: { content: [{ type: "text", text: "..." }] }
    if (obj.content && Array.isArray(obj.content)) {
      const textParts: string[] = [];
      for (const c of obj.content) {
        const item = c as Record<string, unknown>;
        if (item.type === 'text' && item.text) {
          textParts.push(String(item.text));
        }
      }
      if (textParts.length > 0) {
        return { content: textParts.join('\n') };
      }
    }

    // 4. 检测 Workers AI 工具格式: { tools: [{ Name: "...", params: {} }] }
    if (obj.tools && Array.isArray(obj.tools) && obj.tools.length > 0) {
      const toolCalls: Array<{ tool: string; params: Record<string, unknown> }> = [];
      for (const t of obj.tools) {
        const tool = t as Record<string, unknown>;
        const toolName = String(tool.Name || tool.name || tool.function_name || '');
        if (toolName) {
          let params: Record<string, unknown> = {};
          if (tool.params) {
            params = tool.params as Record<string, unknown>;
          } else if (tool.arguments) {
            try {
              params =
                typeof tool.arguments === 'string'
                  ? JSON.parse(tool.arguments)
                  : (tool.arguments as Record<string, unknown>);
            } catch {
              params = {};
            }
          }
          toolCalls.push({ tool: toolName, params });
        }
      }
      if (toolCalls.length > 0) {
        return { content: '', toolCalls };
      }
    }

    // 5. 检测简单 JSON 工具格式: { tool: "...", params: {} }
    if (obj.tool && typeof obj.tool === 'string') {
      return {
        content: '',
        toolCalls: [
          {
            tool: String(obj.tool),
            params: (obj.params as Record<string, unknown>) || {},
          },
        ],
      };
    }

    // 6. 检测嵌套 response.response.response... 情况
    if (obj.response && typeof obj.response === 'object') {
      return this.parse(obj.response);
    }

    // 7. 最终兜底：转为字符串
    return { content: JSON.stringify(response) };
  }
}

export class AIResponseParserFactory {
  private parsers: AIResponseParser[] = [
    new WorkerAIResponseParser(),
    new OpenAIResponseParser(),
    new AnthropicResponseParser(),
    new UniversalResponseParser(),
  ];

  /**
   * 根据响应内容自动检测合适的解析器
   * 优先级：已知格式 > 通用解析
   */
  autoDetectParser(response: unknown): AIResponseParser {
    if (typeof response !== 'object' || response === null) {
      return new UniversalResponseParser();
    }

    const obj = response as Record<string, unknown>;

    // 检测是否是 Worker AI 格式
    if (obj.response !== undefined) {
      return new WorkerAIResponseParser();
    }

    // 检测是否是 OpenAI 格式
    if (obj.choices && Array.isArray(obj.choices)) {
      return new OpenAIResponseParser();
    }

    // 检测是否是 Anthropic 格式
    if (obj.content && Array.isArray(obj.content)) {
      return new AnthropicResponseParser();
    }

    // 其他情况使用通用解析器
    return new UniversalResponseParser();
  }

  /**
   * 根据提供商名称获取解析器
   * 未知提供商自动使用智能检测
   */
  getParser(provider: string): AIResponseParser {
    const knownProviders = ['workers-ai', 'openai', 'custom', 'anthropic', 'azure-openai'];

    if (knownProviders.includes(provider)) {
      const parser = this.parsers.find((p) => p.provider === provider);
      if (parser) {
        return parser;
      }
    }

    // 未知提供商，返回通用解析器
    return new UniversalResponseParser();
  }

  registerParser(parser: AIResponseParser): void {
    this.parsers.push(parser);
  }
}

// 5. 使用示例
// const factory = new AIResponseParserFactory();
// const parser = factory.getParser('workers-ai');
// const response = parser.parse(rawAIResponse);
//
// if (response.toolCalls?.length) {
//   // 处理工具调用
//   for (const call of response.toolCalls) {
//     executeTool(call.tool, call.params);
//   }
// } else {
//   // 处理文本响应
//   handleTextResponse(response.content);
// }
