// ============================================
// 推送调度器
// 渠道配置按用户隔离，存储在 KV 中
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

export const CHANNEL_DEFINITIONS: ChannelDefinition[] = [
  {
    id: 'webpush',
    name: '浏览器推送',
    icon: '🔔',
    fields: [],
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
 * 从 KV 读取某用户的所有渠道设置
 * KV key 格式: user:{username}:ch:{channelId}
 */
export async function loadUserChannelSettings(username: string, env: Env): Promise<ChannelSettings> {
  const prefix = `user:${username}:ch:`;
  const list = await env.SUBSCRIPTIONS.list({ prefix });
  const settings: ChannelSettings = {};

  for (const key of list.keys) {
    const value = await env.SUBSCRIPTIONS.get(key.name);
    if (value !== null) {
      // 将 user:xxx:ch:yyy:field_key → channel:yyy:field_key 格式返回给前端
      const shortKey = key.name.slice(prefix.length);
      settings[`channel:${shortKey}`] = value;
    }
  }

  return settings;
}

/**
 * 保存单个渠道的设置（按用户隔离）
 */
export async function saveUserChannelSetting(
  username: string,
  channelId: string,
  fields: Record<string, string>,
  env: Env
): Promise<void> {
  const prefix = `user:${username}:ch:${channelId}:`;

  // 先清除该用户该渠道的旧配置
  const list = await env.SUBSCRIPTIONS.list({ prefix });
  for (const key of list.keys) {
    await env.SUBSCRIPTIONS.delete(key.name);
  }

  // 写入新配置
  for (const [fieldKey, value] of Object.entries(fields)) {
    if (value) {
      await env.SUBSCRIPTIONS.put(`${prefix}${fieldKey}`, value);
    }
  }
}

export function isChannelEnabled(channelId: PushChannel, settings: ChannelSettings): boolean {
  if (channelId === 'webpush') return true;
  const def = CHANNEL_DEFINITIONS.find((c) => c.id === channelId);
  if (!def) return false;
  return def.fields
    .filter((f) => f.required)
    .every((f) => !!settings[`channel:${channelId}:${f.key}`]);
}

export function getChannelConfigs(settings: ChannelSettings): ChannelConfig[] {
  return CHANNEL_DEFINITIONS.map((ch) => ({
    id: ch.id,
    name: ch.name,
    icon: ch.icon,
    enabled: isChannelEnabled(ch.id, settings),
  }));
}

function buildChannelEnv(channelId: PushChannel, settings: ChannelSettings): Record<string, string> {
  const prefix = `channel:${channelId}:`;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (key.startsWith(prefix)) {
      result[key.slice(prefix.length)] = value;
    }
  }
  return result;
}

/**
 * 推送消息（按用户读取配置）
 */
export async function dispatchPush(
  payload: PushPayload,
  channels: PushChannel[] | undefined,
  username: string,
  env: Env
): Promise<ChannelResult[]> {
  const settings = await loadUserChannelSettings(username, env);

  const targetChannels = channels
    ? CHANNEL_DEFINITIONS.filter((ch) => channels.includes(ch.id))
    : CHANNEL_DEFINITIONS.filter((ch) => isChannelEnabled(ch.id, settings));

  if (targetChannels.length === 0) {
    return [{ channel: 'webpush' as PushChannel, success: false, message: '没有可用的推送渠道，请先在设置中配置渠道' }];
  }

  return Promise.all(targetChannels.map((ch) => sendToChannel(ch.id, payload, settings, env)));
}

async function sendToChannel(
  channel: PushChannel,
  payload: PushPayload,
  settings: ChannelSettings,
  env: Env
): Promise<ChannelResult> {
  const channelEnv = buildChannelEnv(channel, settings);
  switch (channel) {
    case 'webpush': return broadcastWebPush(payload, env);
    case 'wework': return sendWework(payload, channelEnv);
    case 'dingtalk': return sendDingtalk(payload, channelEnv);
    case 'feishu': return sendFeishu(payload, channelEnv);
    case 'telegram': return sendTelegram(payload, channelEnv);
    case 'bark': return sendBark(payload, channelEnv);
    case 'ntfy': return sendNtfy(payload, channelEnv);
    case 'email': return sendEmail(payload, channelEnv);
    default: return { channel, success: false, message: `未知渠道: ${channel}` };
  }
}
