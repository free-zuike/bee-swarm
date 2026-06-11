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
            params: (tool.params as Record<string, unknown>) || {}
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
        return { content: String(message.content), finishReason: String(choice.finish_reason || '') };
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

export class AIResponseParserFactory {
  private parsers: AIResponseParser[] = [
    new WorkerAIResponseParser(),
    new OpenAIResponseParser(),
    new AnthropicResponseParser(),
  ];
  
  getParser(provider: string): AIResponseParser {
    const parser = this.parsers.find(p => p.provider === provider);
    if (!parser) {
      return new WorkerAIResponseParser();
    }
    return parser;
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
