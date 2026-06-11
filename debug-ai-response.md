// 调试脚本：测试 Worker AI 响应格式
// 运行方式：wrangler d1 exec --command="SELECT * FROM ..." 或通过 API 调用测试

// 在 aiService.ts 中，callAI 方法的 workers-ai case 中添加以下日志：

/*
console.log('[AI Service] === Worker AI 完整响应调试 ===');
console.log('[AI Service] 响应类型:', typeof response);
console.log('[AI Service] 响应是否是数组:', Array.isArray(response));
console.log('[AI Service] 响应 keys:', Object.keys(response));
console.log('[AI Service] 完整响应:', JSON.stringify(response, null, 2));
*/

// Worker AI 可能返回的格式示例：

// 格式 1: 标准文本响应
// { response: "listTemplates" }

// 格式 2: 工具调用响应（如果模型支持）
// { tools: [{ Name: "listTemplates", params: {} }] }
// { tool_calls: [{ function: { name: "listTemplates", arguments: "{}" } }] }

// 格式 3: 可能只是纯文本
// "listTemplates"

// 格式 4: 可能包含在 choices 中
// { choices: [{ message: { content: "listTemplates" } }] }

// 格式 5: 可能包含finish_reason
// { response: "...", finish_reason: "tool-calls" }

// 请部署后在日志中查看实际的响应格式
