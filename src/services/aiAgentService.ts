// ============================================
// AI Agent 服务
// 自动分析用户意图并执行多步任务
// ============================================
import type { Env, PushChannel } from '../types';
import { PushService } from './push';
import { AIService } from './aiService';
import { UserService } from './userService';
import { loadUserChannelSettings, CHANNEL_DEFINITIONS, dispatchPushWithOptions } from './dispatcher';
import { getPushHistory } from './dispatcher';

interface AgentStep {
  action: string;
  params: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

interface AgentResponse {
  success: boolean;
  thinking: string;
  steps: AgentStep[];
  result: string;
}

/**
 * AI Agent 服务 - 自动分析并执行任务
 */
export class AIAgentService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * 执行用户请求
   */
  async execute(request: { query: string; userId: string; username: string }): Promise<AgentResponse> {
    const { query, userId, username } = request;
    const steps: AgentStep[] = [];

    try {
      // 1. 分析用户意图
      const intent = await this.analyzeIntent(query, userId);
      steps.push({ action: 'analyze_intent', params: { query }, result: intent });

      // 2. 根据意图执行任务
      const result = await this.executeIntent(intent, userId, username, steps);

      return {
        success: true,
        thinking: `理解了您的需求：${intent.description}`,
        steps,
        result,
      };
    } catch (error) {
      return {
        success: false,
        thinking: '处理请求时遇到问题',
        steps,
        result: `错误：${(error as Error).message}`,
      };
    }
  }

  /**
   * 分析用户意图
   */
  private async analyzeIntent(query: string, userId: string): Promise<{
    type: string;
    description: string;
    action: string;
    params: Record<string, unknown>;
  }> {
    const aiService = new AIService(this.env);
    const userService = new UserService(this.env);
    const settings = await userService.getUserSettings(userId);

    const systemPrompt = `你是一个任务分析助手。分析用户请求，返回JSON格式的意图。

可用操作类型：
1. push - 发送推送消息
2. query - 查询数据（历史、统计等）
3. create - 创建（模板、分组、定时任务）
4. manage - 管理（启用/禁用、删除等）
5. info - 获取信息（渠道状态、系统状态等）

输出格式（纯JSON，不要markdown）：
{"type":"操作类型","description":"简短描述","action":"具体动作","params":{...}}

示例：
- "发送一条测试消息" → {"type":"push","description":"发送测试推送","action":"sendTest","params":{}}
- "查看最近的推送历史" → {"type":"query","description":"查询推送历史","action":"getHistory","params":{"limit":10}}
- "统计推送成功率" → {"type":"query","description":"获取推送统计","action":"getStats","params":{}}
- "有哪些渠道" → {"type":"info","description":"查询渠道列表","action":"listChannels","params":{}}
- "创建一个每日早报模板" → {"type":"create","description":"创建推送模板","action":"createTemplate","params":{"name":"每日早报"}}`;

    try {
      const response = await aiService['callAI'](
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query },
        ],
        settings
      );

      // 解析JSON响应
      const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return parsed;
    } catch {
      // 解析失败，返回默认意图
      return {
        type: 'unknown',
        description: query,
        action: 'unknown',
        params: { query },
      };
    }
  }

  /**
   * 根据意图执行任务
   */
  private async executeIntent(
    intent: { type: string; action: string; params: Record<string, unknown> },
    userId: string,
    username: string,
    steps: AgentStep[]
  ): Promise<string> {
    const pushService = new PushService(this.env, userId);

    switch (intent.type) {
      case 'push':
        return await this.executePushIntent(intent, userId, username, steps);

      case 'query':
        return await this.executeQueryIntent(intent, userId, steps, pushService);

      case 'info':
        return await this.executeInfoIntent(intent, userId, steps);

      case 'create':
        return await this.executeCreateIntent(intent, userId, steps, pushService);

      default:
        return `抱歉，我无法理解这个请求。您可以尝试：
- "发送测试消息到企业微信"
- "查看最近10条推送记录"
- "查看推送统计"
- "有哪些可用渠道"`;
    }
  }

  /**
   * 执行推送任务
   */
  private async executePushIntent(
    intent: { action: string; params: Record<string, unknown> },
    userId: string,
    username: string,
    steps: AgentStep[]
  ): Promise<string> {
    // 发送测试消息
    const channels = (intent.params.channels as PushChannel[]) || ['wework'];
    const title = (intent.params.title as string) || '测试消息';
    const body = (intent.params.body as string) || '这是一条来自 AI Agent 的测试消息';

    const step: AgentStep = {
      action: 'send_push',
      params: { channels, title, body },
    };

    try {
      const results = await dispatchPushWithOptions(
        { title, body },
        channels,
        username,
        this.env
      );

      step.result = results;
      steps.push(step);

      const successCount = results.filter((r) => r.success).length;
      return `已发送消息到 ${successCount}/${channels.length} 个渠道`;
    } catch (error) {
      step.error = (error as Error).message;
      steps.push(step);
      return `发送失败：${(error as Error).message}`;
    }
  }

  /**
   * 执行查询任务
   */
  private async executeQueryIntent(
    intent: { action: string; params: Record<string, unknown> },
    userId: string,
    steps: AgentStep[],
    pushService: PushService
  ): Promise<string> {
    switch (intent.action) {
      case 'getHistory': {
        const limit = (intent.params.limit as number) || 10;
        const step: AgentStep = { action: 'get_history', params: { limit } };

        try {
          const { records } = await getPushHistory(userId, this.env, { pageSize: limit });
          step.result = records;
          steps.push(step);

          if (records.length === 0) return '暂无推送记录';

          const summary = records.slice(0, 5).map((r, i) =>
            `${i + 1}. ${r.title} (${new Date(r.createdAt).toLocaleString('zh-CN')}) - ${r.status}`
          ).join('\n');
          return `最近 ${records.length} 条推送记录：\n${summary}`;
        } catch (error) {
          step.error = (error as Error).message;
          steps.push(step);
          return `查询失败：${(error as Error).message}`;
        }
      }

      case 'getStats': {
        const step: AgentStep = { action: 'get_stats', params: {} };
        try {
          const stats = await pushService.getPushStats();
          step.result = stats;
          steps.push(step);

          const { session } = stats;
          const rate = session.total > 0 ? ((session.success / session.total) * 100).toFixed(1) : '0';
          return `推送统计：
- 总推送：${session.total}
- 成功：${session.success}
- 失败：${session.failed}
- 成功率：${rate}%`;
        } catch (error) {
          step.error = (error as Error).message;
          steps.push(step);
          return `获取统计失败：${(error as Error).message}`;
        }
      }

      case 'listScheduled': {
        const step: AgentStep = { action: 'list_scheduled', params: {} };
        try {
          const pushes = await pushService.getScheduledPushes('pending');
          step.result = pushes;
          steps.push(step);

          if (pushes.length === 0) return '暂无待执行的定时任务';

          const summary = pushes.slice(0, 5).map((p, i) =>
            `${i + 1}. ${p.title} - 下次执行：${new Date(p.scheduledAt).toLocaleString('zh-CN')}`
          ).join('\n');
          return `待执行的定时任务（${pushes.length}个）：\n${summary}`;
        } catch (error) {
          step.error = (error as Error).message;
          steps.push(step);
          return `查询失败：${(error as Error).message}`;
        }
      }

      default:
        return '未知的查询操作';
    }
  }

  /**
   * 执行信息查询任务
   */
  private async executeInfoIntent(
    intent: { action: string; params: Record<string, unknown> },
    userId: string,
    steps: AgentStep[]
  ): Promise<string> {
    switch (intent.action) {
      case 'listChannels': {
        const step: AgentStep = { action: 'list_channels', params: {} };
        try {
          const settings = await loadUserChannelSettings(userId, this.env);
          step.result = settings;
          steps.push(step);

          const channels = CHANNEL_DEFINITIONS.map((ch) => {
            const enabled = settings[`channel:${ch.id}:enabled`] !== 'false';
            return `${enabled ? '✅' : '❌'} ${ch.name} (${ch.id})`;
          }).join('\n');

          return `可用渠道：\n${channels}`;
        } catch (error) {
          step.error = (error as Error).message;
          steps.push(step);
          return `获取渠道失败：${(error as Error).message}`;
        }
      }

      default:
        return '未知的信息查询操作';
    }
  }

  /**
   * 执行创建任务
   */
  private async executeCreateIntent(
    intent: { action: string; params: Record<string, unknown> },
    userId: string,
    steps: AgentStep[],
    pushService: PushService
  ): Promise<string> {
    switch (intent.action) {
      case 'createTemplate': {
        const name = (intent.params.name as string) || '新模板';
        const step: AgentStep = { action: 'create_template', params: { name } };

        try {
          const template = await pushService.saveTemplate({
            name,
            title: name,
            content: '请编辑模板内容',
            channels: ['wework'],
          });
          step.result = template;
          steps.push(step);
          return `已创建模板：${template.name}`;
        } catch (error) {
          step.error = (error as Error).message;
          steps.push(step);
          return `创建失败：${(error as Error).message}`;
        }
      }

      default:
        return '未知的创建操作';
    }
  }
}
