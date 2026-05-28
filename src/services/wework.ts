// ============================================
// 企业微信机器人推送服务
// 通过 Webhook URL 向企业微信群发送消息
// ============================================
import type { PushPayload, ChannelResult } from '../types';

/**
 * 发送企业微信机器人消息
 *
 * 文档: https://developer.work.weixin.qq.com/document/path/91770
 *
 * @param payload - 推送消息内容
 * @param env     - Workers 环境变量
 */
export async function sendWework(
  payload: PushPayload,
  env: Record<string, string>
): Promise<ChannelResult> {
  // 检查是否已配置 Webhook URL
  if (!env.webhook_url) {
    return {
      channel: 'wework',
      success: false,
      message: '未配置企业微信 Webhook URL',
    };
  }

  try {
    // 构建企业微信消息体（markdown 格式，支持富文本）
    const content = [
      `## ${payload.title}`,
      payload.body || '',
      payload.url ? `[查看详情](${payload.url})` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const res = await fetch(env.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: { content },
      }),
    });

    const text = await res.text();

    // 企业微信可能返回非 JSON 格式的错误
    let errcode = -1;
    let errmsg = text;
    try {
      const data = JSON.parse(text) as { errcode: number; errmsg: string };
      errcode = data.errcode;
      errmsg = data.errmsg;
    } catch {
      // 非 JSON 响应，使用原始文本
    }

    if (errcode === 0) {
      return {
        channel: 'wework',
        success: true,
        message: '企业微信推送成功',
      };
    }

    return {
      channel: 'wework',
      success: false,
      message: `企业微信推送失败: ${errmsg}`,
    };
  } catch (err) {
    return {
      channel: 'wework',
      success: false,
      message: `企业微信推送异常: ${(err as Error).message}`,
    };
  }
}
