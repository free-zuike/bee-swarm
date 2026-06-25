// ============================================
// AI Agent 服务
// 自动分析用户意图并执行多步任务
// ============================================
import type { Env, PushChannel } from '../types';
import { PushService } from './push';
import { AIService } from './aiService';
import { UserService } from './userService';
import {
  loadUserChannelSettings,
  CHANNEL_DEFINITIONS,
  dispatchPushWithOptions,
} from './dispatcher';
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
  async execute(request: {
    query: string;
    userId: string;
    username: string;
  }): Promise<AgentResponse> {
    const { query, userId, username } = request;
    const steps: AgentStep[] = [];

    try {
      // 1. 分析用户意图
      const intent = await this.analyzeIntent(query, userId);
      steps.push({ action: 'analyze_intent', params: { query }, result: intent });

      // 2. 根据意图执行任务（传递原始查询用于渠道识别等）
      const result = await this.executeIntent(intent, userId, username, steps, query);

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
  private async analyzeIntent(
    query: string,
    userId: string
  ): Promise<{
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
1. capability - 询问能做什么、有什么功能
2. push - 发送推送消息
3. query - 查询数据（历史、统计等）
4. create - 创建（模板、分组、定时任务）
5. manage - 管理（启用/禁用、删除等）
6. info - 获取信息（渠道状态、系统状态等）

输出格式（纯JSON，不要markdown）：
{"type":"操作类型","description":"简短描述","action":"具体动作","params":{...}}

示例：
- "你可以干什么" → {"type":"capability","description":"介绍功能","action":"listCapabilities","params":{}}
- "有什么功能" → {"type":"capability","description":"介绍功能","action":"listCapabilities","params":{}}
- "发送一条测试消息" → {"type":"push","description":"发送测试推送","action":"sendTest","params":{}}
- "发送到飞书" → {"type":"push","description":"发送到飞书","action":"sendTest","params":{"channels":["feishu"]}}
- "给钉钉发消息" → {"type":"push","description":"发送到钉钉","action":"sendTest","params":{"channels":["dingtalk"]}}
- "查看最近的推送历史" → {"type":"query","description":"查询推送历史","action":"getHistory","params":{"limit":10}}
- "统计推送成功率" → {"type":"query","description":"获取推送统计","action":"getStats","params":{}}
- "有哪些渠道" → {"type":"info","description":"查询渠道列表","action":"listChannels","params":{}}
- "现在启用了哪些渠道" → {"type":"info","description":"查询渠道状态","action":"listChannels","params":{}}
- "渠道配置" → {"type":"info","description":"查询渠道配置","action":"listChannels","params":{}}
- "哪个渠道可用" → {"type":"info","description":"查询渠道状态","action":"listChannels","params":{}}
- "创建一个每日早报模板" → {"type":"create","description":"创建推送模板","action":"createTemplate","params":{"name":"每日早报"}}`;

    // 先尝试本地模式匹配（快速，不依赖AI）
    const localMatch = this.matchLocalPatterns(query);
    if (localMatch) {
      return localMatch;
    }

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
   * 本地模式匹配 - 不依赖AI的快速匹配
   */
  private matchLocalPatterns(
    query: string
  ): { type: string; description: string; action: string; params: Record<string, unknown> } | null {
    const q = query.toLowerCase();

    // 能力查询
    if (/(你可以|你能|能做什么|有什么功能|功能列表|帮助)/.test(q)) {
      return {
        type: 'capability',
        description: '介绍功能',
        action: 'listCapabilities',
        params: {},
      };
    }

    // 渠道查询
    if (/(渠道|通道|channel|启用了|哪些|配置|可用)/.test(q) && /(渠道|channel)/.test(q)) {
      return { type: 'info', description: '查询渠道', action: 'listChannels', params: {} };
    }

    // 统计查询
    if (/(统计|成功率|数据|分析)/.test(q)) {
      return { type: 'query', description: '查询统计', action: 'getStats', params: {} };
    }

    // 历史查询
    if (/(历史|记录|最近|之前)/.test(q)) {
      return {
        type: 'query',
        description: '查询历史',
        action: 'getHistory',
        params: { limit: 10 },
      };
    }

    // 定时任务
    if (/(定时|计划|任务|scheduled)/.test(q)) {
      return { type: 'query', description: '查询定时任务', action: 'listScheduled', params: {} };
    }

    // 发送消息
    if (/(发送|推送|通知|send|push)/.test(q)) {
      // 尝试从查询中提取消息内容
      // 格式：发送XXX / 推送XXX / 发送消息：XXX / 发送消息给XXX
      let message = query
        .replace(/^(发送|推送|通知|send|push)\s*(消息|通知|message)?\s*(给|到|至|to)?\s*/i, '')
        .replace(/(企业微信|飞书|钉钉|telegram|邮件|email|bark|slack|discord|webhook)/gi, '')
        .trim();

      // 如果提取后为空，使用原始查询（去掉发送相关词汇）
      if (!message) {
        message =
          query.replace(/(发送|推送|通知|send|push|消息|给|到|至|测试)/gi, '').trim() || '测试消息';
      }

      return {
        type: 'push',
        description: '发送消息',
        action: 'sendTest',
        params: { title: message, body: message },
      };
    }

    return null;
  }

  /**
   * 根据意图执行任务
   */
  private async executeIntent(
    intent: { type: string; action: string; params: Record<string, unknown> },
    userId: string,
    username: string,
    steps: AgentStep[],
    originalQuery?: string
  ): Promise<string> {
    const pushService = new PushService(this.env, userId);

    switch (intent.type) {
      case 'capability':
        return `我可以帮你完成以下任务：

📨 **发送消息**
• "发送测试消息到飞书"
• "发一条消息到钉钉"
• "给企业微信发通知"

📊 **查询数据**
• "查看推送历史"
• "统计推送成功率"
• "最近7天的推送数据"

📋 **管理资源**
• "查看所有模板"
• "创建一个新模板"
• "查看渠道分组"

⏰ **定时任务**
• "查看定时任务"
• "有什么待执行的任务"

📡 **系统信息**
• "有哪些可用渠道"
• "渠道状态如何"

试试用自然语言告诉我你想做什么！`;

      case 'push':
        return await this.executePushIntent(intent, userId, username, steps, originalQuery);

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
    steps: AgentStep[],
    originalQuery?: string
  ): Promise<string> {
    // 渠道名称映射
    const channelMap: Record<string, PushChannel> = {
      企业微信: 'wework',
      wework: 'wework',
      企微: 'wework',
      飞书: 'feishu',
      feishu: 'feishu',
      lark: 'feishu',
      钉钉: 'dingtalk',
      dingtalk: 'dingtalk',
      钉: 'dingtalk',
      telegram: 'telegram',
      tg: 'telegram',
      电报: 'telegram',
      bark: 'bark',
      ntfy: 'ntfy',
      邮件: 'email',
      email: 'email',
      邮箱: 'email',
      slack: 'slack',
      discord: 'discord',
      serverchan: 'serverchan',
      server酱: 'serverchan',
      pushplus: 'pushplus',
      webhook: 'webhook',
      gotify: 'gotify',
      line: 'line',
      'line notify': 'line',
      teams: 'teams',
      微软: 'teams',
      pushover: 'pushover',
    };

    // 从 AI 参数或原始查询中提取渠道
    let channels: PushChannel[] = (intent.params.channels as PushChannel[]) || [];

    // 如果 AI 没有提取到渠道，从原始查询中检测
    if (channels.length === 0 && originalQuery) {
      const queryLower = originalQuery.toLowerCase();
      for (const [name, id] of Object.entries(channelMap)) {
        if (queryLower.includes(name.toLowerCase())) {
          channels = [id];
          break;
        }
      }
    }

    // 默认使用企业微信
    if (channels.length === 0) {
      channels = ['wework'];
    }

    // 从原始查询中提取消息内容
    let title = (intent.params.title as string) || '';
    let body = (intent.params.body as string) || '';

    if (originalQuery) {
      // 提取消息内容：去掉渠道名称和发送相关词汇
      let message = originalQuery
        .replace(/^(发送|推送|通知|send|push)\s*(消息|通知|message)?\s*(给|到|至|to)?\s*/i, '')
        .replace(
          /(企业微信|飞书|钉钉|telegram|邮件|email|bark|slack|discord|webhook|ntfy|server酱|pushplus|gotify|line|teams|pushover)/gi,
          ''
        )
        .replace(/^(给|到|至|to)\s*/i, '')
        .trim();

      if (message) {
        title = title || message;
        body = body || message;
      }
    }

    // 如果还是没有内容，使用默认值
    title = title || '来自 AI Agent 的消息';
    body = body || '这是一条通过 AI Agent 发送的消息';

    // 提取邮件收件人（如果指定了）
    let emailTo: string | undefined;
    if (channels.includes('email') && originalQuery) {
      // 匹配邮箱格式
      const emailMatch = originalQuery.match(/[\w.-]+@[\w.-]+\.\w+/);
      if (emailMatch) {
        emailTo = emailMatch[0];
      }
      // 匹配 "发给xxx" 格式
      const toMatch = originalQuery.match(/(?:发给|发送给|to)\s*([^\s,，]+)/i);
      if (toMatch && toMatch[1] && !emailTo) {
        emailTo = toMatch[1];
      }
    }

    const step: AgentStep = {
      action: 'send_push',
      params: { channels, title, body, to: emailTo },
    };

    try {
      // 如果指定了邮件收件人，临时修改配置
      if (emailTo && channels.includes('email')) {
        const { loadUserChannelSettings } = await import('./dispatcher');
        const settings = await loadUserChannelSettings(userId, this.env);
        const emailConfig = settings['channel:email:to'];

        // 临时覆盖收件人
        if (emailConfig) {
          settings['channel:email:to'] = emailTo;
        }

        // 使用自定义配置发送
        const { dispatchPush } = await import('./dispatcher');
        const results = await dispatchPush({ title, body }, channels, username, this.env);

        step.result = results;
        steps.push(step);

        const successCount = results.filter((r) => r.success).length;
        return `已发送消息到 ${successCount}/${channels.length} 个渠道${emailTo ? `（收件人：${emailTo}）` : ''}`;
      }

      // 默认发送
      const results = await dispatchPushWithOptions({ title, body }, channels, username, this.env);

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
    const action = intent.action.toLowerCase();

    if (/history|历史|记录/.test(action)) {
      const limit = (intent.params.limit as number) || 10;
      const step: AgentStep = { action: 'get_history', params: { limit } };

      try {
        const { records } = await getPushHistory(userId, this.env, { pageSize: limit });
        step.result = records;
        steps.push(step);

        if (records.length === 0) return '暂无推送记录';

        const summary = records
          .slice(0, 5)
          .map(
            (r, i) =>
              `${i + 1}. ${r.title || '(无标题)'} (${r.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN') : '未知时间'}) - ${r.status || '未知'}`
          )
          .join('\n');
        return `最近 ${records.length} 条推送记录：\n${summary}`;
      } catch (error) {
        step.error = (error as Error).message;
        steps.push(step);
        return `查询失败：${(error as Error).message}`;
      }
    }

    if (/stat|统计|success|rate|成功率/.test(action)) {
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

    if (/schedule|定时|任务|task/.test(action)) {
      const step: AgentStep = { action: 'list_scheduled', params: {} };
      try {
        const pushes = await pushService.getScheduledPushes('pending');
        step.result = pushes;
        steps.push(step);

        if (pushes.length === 0) return '暂无待执行的定时任务';

        const summary = pushes
          .slice(0, 5)
          .map(
            (p, i) =>
              `${i + 1}. ${p.title} - 下次执行：${new Date(p.scheduledAt).toLocaleString('zh-CN')}`
          )
          .join('\n');
        return `待执行的定时任务（${pushes.length}个）：\n${summary}`;
      } catch (error) {
        step.error = (error as Error).message;
        steps.push(step);
        return `查询失败：${(error as Error).message}`;
      }
    }

    return '未知的查询操作';
  }

  /**
   * 执行信息查询任务
   */
  private async executeInfoIntent(
    intent: { action: string; params: Record<string, unknown> },
    userId: string,
    steps: AgentStep[]
  ): Promise<string> {
    // 灵活匹配 action（支持多种命名方式）
    const action = intent.action.toLowerCase();

    if (/channel|渠道|通道/.test(action)) {
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

    return '未知的信息查询操作';
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
    const action = intent.action.toLowerCase();

    if (/template|模板/.test(action)) {
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

    return '未知的创建操作';
  }
}
