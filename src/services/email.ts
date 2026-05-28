// ============================================
// Email 邮件推送服务
// 通过 Resend API 发送邮件（每天 100 封免费）
// 官网: https://resend.com
// ============================================
import type { PushPayload, ChannelResult } from '../types';

/**
 * 通过 Resend API 发送邮件
 *
 * 文档: https://resend.com/docs/api-reference/emails/send-email
 *
 * @param payload - 推送消息内容
 * @param env     - Workers 环境变量
 */
export async function sendEmail(
  payload: PushPayload,
  env: Record<string, string>
): Promise<ChannelResult> {
  // 检查是否已配置 Resend API Key
  if (!env.api_key || !env.from || !env.to) {
    return {
      channel: 'email',
      success: false,
      message: '未配置 Email（需要 RESEND_API_KEY、EMAIL_FROM、EMAIL_TO）',
    };
  }

  try {
    // 构建纯文本版本（作为 fallback）
    const text = [
      payload.title,
      '─'.repeat(payload.title.length),
      payload.body || '',
      payload.url ? `\n查看详情: ${payload.url}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    // 构建 HTML 邮件内容
    const bodyHtml = escapeHtml(payload.body || '').replace(/\n/g, '<br>'); // 换行转 <br>

    const html = `
      <div style="max-width: 600px; margin: 0 auto; font-family: -apple-system, sans-serif;">
        <div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 24px; border-radius: 12px 12px 0 0;">
          <h2 style="color: white; margin: 0;">${escapeHtml(payload.title)}</h2>
        </div>
        <div style="background: #f9f9f9; padding: 24px; border-radius: 0 0 12px 12px;">
          <p style="color: #333; line-height: 1.8; white-space: pre-wrap;">${bodyHtml}</p>
          ${payload.url ? `<a href="${escapeUrl(payload.url)}" style="display: inline-block; margin-top: 16px; padding: 10px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 8px;">查看详情</a>` : ''}
        </div>
      </div>
    `;

    // 调用 Resend API 发送邮件
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.from,
        to: env.to.split(',').map((e) => e.trim()), // 支持多个收件人
        subject: payload.title,
        html,
        text, // 纯文本 fallback
      }),
    });

    const data = (await res.json()) as { id?: string; error?: { message: string } };

    if (res.ok && data.id) {
      return {
        channel: 'email',
        success: true,
        message: `邮件发送成功 (${env.to})`,
      };
    }

    return {
      channel: 'email',
      success: false,
      message: `邮件发送失败: ${data.error?.message || '未知错误'}`,
    };
  } catch (err: any) {
    return {
      channel: 'email',
      success: false,
      message: `邮件发送异常: ${err.message}`,
    };
  }
}

/**
 * HTML 特殊字符转义
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * URL 安全过滤 - 只允许 http/https 协议
 */
function escapeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '#';
    }
    return url;
  } catch {
    return '#';
  }
}
