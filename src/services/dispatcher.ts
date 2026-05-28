// ============================================
// 推送调度器
// 渠道配置按用户隔离，存储在 KV 中
// ============================================
import type {
  Env,
  PushPayload,
  PushChannel,
  ChannelResult,
  ChannelConfig,
  ChannelDefinition,
  ChannelSettings,
} from '../types';

interface PushHistoryRecord {
  id: string;
  title: string;
  body?: string;
  channels: string[];
  url?: string;
  status: string;
  results: ChannelResult[];
  createdAt: string;
}
import { sendWework } from './wework';
import { sendDingtalk } from './dingtalk';
import { sendFeishu } from './feishu';
import { sendTelegram } from './telegram';
import { sendBark } from './bark';
import { sendNtfy } from './ntfy';
import { sendEmail } from './email';

export const CHANNEL_DEFINITIONS: ChannelDefinition[] = [
  {
    id: 'wework',
    name: '企业微信',
    icon: '💼',
    fields: [
      {
        key: 'webhook_url',
        label: 'Webhook URL',
        type: 'url',
        placeholder: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx',
        required: true,
      },
    ],
  },
  {
    id: 'dingtalk',
    name: '钉钉',
    icon: '🅰️',
    fields: [
      {
        key: 'webhook_url',
        label: 'Webhook URL',
        type: 'url',
        placeholder: 'https://oapi.dingtalk.com/robot/send?access_token=xxx',
        required: true,
      },
      { key: 'secret', label: '加签密钥', type: 'text', placeholder: 'SEC...', required: false },
    ],
  },
  {
    id: 'feishu',
    name: '飞书',
    icon: '🪶',
    fields: [
      {
        key: 'webhook_url',
        label: 'Webhook URL',
        type: 'url',
        placeholder: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxx',
        required: true,
      },
    ],
  },
  {
    id: 'telegram',
    name: 'Telegram',
    icon: '✈️',
    fields: [
      {
        key: 'bot_token',
        label: 'Bot Token',
        type: 'password',
        placeholder: '123456:ABC-DEF...',
        required: true,
      },
      {
        key: 'chat_id',
        label: 'Chat ID',
        type: 'text',
        placeholder: '你的 Chat ID',
        required: true,
      },
    ],
  },
  {
    id: 'bark',
    name: 'Bark',
    icon: '📱',
    fields: [
      {
        key: 'key',
        label: 'Bark Key',
        type: 'text',
        placeholder: 'https://api.day.app/xxx 中的 xxx',
        required: true,
      },
      {
        key: 'server',
        label: '服务器地址',
        type: 'url',
        placeholder: 'https://api.day.app（默认官方服务器）',
        required: false,
      },
    ],
  },
  {
    id: 'ntfy',
    name: 'ntfy',
    icon: '📢',
    fields: [
      { key: 'topic', label: '主题名称', type: 'text', placeholder: 'my-topic', required: true },
      {
        key: 'server',
        label: '服务器地址',
        type: 'url',
        placeholder: 'https://ntfy.sh（默认官方服务器）',
        required: false,
      },
    ],
  },
  {
    id: 'email',
    name: '邮件',
    icon: '📧',
    fields: [
      {
        key: 'api_key',
        label: 'Resend API Key',
        type: 'password',
        placeholder: 're_xxx',
        required: true,
      },
      {
        key: 'from',
        label: '发件人地址',
        type: 'text',
        placeholder: 'noreply@example.com',
        required: true,
      },
      {
        key: 'to',
        label: '收件人地址',
        type: 'text',
        placeholder: '多个用逗号分隔',
        required: true,
      },
    ],
  },
];

export async function loadUserChannelSettings(
  username: string,
  env: Env
): Promise<ChannelSettings> {
  const prefix = `user:${username}:ch:`;
  const list = await env.SUBSCRIPTIONS.list({ prefix });
  const settings: ChannelSettings = {};
  for (const key of list.keys) {
    const value = await env.SUBSCRIPTIONS.get(key.name);
    if (value !== null) {
      // user:xxx:ch:wework:webhook_url → channel:wework:webhook_url
      settings[`channel:${key.name.slice(prefix.length)}`] = value;
    }
  }
  return settings;
}

export async function saveUserChannelSetting(
  username: string,
  channelId: string,
  fields: Record<string, string>,
  env: Env
): Promise<void> {
  const prefix = `user:${username}:ch:${channelId}:`;
  // 只更新传入的字段，不删除已有的
  for (const [fieldKey, value] of Object.entries(fields)) {
    if (value) {
      await env.SUBSCRIPTIONS.put(`${prefix}${fieldKey}`, value);
    } else {
      // 空值则删除该字段
      await env.SUBSCRIPTIONS.delete(`${prefix}${fieldKey}`);
    }
  }
}

export function isChannelEnabled(channelId: PushChannel, settings: ChannelSettings): boolean {
  // 先检查 enabled 字段
  const enabledValue = settings[`channel:${channelId}:enabled`];
  if (enabledValue === 'false') return false;

  // 再检查必填字段是否已配置
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

function buildChannelEnv(
  channelId: PushChannel,
  settings: ChannelSettings
): Record<string, string> {
  const prefix = `channel:${channelId}:`;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (key.startsWith(prefix)) {
      result[key.slice(prefix.length)] = value;
    }
  }
  return result;
}

export async function dispatchPush(
  payload: PushPayload,
  channels: PushChannel[] | undefined,
  username: string,
  env: Env
): Promise<ChannelResult[]> {
  const settings = await loadUserChannelSettings(username, env);

  // 不选择渠道时默认不推送
  if (!channels || channels.length === 0) {
    return [{ channel: 'wework' as PushChannel, success: false, message: '未选择推送渠道' }];
  }

  const targetChannels = CHANNEL_DEFINITIONS.filter((ch) => channels.includes(ch.id));

  if (targetChannels.length === 0) {
    return [
      {
        channel: 'wework' as PushChannel,
        success: false,
        message: '没有可用的推送渠道，请先在设置中配置',
      },
    ];
  }

  // 检查是否有已启用且已配置的渠道
  const enabledChannels = targetChannels.filter((ch) => {
    const enabled = settings[`channel:${ch.id}:enabled`];
    return enabled !== 'false'; // 未设置或设置为 true 都视为启用
  });

  if (enabledChannels.length === 0) {
    return [{ channel: 'wework' as PushChannel, success: false, message: '没有已启用的推送渠道' }];
  }

  const results = await Promise.all(
    enabledChannels.map((ch) => sendToChannel(ch.id, payload, settings))
  );

  // 保存推送记录
  const recordKey = `user:${username}:push:${Date.now()}`;
  await env.SUBSCRIPTIONS.put(
    recordKey,
    JSON.stringify({
      time: new Date().toISOString(),
      title: payload.title,
      body: payload.body,
      url: payload.url,
      results: results,
    })
  );

  // 清理旧记录，只保留最近 100 条
  try {
    const prefix = `user:${username}:push:`;
    const list = await env.SUBSCRIPTIONS.list({ prefix });
    if (list.keys.length > 100) {
      const keysToDelete = list.keys.sort((a, b) => b.name.localeCompare(a.name)).slice(100);
      for (const key of keysToDelete) {
        await env.SUBSCRIPTIONS.delete(key.name);
      }
    }
  } catch {
    // 清理失败不影响主流程
  }

  return results;
}

export async function getPushHistory(
  username: string,
  env: Env,
  limit = 50
): Promise<PushHistoryRecord[]> {
  const prefix = `user:${username}:push:`;
  const list = await env.SUBSCRIPTIONS.list({ prefix, limit: limit });
  const records: PushHistoryRecord[] = [];
  for (const key of list.keys.sort((a, b) => b.name.localeCompare(a.name))) {
    const data = await env.SUBSCRIPTIONS.get(key.name);
    if (data) records.push(JSON.parse(data) as PushHistoryRecord);
  }
  return records;
}

async function sendToChannel(
  channel: PushChannel,
  payload: PushPayload,
  settings: ChannelSettings
): Promise<ChannelResult> {
  const channelEnv = buildChannelEnv(channel, settings);
  switch (channel) {
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
