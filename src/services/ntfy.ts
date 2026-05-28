// ============================================
// ntfy 推送服务
// 开源推送服务，无需注册，基于 HTTP POST 发送
// 官网: https://ntfy.sh
// ============================================
import type { PushPayload, ChannelResult } from '../types';

/**
 * 发送 ntfy 推送通知
 *
 * 文档: https://docs.ntfy.sh/publish/
 *
 * @param payload - 推送消息内容
 * @param env     - Workers 环境变量
 */
export async function sendNtfy(
  payload: PushPayload,
  env: Record<string, string>
): Promise<ChannelResult> {
  // 检查是否已配置 Topic
  if (!env.topic) {
    return {
      channel: 'ntfy',
      success: false,
      message: '未配置 ntfy Topic',
    };
  }

  try {
    const server = env.server || 'https://ntfy.sh';

    // 使用 JSON body 发送，支持 Markdown 渲染
    const body: Record<string, string> = {
      topic: env.topic,
      title: payload.title,
      message: payload.body || '',
      priority: 'default',
    };

    if (payload.url) {
      body.actions = JSON.stringify([{ action: 'view', label: '查看详情', url: payload.url }]);
    }

    const res = await fetch(`${server}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    // ntfy 成功返回空响应
    if (res.ok) {
      return {
        channel: 'ntfy',
        success: true,
        message: 'ntfy 推送成功',
      };
    }

    const text = await res.text();
    return {
      channel: 'ntfy',
      success: false,
      message: `ntfy 推送失败: ${res.status} ${text || res.statusText}`,
    };
  } catch (err: any) {
    return {
      channel: 'ntfy',
      success: false,
      message: `ntfy 推送异常: ${err.message}`,
    };
  }
}
