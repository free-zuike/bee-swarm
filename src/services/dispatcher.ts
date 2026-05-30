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
import { PUSH_CONFIG } from '../utils/constants';

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

  if (list.keys.length === 0) return settings;

  // 并行读取所有值，减少 KV 请求次数
  const readPromises = list.keys.map(async (key) => {
    const value = await env.SUBSCRIPTIONS.get(key.name);
    return { key: key.name, value };
  });

  const results = await Promise.all(readPromises);
  for (const { key, value } of results) {
    if (value !== null) {
      settings[`channel:${key.slice(prefix.length)}`] = value;
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

  // Webhook URL 字段 - 需要 SSRF 防护
  const urlFields = ['webhook_url', 'server', 'avatar_url'];
  for (const [fieldKey, value] of Object.entries(fields)) {
    if (urlFields.includes(fieldKey) && value) {
      const validationResult = validateWebhookUrl(value);
      if (!validationResult.valid) {
        throw new Error(validationResult.message);
      }
    }
    if (value) {
      await env.SUBSCRIPTIONS.put(`${prefix}${fieldKey}`, value);
    } else {
      await env.SUBSCRIPTIONS.delete(`${prefix}${fieldKey}`);
    }
  }
}

/**
 * Webhook URL 安全验证
 * 防止 SSRF 攻击：只允许 http/https 协议，禁止内网地址
 */
function validateWebhookUrl(url: string): { valid: boolean; message: string } {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, message: 'Webhook URL 只支持 http/https 协议' };
    }

    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('169.254.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('172.') ||
      hostname === '[::1]' ||
      hostname.startsWith('fc00:') ||
      hostname.startsWith('fe80:')
    ) {
      return { valid: false, message: 'Webhook URL 不允许使用内网地址' };
    }

    return { valid: true, message: '' };
  } catch {
    return { valid: false, message: 'Webhook URL 格式错误' };
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
    }),
    { expirationTtl: PUSH_CONFIG.historyRetentionSeconds } // 自动过期
  );

  // 记录推送统计数据
  try {
    const { MetricsCollector } = await import('./metrics');
    const metrics = new MetricsCollector(env, username);
    await metrics.loadSessionMetrics();
    for (const result of results) {
      const latency = result.latencyMs || 0;
      await metrics.recordPush(result.channel, result.success, latency);
    }
  } catch {
    // 统计记录失败不影响主流程
  }

  // KV 记录通过 expirationTtl 自动清理（7天），无需手动删除

  return results;
}

async function sendToChannelWithRetry(
  channel: PushChannel,
  payload: PushPayload,
  settings: ChannelSettings,
  options: PushOptions
): Promise<ChannelResult> {
  const channelEnv = buildChannelEnv(channel, settings);
  const maxRetries = options.retries ?? PUSH_CONFIG.maxRetries;
  const timeout = options.timeout ?? PUSH_CONFIG.timeout;
  const startTime = Date.now();

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
      return { ...result, latencyMs: Date.now() - startTime };
    } catch (err) {
      if (attempt === maxRetries) {
        return {
          channel,
          success: false,
          message: `推送失败: ${(err as Error).message}`,
          latencyMs: Date.now() - startTime,
        };
      }
      await new Promise((resolve) =>
        setTimeout(resolve, PUSH_CONFIG.retryBaseDelayMs * Math.pow(2, attempt))
      );
    }
  }

  return { channel, success: false, message: 'Unknown error', latencyMs: Date.now() - startTime };
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
  options: {
    page?: number;
    pageSize?: number;
    channel?: string;
    status?: string;
    keyword?: string;
  } = {}
): Promise<{ records: PushHistoryRecord[]; total: number; hasMore: boolean }> {
  const prefix = `user:${username}:push:`;
  const pageSize = options.pageSize || 20;
  const page = options.page || 1;

  // 先获取 total 并收集所有键
  let total = 0;
  let cursor: string | undefined;
  let listComplete = false;
  const allKeys: string[] = [];
  do {
    const list = await env.SUBSCRIPTIONS.list({ prefix, limit: 100, cursor });
    const keys = list.keys.map((k) => k.name);
    allKeys.push(...keys);
    total += list.keys.length;
    cursor = (list as { cursor?: string }).cursor;
    listComplete = list.list_complete ?? false;
  } while (cursor && !listComplete);

  if (total === 0) return { records: [], total: 0, hasMore: false };

  // 按时间戳降序排序（键名包含时间戳，降序即最新的在前）
  const sortedKeys = allKeys.sort((a, b) => b.localeCompare(a));

  // 如果需要过滤，先读取所有记录进行过滤
  let filteredKeys = sortedKeys;
  if (options.channel || options.status || options.keyword) {
    const allRecords = await Promise.all(
      sortedKeys.map(async (key) => {
        const data = await env.SUBSCRIPTIONS.get(key);
        return data ? (JSON.parse(data) as PushHistoryRecord) : null;
      })
    );

    filteredKeys = [];
    for (let i = 0; i < sortedKeys.length; i++) {
      const record = allRecords[i];
      if (!record) continue;

      // 渠道过滤
      if (options.channel && !record.channels.includes(options.channel)) continue;

      // 状态过滤
      if (options.status && record.status !== options.status) continue;

      // 关键词搜索（标题和内容）
      if (options.keyword) {
        const kw = options.keyword.toLowerCase();
        const matchTitle = record.title?.toLowerCase().includes(kw);
        const matchBody = record.body?.toLowerCase().includes(kw);
        if (!matchTitle && !matchBody) continue;
      }

      filteredKeys.push(sortedKeys[i]);
    }
    total = filteredKeys.length;
  }

  const limit = pageSize;
  const skip = (page - 1) * pageSize;
  const pageKeys = filteredKeys.slice(skip, skip + limit);

  const readPromises = pageKeys.map(async (key) => {
    const data = await env.SUBSCRIPTIONS.get(key);
    return data ? (JSON.parse(data) as PushHistoryRecord) : null;
  });

  const results = await Promise.all(readPromises);
  const records = results.filter((r): r is PushHistoryRecord => r !== null);
  const hasMore = skip + limit < total;

  return { records, total, hasMore };
}

export async function deletePushHistory(username: string, env: Env): Promise<void> {
  const prefix = `user:${username}:push:`;
  let cursor: string | undefined;
  let listComplete = false;
  do {
    const list = await env.SUBSCRIPTIONS.list({ prefix, cursor });
    const deletePromises = list.keys.map((key) => env.SUBSCRIPTIONS.delete(key.name));
    await Promise.all(deletePromises);
    cursor = (list as { cursor?: string }).cursor;
    listComplete = list.list_complete ?? false;
  } while (cursor && !listComplete);
}

export async function batchDeletePushHistory(
  username: string,
  env: Env,
  ids: string[]
): Promise<{ success: boolean; message: string; deletedCount: number }> {
  if (ids.length === 0) {
    return { success: false, message: '未选择要删除的记录', deletedCount: 0 };
  }

  const prefix = `user:${username}:push:`;
  const deletePromises = ids.map(async (id) => {
    const key = `${prefix}${id}`;
    await env.SUBSCRIPTIONS.delete(key);
  });

  await Promise.all(deletePromises);
  return { success: true, message: `已删除 ${ids.length} 条记录`, deletedCount: ids.length };
}

export async function batchDeletePushHistoryByFilter(
  username: string,
  env: Env,
  filter: { olderThan?: string; channel?: string; status?: string }
): Promise<{ success: boolean; message: string; deletedCount: number }> {
  const prefix = `user:${username}:push:`;
  let cursor: string | undefined;
  let listComplete = false;
  const keysToDelete: string[] = [];

  do {
    const list = await env.SUBSCRIPTIONS.list({ prefix, limit: 100, cursor });
    const keys = list.keys.map((k) => k.name);

    for (const key of keys) {
      let shouldDelete = true;

      // 按时间过滤
      if (filter.olderThan) {
        const cutoffTime = new Date(filter.olderThan).getTime();
        const keyParts = key.split(':');
        const timestamp = parseInt(keyParts[keyParts.length - 1], 10);
        if (timestamp >= cutoffTime) {
          shouldDelete = false;
        }
      }

      // 按渠道过滤
      if (shouldDelete && filter.channel) {
        const data = await env.SUBSCRIPTIONS.get(key);
        if (data) {
          const record = JSON.parse(data) as PushHistoryRecord;
          if (!record.channels.includes(filter.channel)) {
            shouldDelete = false;
          }
        }
      }

      // 按状态过滤
      if (shouldDelete && filter.status) {
        const data = await env.SUBSCRIPTIONS.get(key);
        if (data) {
          const record = JSON.parse(data) as PushHistoryRecord;
          if (record.status !== filter.status) {
            shouldDelete = false;
          }
        }
      }

      if (shouldDelete) {
        keysToDelete.push(key);
      }
    }

    cursor = (list as { cursor?: string }).cursor;
    listComplete = list.list_complete ?? false;
  } while (cursor && !listComplete);

  if (keysToDelete.length === 0) {
    return { success: false, message: '没有符合条件的记录', deletedCount: 0 };
  }

  const deletePromises = keysToDelete.map((key) => env.SUBSCRIPTIONS.delete(key));
  await Promise.all(deletePromises);
  return {
    success: true,
    message: `已删除 ${keysToDelete.length} 条记录`,
    deletedCount: keysToDelete.length,
  };
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
