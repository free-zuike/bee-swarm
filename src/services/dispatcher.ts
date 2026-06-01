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

// Import from unified channels module
import {
  sendWework,
  sendDingtalk,
  sendFeishu,
  sendTelegram,
  sendBark,
  sendNtfy,
  sendEmail,
  sendSlack,
  sendDiscord,
  sendServerchan,
  sendPushplus,
  sendWebhook,
  sendGotify,
  sendLineNotify,
  sendTeams,
  sendPushover,
  WeworkChannel,
  DingtalkChannel,
  FeishuChannel,
  TelegramChannel,
  BarkChannel,
  NtfyChannel,
  EmailChannel,
  SlackChannel,
  DiscordChannel,
  ServerchanChannel,
  PushplusChannel,
  WebhookChannel,
  GotifyChannel,
  LineNotifyChannel,
  TeamsChannel,
  PushoverChannel,
} from './channels';

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
  {
    id: 'serverchan',
    name: 'Server酱',
    icon: '🔔',
    fields: [
      {
        key: 'key',
        label: 'SendKey',
        type: 'text',
        placeholder: 'SCTxxxxxxxxxx',
        required: true,
      },
      {
        key: 'server',
        label: '服务器地址',
        type: 'url',
        placeholder: 'https://sctapi.ftqq.com（默认官方）',
        required: false,
      },
    ],
  },
  {
    id: 'pushplus',
    name: 'PushPlus',
    icon: '➕',
    fields: [
      {
        key: 'token',
        label: 'Token',
        type: 'text',
        placeholder: '您的 PushPlus Token',
        required: true,
      },
      {
        key: 'topic',
        label: '群发编码',
        type: 'text',
        placeholder: '群发时使用（可选）',
        required: false,
      },
    ],
  },
  {
    id: 'webhook',
    name: '通用 Webhook',
    icon: '🔗',
    fields: [
      {
        key: 'webhookUrl',
        label: 'Webhook URL',
        type: 'url',
        placeholder: 'https://example.com/webhook',
        required: true,
      },
      {
        key: 'method',
        label: 'HTTP 方法',
        type: 'text',
        placeholder: 'POST（默认）',
        required: false,
      },
      {
        key: 'contentType',
        label: 'Content-Type',
        type: 'text',
        placeholder: 'application/json（默认）',
        required: false,
      },
      {
        key: 'headers',
        label: '自定义 Headers',
        type: 'text',
        placeholder: 'JSON 格式或每行一个，如 "Authorization: Bearer xxx"',
        required: false,
      },
      {
        key: 'payloadTemplate',
        label: 'Payload 模板',
        type: 'text',
        placeholder:
          'JSON 格式，支持变量 {{title}}, {{body}}, {{url}}, {{imageUrl}}, {{timestamp}}',
        required: false,
      },
    ],
  },
  {
    id: 'gotify',
    name: 'Gotify',
    icon: '🔔',
    fields: [
      {
        key: 'server',
        label: '服务器地址',
        type: 'url',
        placeholder: 'https://gotify.example.com',
        required: true,
      },
      {
        key: 'token',
        label: 'Application Token',
        type: 'password',
        placeholder: '你的 Gotify Token',
        required: true,
      },
      {
        key: 'priority',
        label: '优先级',
        type: 'text',
        placeholder: '5（默认 0-10）',
        required: false,
      },
    ],
  },
  {
    id: 'line',
    name: 'LINE Notify',
    icon: '💬',
    fields: [
      {
        key: 'token',
        label: 'Access Token',
        type: 'password',
        placeholder: '你的 LINE Notify Token',
        required: true,
      },
    ],
  },
  {
    id: 'teams',
    name: 'Microsoft Teams',
    icon: '🤝',
    fields: [
      {
        key: 'webhook_url',
        label: 'Incoming Webhook URL',
        type: 'url',
        placeholder: '你的 Microsoft Teams Webhook URL',
        required: true,
      },
    ],
  },
  {
    id: 'pushover',
    name: 'Pushover',
    icon: '🔔',
    fields: [
      {
        key: 'user',
        label: 'User Key',
        type: 'password',
        placeholder: '你的 Pushover User Key',
        required: true,
      },
      {
        key: 'token',
        label: 'API Token',
        type: 'password',
        placeholder: '你的 Pushover API Token',
        required: true,
      },
      {
        key: 'priority',
        label: '优先级',
        type: 'text',
        placeholder: '0（默认 -2 到 2）',
        required: false,
      },
      {
        key: 'sound',
        label: '通知声音',
        type: 'text',
        placeholder: 'pushover（可选）',
        required: false,
      },
    ],
  },
];

export async function loadUserChannelSettings(
  username: string,
  env: Env
): Promise<ChannelSettings> {
  const settings: ChannelSettings = {};

  // 从 D1 读取
  try {
    if (env.DB) {
      const result = await env.DB.prepare(
        'SELECT channel_id, config, enabled FROM channel_configs WHERE user_id = ?'
      ).bind(username).all<{ channel_id: string; config: string; enabled: number }>();
      
      if (result.results && result.results.length > 0) {
        for (const row of result.results) {
          const config = JSON.parse(row.config);
          for (const [key, value] of Object.entries(config)) {
            settings[`channel:${row.channel_id}:${key}`] = value as string;
          }
          settings[`channel:${row.channel_id}:enabled`] = row.enabled ? 'true' : 'false';
        }
      }
    }
  } catch (err) {
    console.error('[ChannelSettings] D1 read failed:', (err as Error).message);
  }

  return settings;
}

export async function loadUserChannelSettingsBatch(
  usernames: string[],
  env: Env
): Promise<Map<string, ChannelSettings>> {
  const results = new Map<string, ChannelSettings>();

  if (!env.DB) {
    for (const username of usernames) {
      results.set(username, {});
    }
    return results;
  }

  // 从 D1 批量读取
  const placeholders = usernames.map(() => '?').join(',');
  const result = await env.DB.prepare(
    `SELECT user_id, channel_id, config, enabled FROM channel_configs WHERE user_id IN (${placeholders})`
  ).bind(...usernames).all<{ user_id: string; channel_id: string; config: string; enabled: number }>();

  // 按用户分组
  for (const username of usernames) {
    results.set(username, {});
  }

  if (result.results) {
    for (const row of result.results) {
      const settings = results.get(row.user_id);
      if (!settings) continue;

      const config = JSON.parse(row.config);
      for (const [key, value] of Object.entries(config)) {
        settings[`channel:${row.channel_id}:${key}`] = value as string;
      }
      settings[`channel:${row.channel_id}:enabled`] = row.enabled ? 'true' : 'false';
    }
  }

  return results;
}

export async function saveUserChannelSetting(
  username: string,
  channelId: string,
  fields: Record<string, string>,
  env: Env
): Promise<void> {
  // Webhook URL 字段 - 需要 SSRF 防护
  const urlFields = ['webhook_url', 'server', 'avatar_url'];
  for (const [fieldKey, value] of Object.entries(fields)) {
    if (urlFields.includes(fieldKey) && value) {
      const validationResult = validateWebhookUrl(value);
      if (!validationResult.valid) {
        throw new Error(validationResult.message);
      }
    }
  }

  // 保存到 D1
  if (!env.DB) {
    throw new Error('D1 数据库未配置');
  }

  const config: Record<string, string> = {};
  for (const [fieldKey, value] of Object.entries(fields)) {
    if (fieldKey !== 'enabled') {
      config[fieldKey] = value;
    }
  }
  const enabled = fields.enabled === 'true' ? 1 : 0;
  const now = new Date().toISOString();

  await env.DB.prepare(
    'DELETE FROM channel_configs WHERE user_id = ? AND channel_id = ?'
  ).bind(username, channelId).run();

  await env.DB.prepare(`
    INSERT INTO channel_configs (id, user_id, channel_id, config, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    username,
    channelId,
    JSON.stringify(config),
    enabled,
    now,
    now
  ).run();
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
  _options: PushOptions
): Promise<ChannelResult> {
  const channelEnv = buildChannelEnv(channel, settings);
  const startTime = Date.now();

  try {
    // 统一使用 channels 模块中的 sendXx 函数，这些函数内部已经处理了重试
    const result = await sendToChannel(channel, payload, channelEnv, _options);
    return { ...result, latencyMs: Date.now() - startTime };
  } catch (err) {
    return {
      channel,
      success: false,
      message: `推送失败: ${(err as Error).message}`,
      latencyMs: Date.now() - startTime,
    };
  }
}

async function sendToChannel(
  channel: PushChannel,
  payload: PushPayload,
  channelEnv: Record<string, string>,
  _options: PushOptions
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
    case 'serverchan':
      return sendServerchan(payload, channelEnv);
    case 'pushplus':
      return sendPushplus(payload, channelEnv);
    case 'webhook':
      return sendWebhook(channelEnv, payload);
    case 'gotify':
      return sendGotify(payload, channelEnv);
    case 'line':
      return sendLineNotify(payload, channelEnv);
    case 'teams':
      return sendTeams(payload, channelEnv);
    case 'pushover':
      return sendPushover(payload, channelEnv);
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
  const limit = pageSize + 1;
  const skip = (page - 1) * pageSize;

  const hasFilters = options.channel || options.status || options.keyword;
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

    if (total > skip + limit * 2 && !hasFilters) {
      listComplete = true;
    }
  } while (cursor && !listComplete && (hasFilters || total <= skip + limit * 2));

  if (allKeys.length === 0) return { records: [], total: 0, hasMore: false };

  const sortedKeys = allKeys.sort((a, b) => b.localeCompare(a));

  if (hasFilters) {
    const allRecords = await Promise.all(
      sortedKeys.map(async (key) => {
        const data = await env.SUBSCRIPTIONS.get(key);
        return data ? (JSON.parse(data) as PushHistoryRecord) : null;
      })
    );

    const filtered: Array<{ key: string; record: PushHistoryRecord }> = [];
    for (let i = 0; i < sortedKeys.length; i++) {
      const record = allRecords[i];
      if (!record) continue;

      if (options.channel && !record.channels.includes(options.channel)) continue;
      if (options.status && record.status !== options.status) continue;

      if (options.keyword) {
        const kw = options.keyword.toLowerCase();
        const matchTitle = record.title?.toLowerCase().includes(kw);
        const matchBody = record.body?.toLowerCase().includes(kw);
        if (!matchTitle && !matchBody) continue;
      }

      filtered.push({ key: sortedKeys[i], record });
    }

    total = filtered.length;
    const pageItems = filtered.slice(skip, skip + pageSize);
    const records = pageItems.map((item) => item.record);
    const hasMore = skip + pageSize < total;

    return { records, total, hasMore };
  }

  const pageKeys = sortedKeys.slice(skip, skip + pageSize);
  const records: PushHistoryRecord[] = [];

  for (const key of pageKeys) {
    const data = await env.SUBSCRIPTIONS.get(key);
    if (data) {
      records.push(JSON.parse(data) as PushHistoryRecord);
    }
  }

  const hasMore = sortedKeys.length > skip + pageSize;

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

  try {
    switch (channelId) {
      case 'wework': {
        const channel = new WeworkChannel(channelId, channelEnv);
        const result = await channel.healthCheck();
        return { channel: channelId, ...result };
      }
      case 'dingtalk': {
        const channel = new DingtalkChannel(channelId, channelEnv);
        const result = await channel.healthCheck();
        return { channel: channelId, ...result };
      }
      case 'feishu': {
        const channel = new FeishuChannel(channelId, channelEnv);
        const result = await channel.healthCheck();
        return { channel: channelId, ...result };
      }
      case 'telegram': {
        const channel = new TelegramChannel(channelId, channelEnv);
        const result = await channel.healthCheck();
        return { channel: channelId, ...result };
      }
      case 'bark': {
        const channel = new BarkChannel(channelId, channelEnv);
        const result = await channel.healthCheck();
        return { channel: channelId, ...result };
      }
      case 'ntfy': {
        const channel = new NtfyChannel(channelId, channelEnv);
        const result = await channel.healthCheck();
        return { channel: channelId, ...result };
      }
      case 'email': {
        const channel = new EmailChannel(channelId, channelEnv);
        const result = await channel.healthCheck();
        return { channel: channelId, ...result };
      }
      case 'slack': {
        const channel = new SlackChannel(channelId, channelEnv);
        const result = await channel.healthCheck();
        return { channel: channelId, ...result };
      }
      case 'discord': {
        const channel = new DiscordChannel(channelId, channelEnv);
        const result = await channel.healthCheck();
        return { channel: channelId, ...result };
      }
      case 'serverchan': {
        const channel = new ServerchanChannel(channelId, channelEnv);
        const result = await channel.healthCheck();
        return { channel: channelId, ...result };
      }
      case 'pushplus': {
        const channel = new PushplusChannel(channelId, channelEnv);
        const result = await channel.healthCheck();
        return { channel: channelId, ...result };
      }
      case 'webhook': {
        const channel = new WebhookChannel(channelEnv);
        const result = await channel.healthCheck();
        return { channel: channelId, ...result };
      }
      case 'gotify': {
        const channel = new GotifyChannel(channelId, channelEnv);
        const result = await channel.healthCheck();
        return { channel: channelId, ...result };
      }
      case 'line': {
        const channel = new LineNotifyChannel(channelId, channelEnv);
        const result = await channel.healthCheck();
        return { channel: channelId, ...result };
      }
      case 'teams': {
        const channel = new TeamsChannel(channelId, channelEnv);
        const result = await channel.healthCheck();
        return { channel: channelId, ...result };
      }
      case 'pushover': {
        const channel = new PushoverChannel(channelId, channelEnv);
        const result = await channel.healthCheck();
        return { channel: channelId, ...result };
      }
      default:
        return { channel: channelId, healthy: true, message: 'No health check available' };
    }
  } catch (err) {
    return { channel: channelId, healthy: false, message: (err as Error).message };
  }
}
