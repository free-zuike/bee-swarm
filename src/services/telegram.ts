// ============================================
// Telegram Bot 推送服务
// 通过 Telegram Bot API 发送消息
// ============================================
import type { Env, PushPayload, ChannelResult } from '../types';

/**
 * 发送 Telegram 消息
 *
 * 文档: https://core.telegram.org/bots/api#sendmessage
 *
 * @param payload - 推送消息内容
 * @param env     - Workers 环境变量
 */
export async function sendTelegram(
  payload: PushPayload,
  env: Env
): Promise<ChannelResult> {
  // 检查是否已配置 Bot Token 和 Chat ID
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return {
      channel: 'telegram',
      success: false,
      message: '未配置 Telegram Bot Token 或 Chat ID',
    };
  }

  try {
    // 构建 Telegram 消息文本（支持 HTML 格式）
    let text = `<b>${escapeHtml(payload.title)}</b>`;

    if (payload.body) {
      text += `\n\n${escapeHtml(payload.body)}`;
    }

    if (payload.url) {
      text += `\n\n<a href="${payload.url}">查看详情</a>`;
    }

    const res = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text,
          parse_mode: 'HTML',  // 使用 HTML 解析模式
          disable_web_page_preview: false,
        }),
      }
    );

    const data = await res.json() as { ok: boolean; description?: string };

    if (data.ok) {
      return {
        channel: 'telegram',
        success: true,
        message: 'Telegram 推送成功',
      };
    }

    return {
      channel: 'telegram',
      success: false,
      message: `Telegram 推送失败: ${data.description}`,
    };
  } catch (err: any) {
    return {
      channel: 'telegram',
      success: false,
      message: `Telegram 推送异常: ${err.message}`,
    };
  }
}

/**
 * HTML 特殊字符转义
 * 防止消息内容中的 HTML 标签被 Telegram 解析
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
