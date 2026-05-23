// ============================================
// 推送调度器
// 统一管理所有推送渠道，根据配置自动分发消息
// ============================================
import type { Env, PushPayload, PushChannel, ChannelResult, ChannelConfig } from '../types';
import { broadcastWebPush } from './webpush';
import { sendWework } from './wework';
import { sendDingtalk } from './dingtalk';
import { sendFeishu } from './feishu';
import { sendTelegram } from './telegram';
import { sendBark } from './bark';
import { sendNtfy } from './ntfy';
import { sendEmail } from './email';

/**
 * 渠道配置映射表
 * 定义每个渠道的元信息和启用检测逻辑
 */
const CHANNEL_DEFINITIONS: {
  id: PushChannel;
  name: string;
  icon: string;
  /** 检查环境变量判断渠道是否已启用 */
  isEnabled: (env: Env) => boolean;
}[] = [
  {
    id: 'webpush',
    name: '浏览器推送',
    icon: '🔔',
    isEnabled: (env) => !!env.VAPID_PUBLIC_KEY && env.VAPID_PUBLIC_KEY !== 'YOUR_VAPID_PUBLIC_KEY',
  },
  {
    id: 'wework',
    name: '企业微信',
    icon: '💼',
    isEnabled: (env) => !!env.WEWORK_WEBHOOK_URL,
  },
  {
    id: 'dingtalk',
    name: '钉钉',
    icon: '💬',
    isEnabled: (env) => !!env.DINGTALK_WEBHOOK_URL,
  },
  {
    id: 'feishu',
    name: '飞书',
    icon: '🪶',
    isEnabled: (env) => !!env.FEISHU_WEBHOOK_URL,
  },
  {
    id: 'telegram',
    name: 'Telegram',
    icon: '✈️',
    isEnabled: (env) => !!env.TELEGRAM_BOT_TOKEN && !!env.TELEGRAM_CHAT_ID,
  },
  {
    id: 'bark',
    name: 'Bark',
    icon: '🐕',
    isEnabled: (env) => !!env.BARK_KEY,
  },
  {
    id: 'ntfy',
    name: 'ntfy',
    icon: '📢',
    isEnabled: (env) => !!env.NTFY_TOPIC,
  },
  {
    id: 'email',
    name: '邮件',
    icon: '📧',
    isEnabled: (env) => !!env.RESEND_API_KEY && !!env.EMAIL_FROM && !!env.EMAIL_TO,
  },
];

/**
 * 获取所有渠道的配置状态
 * 用于前端展示和管理
 *
 * @param env - Workers 环境变量
 * @returns 渠道配置列表
 */
export function getChannelConfigs(env: Env): ChannelConfig[] {
  return CHANNEL_DEFINITIONS.map((ch) => ({
    id: ch.id,
    name: ch.name,
    icon: ch.icon,
    enabled: ch.isEnabled(env),
  }));
}

/**
 * 向指定渠道发送推送消息
 * 如果不指定渠道，则推送到所有已启用的渠道
 *
 * @param payload  - 推送消息内容
 * @param channels - 指定推送渠道（可选，不填则推送到所有已启用渠道）
 * @param env      - Workers 环境变量
 * @returns 各渠道的推送结果
 */
export async function dispatchPush(
  payload: PushPayload,
  channels: PushChannel[] | undefined,
  env: Env
): Promise<ChannelResult[]> {
  // 确定要推送的渠道列表
  const targetChannels = channels
    // 如果指定了渠道，只推送到指定的
    ? CHANNEL_DEFINITIONS.filter((ch) => channels.includes(ch.id))
    // 否则推送到所有已启用的渠道
    : CHANNEL_DEFINITIONS.filter((ch) => ch.isEnabled(env));

  // 如果没有可推送的渠道
  if (targetChannels.length === 0) {
    return [{
      channel: 'webpush' as PushChannel,
      success: false,
      message: '没有可用的推送渠道，请先在 wrangler.toml 中配置',
    }];
  }

  // 并行调用所有渠道的推送服务
  const results = await Promise.all(
    targetChannels.map((ch) => sendToChannel(ch.id, payload, env))
  );

  return results;
}

/**
 * 路由到具体的推送服务
 *
 * @param channel - 推送渠道标识
 * @param payload - 推送消息内容
 * @param env     - Workers 环境变量
 */
async function sendToChannel(
  channel: PushChannel,
  payload: PushPayload,
  env: Env
): Promise<ChannelResult> {
  switch (channel) {
    case 'webpush':
      return broadcastWebPush(payload, env);
    case 'wework':
      return sendWework(payload, env);
    case 'dingtalk':
      return sendDingtalk(payload, env);
    case 'feishu':
      return sendFeishu(payload, env);
    case 'telegram':
      return sendTelegram(payload, env);
    case 'bark':
      return sendBark(payload, env);
    case 'ntfy':
      return sendNtfy(payload, env);
    case 'email':
      return sendEmail(payload, env);
    default:
      return {
        channel,
        success: false,
        message: `未知渠道: ${channel}`,
      };
  }
}
