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
  imageUrl?: string;
  markdown?: boolean;
  status: string;
  results: ChannelResult[];
  createdAt: string;
}

interface PushOptions {
  concurrent?: boolean;
  timeout?: number;
  retries?: number;
}

import { sendWework } from './wework';
import { sendDingtalk } from './dingtalk';
import { sendFeishu } from './feishu';
import { sendTelegram } from './telegram';
import { sendBark } from './bark';
import { sendNtfy } from './ntfy';
import { sendEmail } from './email';
import { sendSlack } from './channels/slack';
import { sendDiscord } from './channels/discord';

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
  {
    id: 'slack',
    name: 'Slack',
    icon: '💬',
    fields: [
      {
        key: 'webhook_url',
        label: 'Webhook URL',
        type: 'url',
        placeholder: 'https://hooks.slack.com/services/xxx',
        required: true,
      },
    ],
  },
  {
    id: 'discord',
    name: 'Discord',
    icon: '🎮',
    fields: [
      {
        key: 'webhook_url',
        label: 'Webhook URL',
        type: 'url',
        placeholder: 'https://discord.com/api/webhooks/xxx',
        required: true,
      },
      {
        key: 'username',
        label: '自定义用户名',
        type: 'text',
        placeholder: 'Bee Swarm（可选）',
        required: false,
      },
      {
        key: 'avatar_url',
        label: '头像 URL',
        type: 'url',
        placeholder: 'https://example.com/avatar.png（可选）',
        required: false,
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
      settings[`channel:${key.name.slice(prefix.length)}`] = value;
    }
  }
  return settings;
}

export async function loadUserChannelSettingsBatch(
  usernames: string[],
  env: Env
): Promise<Map<string, ChannelSettings>> {
  const results = new Map<string, ChannelSettings>();
  const keysToFetch: string[] = [];

  for (const username of usernames) {
    const prefix = `user:${username}:ch:`;
    keysToFetch.push(prefix);
  }

  const prefix = 'user:';
  const list = await env.SUBSCRIPTIONS.list({ prefix });
  const settings: ChannelSettings = {};

  for (const key of list.keys) {
    if (!key.name.includes(':ch:')) continue;
    const value = await env.SUBSCRIPTIONS.get(key.name);
    if (value !== null) {
      const channelKey = `channel:${key.name.split(':ch:')[1]}`;
      settings[channelKey] = value;
    }
  }

  for (const username of usernames) {
    const userSettings: ChannelSettings = {};
    for (const [key, value] of Object.entries(settings)) {
      if (key.includes(`:${username}:`) || key.includes(`:${username}$`)) {
        const parts = key.split(':');
        const channelPart = parts.slice(2).join(':');
        userSettings[`channel:${channelPart}`] = value;
      }
    }
    results.set(username, userSettings);
  }

  return results;
}

export async function saveUserChannelSetting(
  username: string,
  channelId: string,
  fields: Record<string, string>,
  env: Env
): Promise<void> {
  const prefix = `user:${username}:ch:${channelId}:`;
  for (const [fieldKey, value] of Object.entries(fields)) {
    if (value) {
      await env.SUBSCRIPTIONS.put(`${prefix}${fieldKey}`, value);
    } else {
      await env.SUBSCRIPTIONS.delete(`${prefix}${fieldKey}`);
    }
  }
}

export function isChannelEnabled(channelId: PushChannel, settings: ChannelSettings): boolean {
  const enabledValue = settings[`channel:${channelId}:enabled`];
  if (enabledValue === 'false') return false;

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
  return dispatchPushWithOptions(payload, channels, username, env, { concurrent: true });
}

export async function dispatchPushWithOptions(
  payload: PushPayload,
  channels: PushChannel[] | undefined,
  username: string,
  env: Env,
  options: PushOptions = { concurrent: true }
): Promise<ChannelResult[]> {
  const settings = await loadUserChannelSettings(username, env);

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

  const enabledChannels = targetChannels.filter((ch) => {
    const enabled = settings[`channel:${ch.id}:enabled`];
    return enabled !== 'false';
  });

  if (enabledChannels.length === 0) {
    return [{ channel: 'wework' as PushChannel, success: false, message: '没有已启用的推送渠道' }];
  }

  let results: ChannelResult[];

  if (options.concurrent) {
    const promises = enabledChannels.map((ch) =>
      sendToChannelWithRetry(ch.id, payload, settings, options)
    );
    results = await Promise.all(promises);
  } else {
    results = [];
    for (const ch of enabledChannels) {
      const result = await sendToChannelWithRetry(ch.id, payload, settings, options);
      results.push(result);
    }
  }

  const recordKey = `user:${username}:push:${Date.now()}`;
  await env.SUBSCRIPTIONS.put(
    recordKey,
    JSON.stringify({
      id: crypto.randomUUID(),
      time: new Date().toISOString(),
      title: payload.title,
      body: payload.body,
      url: payload.url,
      imageUrl: payload.imageUrl,
      markdown: payload.markdown,
      channels: enabledChannels.map((c) => c.id),
      results: results,
      status: results.every((r) => r.success) ? 'success' : 'partial',
    })
  );

  // 记录推送统计数据
  try {
    const { MetricsCollector } = await import('./metrics');
    const metrics = new MetricsCollector(env, username);
    for (const result of results) {
      await metrics.recordPush(result.channel, result.success, 0);
    }
  } catch {
    // 统计记录失败不影响主流程
  }

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

async function sendToChannelWithRetry(
  channel: PushChannel,
  payload: PushPayload,
  settings: ChannelSettings,
  options: PushOptions
): Promise<ChannelResult> {
  const channelEnv = buildChannelEnv(channel, settings);
  const maxRetries = options.retries ?? 2;
  const timeout = options.timeout ?? 10000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        sendToChannel(channel, payload, channelEnv),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Channel ${channel} timeout after ${timeout}ms`)),
            timeout
          )
        ),
      ]);
      return result;
    } catch (err) {
      if (attempt === maxRetries) {
        return {
          channel,
          success: false,
          message: `推送失败: ${(err as Error).message}`,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }

  return { channel, success: false, message: 'Unknown error' };
}

async function sendToChannel(
  channel: PushChannel,
  payload: PushPayload,
  channelEnv: Record<string, string>
): Promise<ChannelResult> {
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
    case 'slack':
      return sendSlack(channelEnv.webhook_url, payload);
    case 'discord':
      return sendDiscord(channelEnv.webhook_url, payload, {
        username: channelEnv.username,
        avatarUrl: channelEnv.avatar_url,
      });
    default:
      return { channel, success: false, message: `未知渠道: ${channel}` };
  }
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

export async function deletePushHistory(username: string, env: Env): Promise<void> {
  const prefix = `user:${username}:push:`;
  const list = await env.SUBSCRIPTIONS.list({ prefix });
  for (const key of list.keys) {
    await env.SUBSCRIPTIONS.delete(key.name);
  }
}

export async function healthCheckChannel(
  channelId: PushChannel,
  settings: ChannelSettings
): Promise<{ channel: PushChannel; healthy: boolean; message: string }> {
  const channelEnv = buildChannelEnv(channelId, settings);
  const requiredFields = CHANNEL_DEFINITIONS.find((c) => c.id === channelId)?.fields || [];

  for (const field of requiredFields) {
    if (field.required && !channelEnv[field.key]) {
      return { channel: channelId, healthy: false, message: `缺少必填字段: ${field.label}` };
    }
  }

  switch (channelId) {
    case 'slack': {
      if (!channelEnv.webhook_url)
        return { channel: channelId, healthy: false, message: 'Webhook URL not configured' };
      try {
        const res = await fetch(channelEnv.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: '🔔 Health Check' }),
        });
        return {
          channel: channelId,
          healthy: res.ok,
          message: res.ok ? 'Connection OK' : `HTTP ${res.status}`,
        };
      } catch (err) {
        return { channel: channelId, healthy: false, message: (err as Error).message };
      }
    }
    case 'discord': {
      if (!channelEnv.webhook_url)
        return { channel: channelId, healthy: false, message: 'Webhook URL not configured' };
      try {
        const res = await fetch(channelEnv.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: '🔔 Health Check' }),
        });
        return {
          channel: channelId,
          healthy: res.ok,
          message: res.ok ? 'Connection OK' : `HTTP ${res.status}`,
        };
      } catch (err) {
        return { channel: channelId, healthy: false, message: (err as Error).message };
      }
    }
    default:
      return { channel: channelId, healthy: true, message: 'No health check available' };
  }
}
