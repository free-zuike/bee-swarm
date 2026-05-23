// ============================================
// 推送调度器
// 统一管理所有推送渠道，根据 KV 中的配置自动分发消息
// ============================================
import type { Env, PushPayload, PushChannel, ChannelResult, ChannelConfig, ChannelDefinition, ChannelSettings } from '../types';
import { broadcastWebPush } from './webpush';
import { sendWework } from './wework';
import { sendDingtalk } from './dingtalk';
import { sendFeishu } from './feishu';
import { sendTelegram } from './telegram';
import { sendBark } from './bark';
import { sendNtfy } from './ntfy';
import { sendEmail } from './email';

/**
 * 渠道定义表
 * 定义每个渠道的元信息和需要配置的字段
 */
export const CHANNEL_DEFINITIONS: ChannelDefinition[] = [
  {
    id: 'webpush',
    name: '浏览器推送',
    icon: '🔔',
    fields: [], // Web Push 只需要 VAPID 密钥，通过 Secrets 设置
  },
  {
    id: 'wework',
    name: '企业微信',
    icon: '💼',
    fields: [
      { key: 'webhook_url', label: 'Webhook URL', type: 'url', placeholder: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx', required: true },
    ],
  },
  {
    id: 'dingtalk',
    name: '钉钉',
    icon: '💬',
    fields: [
      { key: 'webhook_url', label: 'Webhook URL', type: 'url', placeholder: 'https://oapi.dingtalk.com/robot/send?access_token=xxx', required: true },
      { key: 'secret', label: '加签密钥', type: 'text', placeholder: 'SEC...', required: false },
    ],
  },
  {
    id: 'feishu',
    name: '飞书',
    icon: '🪶',
    fields: [
      { key: 'webhook_url', label: 'Webhook URL', type: 'url', placeholder: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxx', required: true },
    ],
  },
  {
    id: 'telegram',
    name: 'Telegram',
    icon: '✈️',
    fields: [
      { key: 'bot_token', label: 'Bot Token', type: 'password', placeholder: '123456:ABC-DEF...', required: true },
      { key: 'chat_id', label: 'Chat ID', type: 'text', placeholder: '你的 Chat ID', required: true },
    ],
  },
  {
    id: 'bark',
    name: 'Bark',
    icon: '🐕',
    fields: [
      { key: 'key', label: 'Bark Key', type: 'text', placeholder: 'https://api.day.app/xxx 中的 xxx', required: true },
      { key: 'server', label: '服务器地址', type: 'url', placeholder: 'https://api.day.app（默认官方服务器）', required: false },
    ],
  },
  {
    id: 'ntfy',
    name: 'ntfy',
    icon: '📢',
    fields: [
      { key: 'topic', label: '主题名称', type: 'text', placeholder: 'my-topic', required: true },
      { key: 'server', label: '服务器地址', type: 'url', placeholder: 'https://ntfy.sh（默认官方服务器）', required: false },
    ],
  },
  {
    id: 'email',
    name: '邮件',
    icon: '📧',
    fields: [
      { key: 'api_key', label: 'Resend API Key', type: 'password', placeholder: 're_xxx', required: true },
      { key: 'from', label: '发件人地址', type: 'text', placeholder: 'noreply@example.com', required: true },
      { key: 'to', label: '收件人地址', type: 'text', placeholder: '多个用逗号分隔', required: true },
    ],
  },
];

/**
 * 从 KV 读取所有渠道的设置
 */
export async function loadChannelSettings(env: Env): Promise<ChannelSettings> {
  const list = await env.SUBSCRIPTIONS.list({ prefix: 'channel:' });
  const settings: ChannelSettings = {};

  for (const key of list.keys) {
    const value = await env.SUBSCRIPTIONS.get(key.name);
    if (value !== null) {
      settings[key.name] = value;
    }
  }

  return settings;
}

/**
 * 保存渠道设置到 KV
 */
export async function saveChannelSettings(env: Env, settings: ChannelSettings): Promise<void> {
  // 先清除旧的渠道配置
  const list = await env.SUBSCRIPTIONS.list({ prefix: 'channel:' });
  for (const key of list.keys) {
    await env.SUBSCRIPTIONS.delete(key.name);
  }

  // 写入新配置
  for (const [key, value] of Object.entries(settings)) {
    if (value) {
      await env.SUBSCRIPTIONS.put(key, value);
    }
  }
}

/**
 * 检查渠道是否已配置（必填字段都已填写）
 */
export function isChannelEnabled(channelId: PushChannel, settings: ChannelSettings): boolean {
  if (channelId === 'webpush') {
    return true; // Web Push 始终可用（VAPID 通过 Secrets 设置）
  }

  const def = CHANNEL_DEFINITIONS.find((c) => c.id === channelId);
  if (!def) return false;

  return def.fields
    .filter((f) => f.required)
    .every((f) => !!settings[`channel:${channelId}:${f.key}`]);
}

/**
 * 获取所有渠道的配置状态
 */
export function getChannelConfigs(settings: ChannelSettings): ChannelConfig[] {
  return CHANNEL_DEFINITIONS.map((ch) => ({
    id: ch.id,
    name: ch.name,
    icon: ch.icon,
    enabled: isChannelEnabled(ch.id, settings),
  }));
}

/**
 * 从 KV 设置中构建渠道专用的环境变量对象
 * 用于传给各推送服务函数
 */
function buildChannelEnv(channelId: PushChannel, settings: ChannelSettings, env: Env): Record<string, string> {
  const prefix = `channel:${channelId}:`;
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(settings)) {
    if (key.startsWith(prefix)) {
      const fieldKey = key.slice(prefix.length);
      result[fieldKey] = value;
    }
  }

  return result;
}

/**
 * 向指定渠道发送推送消息
 */
export async function dispatchPush(
  payload: PushPayload,
  channels: PushChannel[] | undefined,
  env: Env
): Promise<ChannelResult[]> {
  // 从 KV 读取渠道设置
  const settings = await loadChannelSettings(env);

  // 确定要推送的渠道列表
  const targetChannels = channels
    ? CHANNEL_DEFINITIONS.filter((ch) => channels.includes(ch.id))
    : CHANNEL_DEFINITIONS.filter((ch) => isChannelEnabled(ch.id, settings));

  if (targetChannels.length === 0) {
    return [{
      channel: 'webpush' as PushChannel,
      success: false,
      message: '没有可用的推送渠道，请先在设置中配置渠道',
    }];
  }

  const results = await Promise.all(
    targetChannels.map((ch) => sendToChannel(ch.id, payload, settings, env))
  );

  return results;
}

/**
 * 路由到具体的推送服务
 */
async function sendToChannel(
  channel: PushChannel,
  payload: PushPayload,
  settings: ChannelSettings,
  env: Env
): Promise<ChannelResult> {
  const channelEnv = buildChannelEnv(channel, settings, env);

  switch (channel) {
    case 'webpush':
      return broadcastWebPush(payload, env);
    case 'wework':
      return sendWework(payload, channelEnv);
    case 'dingtalk':
      return sendDingtalk(payload, channelEnv);
    case 'feishu':
      return sendFeishu(payload, channelEnv);
    case 'telegram':
      return sendTelegram(payload, channelEnv);
    case 'bark':
      return sendBark(payload, channelEnv);
    case 'ntfy':
      return sendNtfy(payload, channelEnv);
    case 'email':
      return sendEmail(payload, channelEnv);
    default:
      return { channel, success: false, message: `未知渠道: ${channel}` };
  }
}
