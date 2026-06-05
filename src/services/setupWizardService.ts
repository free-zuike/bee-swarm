// ============================================
// 配置向导服务
// 帮助新用户快速配置渠道和模板
// ============================================

import type { Env } from '../types';

/**
 * 配置向导步骤
 */
export type SetupWizardStep = 
  | 'welcome'
  | 'channels'
  | 'templates'
  | 'test'
  | 'complete';

/**
 * 渠道配置模板
 */
export interface ChannelConfigTemplate {
  channelId: string;
  name: string;
  description: string;
  requiredFields: string[];
  optionalFields: string[];
  template: Record<string, string>;
  helpText: string;
}

/**
 * 推送配置模板
 */
export interface PushTemplateSuggestion {
  name: string;
  description: string;
  title: string;
  content: string;
  category: string;
}

/**
 * 配置向导服务类
 */
export class SetupWizardService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * 获取所有可用渠道的配置模板
   */
  getChannelTemplates(): ChannelConfigTemplate[] {
    return [
      {
        channelId: 'dingtalk',
        name: '钉钉',
        description: '企业级即时通讯和办公平台',
        requiredFields: ['webhookUrl'],
        optionalFields: ['secret', 'agentId'],
        template: {
          webhookUrl: 'https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN',
          secret: '',
          agentId: '',
        },
        helpText: '在钉钉群设置中添加自定义机器人，获取 Webhook 地址和密钥',
      },
      {
        channelId: 'wework',
        name: '企业微信',
        description: '腾讯企业微信办公平台',
        requiredFields: ['webhookUrl'],
        optionalFields: ['key'],
        template: {
          webhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY',
          key: '',
        },
        helpText: '在企业微信群中添加群机器人，获取 Webhook 地址',
      },
      {
        channelId: 'feishu',
        name: '飞书',
        description: '字节跳动企业协作平台',
        requiredFields: ['webhookUrl'],
        optionalFields: ['secret'],
        template: {
          webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/YOUR_HOOK_ID',
          secret: '',
        },
        helpText: '在飞书群设置中添加自定义机器人，获取 Webhook 地址和密钥',
      },
      {
        channelId: 'serverchan',
        name: 'Server酱',
        description: '免费微信消息推送服务',
        requiredFields: ['sendkey'],
        optionalFields: [],
        template: {
          sendkey: 'YOUR_SENDKEY',
        },
        helpText: '在 Server酱官网注册并获取 SendKey',
      },
      {
        channelId: 'pushplus',
        name: 'PushPlus',
        description: '微信消息推送平台',
        requiredFields: ['token'],
        optionalFields: ['topic', 'template'],
        template: {
          token: 'YOUR_TOKEN',
          topic: '',
          template: 'html',
        },
        helpText: '在 PushPlus 官网注册并获取 Token',
      },
      {
        channelId: 'email',
        name: '邮件',
        description: 'SMTP 邮件发送',
        requiredFields: ['host', 'port', 'username', 'password', 'from'],
        optionalFields: ['secure', 'to'],
        template: {
          host: 'smtp.example.com',
          port: '465',
          secure: 'true',
          username: 'your-email@example.com',
          password: 'your-password',
          from: 'your-email@example.com',
          to: '',
        },
        helpText: '配置 SMTP 服务器信息，支持 Gmail、QQ、163 等邮箱',
      },
    ];
  }

  /**
   * 获取推荐的推送模板
   */
  getRecommendedTemplates(): PushTemplateSuggestion[] {
    return [
      {
        name: '系统通知',
        description: '发送系统重要通知',
        title: '【系统通知】{{title}}',
        content: `
📢 {{title}}

{{content}}

⏰ 时间: {{timestamp}}
---
发送自 Bee Swarm 推送系统
        `.trim(),
        category: 'notification',
      },
      {
        name: '定时任务报告',
        description: 'Cron 任务执行结果汇报',
        title: '✅ 任务执行成功 - {{taskName}}',
        content: `
## 任务执行报告

**任务名称**: {{taskName}}
**执行时间**: {{timestamp}}
**执行状态**: ✅ 成功

### 执行结果
{{result}}

---
自动推送自 Bee Swarm
        `.trim(),
        category: 'cron',
      },
      {
        name: '错误告警',
        description: '系统错误和异常告警',
        title: '⚠️ 错误告警 - {{errorType}}',
        content: `
## 🚨 系统告警

**错误类型**: {{errorType}}
**发生时间**: {{timestamp}}
**严重程度**: {{severity}}

### 错误详情
{{errorMessage}}

### 相关上下文
\`\`\`
{{context}}
\`\`\`

---
请及时处理！
        `.trim(),
        category: 'alert',
      },
      {
        name: '每日摘要',
        description: '每日数据汇总报告',
        title: '📊 {{date}} 数据日报',
        content: `
# 📈 {{date}} 数据日报

## 关键指标
- 📧 推送总数: {{totalPushes}}
- ✅ 成功率: {{successRate}}%
- ⏱️ 平均延迟: {{avgLatency}}ms

## 详细数据
{{details}}

## 趋势分析
{{trends}}

---
每日自动生成
        `.trim(),
        category: 'report',
      },
    ];
  }

  /**
   * 生成配置检查清单
   */
  async generateSetupChecklist(userId: string): Promise<{
    completed: string[];
    pending: string[];
    suggestions: string[];
  }> {
    const completed: string[] = [];
    const pending: string[] = [];
    const suggestions: string[] = [];

    try {
      // 检查渠道配置
      const channelsResult = await this.env.DB!.prepare(
        'SELECT COUNT(*) as count FROM channel_configs WHERE user_id = ?'
      )
        .bind(userId)
        .first<{ count: number }>();

      if (channelsResult && channelsResult.count > 0) {
        completed.push('至少配置了一个渠道');
      } else {
        pending.push('配置至少一个推送渠道');
        suggestions.push('推荐先配置 Server酱 或 PushPlus，这两个最简单');
      }

      // 检查模板配置
      const templatesResult = await this.env.DB!.prepare(
        'SELECT COUNT(*) as count FROM push_templates WHERE user_id = ?'
      )
        .bind(userId)
        .first<{ count: number }>();

      if (templatesResult && templatesResult.count > 0) {
        completed.push('创建了推送模板');
      } else {
        pending.push('创建至少一个推送模板');
        suggestions.push('可以使用系统提供的模板快速开始');
      }

      // 检查定时任务
      const scheduledResult = await this.env.DB!.prepare(
        'SELECT COUNT(*) as count FROM scheduled_pushes WHERE user_id = ?'
      )
        .bind(userId)
        .first<{ count: number }>();

      if (scheduledResult && scheduledResult.count > 0) {
        completed.push('配置了定时推送');
      } else {
        pending.push('配置定时推送任务（可选）');
      }

      // 检查Webhook配置
      const webhookResult = await this.env.DB!.prepare(
        'SELECT COUNT(*) as count FROM channel_configs WHERE user_id = ? AND channel_id = ?'
      )
        .bind(userId, 'serverchan')
        .first<{ count: number }>();

      if (!webhookResult || webhookResult.count === 0) {
        suggestions.push('配置 Webhook 可以通过外部 API 触发推送');
      }
    } catch (error) {
      console.error('[SetupWizard] Failed to generate checklist:', error);
    }

    return { completed, pending, suggestions };
  }

  /**
   * 保存用户设置向导状态
   */
  async saveWizardState(
    userId: string,
    step: SetupWizardStep,
    data: Record<string, any>
  ): Promise<void> {
    const stateKey = `setup_wizard:${userId}`;
    
    if (this.env.RATE_LIMIT_KV) {
      await this.env.RATE_LIMIT_KV.put(stateKey, JSON.stringify({
        step,
        data,
        updatedAt: new Date().toISOString(),
      }), {
        expirationTtl: 86400 * 7, // 7 天过期
      });
    }
  }

  /**
   * 获取用户设置向导状态
   */
  async getWizardState(userId: string): Promise<{
    step: SetupWizardStep;
    data: Record<string, any>;
  } | null> {
    const stateKey = `setup_wizard:${userId}`;
    
    if (!this.env.RATE_LIMIT_KV) {
      return null;
    }

    try {
      const state = await this.env.RATE_LIMIT_KV.get(stateKey, { type: 'json' });
      return state as { step: SetupWizardStep; data: Record<string, any> } | null;
    } catch (error) {
      console.error('[SetupWizard] Failed to get wizard state:', error);
      return null;
    }
  }

  /**
   * 清除设置向导状态
   */
  async clearWizardState(userId: string): Promise<void> {
    const stateKey = `setup_wizard:${userId}`;
    
    if (this.env.RATE_LIMIT_KV) {
      await this.env.RATE_LIMIT_KV.delete(stateKey);
    }
  }
}
