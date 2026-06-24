// ============================================
// 邮件发送服务
// 支持 Resend API（推荐）和 MailChannels（免费）
// ============================================

import type { Env } from '../types';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * 发送邮件 - 自动选择可用的邮件服务
 */
export async function sendEmail(env: Env, options: EmailOptions): Promise<boolean> {
  // 优先使用 Resend API
  if (env.RESEND_API_KEY) {
    return sendViaResend(env, options);
  }

  // 其次使用 MailChannels（Cloudflare Workers 免费）
  if (env.MAIL_FROM) {
    return sendViaMailChannels(env, options);
  }

  console.warn('[Email] No email service configured (RESEND_API_KEY or MAIL_FROM)');
  return false;
}

/**
 * 通过 Resend API 发送邮件
 * 注册: https://resend.com （免费 100封/天）
 * 文档: https://resend.com/docs/introduction
 */
async function sendViaResend(env: Env, options: EmailOptions): Promise<boolean> {
  const mailFrom = env.MAIL_FROM || 'noreply@resend.dev';

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: mailFrom,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>/g, ''),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Email] Resend failed:', error);
      return false;
    }

    console.log(`[Email] Sent via Resend to ${options.to}`);
    return true;
  } catch (error) {
    console.error('[Email] Resend error:', (error as Error).message);
    return false;
  }
}

/**
 * 通过 MailChannels 发送邮件（Cloudflare Workers 专用，免费）
 * 文档: https://developers.cloudflare.com/email-routing/workers/
 * 注意: 需要在 Cloudflare Dashboard 验证域名
 */
async function sendViaMailChannels(env: Env, options: EmailOptions): Promise<boolean> {
  const mailFrom = env.MAIL_FROM;

  try {
    const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: options.to }],
          },
        ],
        from: {
          email: mailFrom,
          name: '蜂群通知系统',
        },
        subject: options.subject,
        content: [
          {
            type: 'text/html',
            value: options.html,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Email] MailChannels failed:', error);
      return false;
    }

    console.log(`[Email] Sent via MailChannels to ${options.to}`);
    return true;
  } catch (error) {
    console.error('[Email] MailChannels error:', (error as Error).message);
    return false;
  }
}

/**
 * 生成密码重置邮件内容
 */
export function generatePasswordResetEmail(
  email: string,
  resetToken: string,
  baseUrl: string
): { subject: string; html: string; text: string } {
  const resetUrl = `${baseUrl}/?token=${resetToken}`;

  const subject = '重置您的密码 - 蜂群通知系统';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .container { background: #f9f9f9; border-radius: 12px; padding: 32px; margin: 20px 0; }
    .header { text-align: center; margin-bottom: 24px; }
    .header h1 { color: #667eea; font-size: 24px; margin: 0; }
    .content { background: white; border-radius: 8px; padding: 24px; margin: 20px 0; }
    .button { display: inline-block; background: linear-gradient(135deg, #667eea, #764ba2); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; margin: 20px 0; }
    .button:hover { opacity: 0.9; }
    .footer { text-align: center; font-size: 12px; color: #999; margin-top: 24px; }
    .warning { background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 12px; margin: 16px 0; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🐝 蜂群通知系统</h1>
    </div>
    <div class="content">
      <h2>重置密码</h2>
      <p>您好，</p>
      <p>我们收到了您重置密码的请求。请点击下方按钮设置新密码：</p>
      <p style="text-align: center;">
        <a href="${resetUrl}" class="button">重置密码</a>
      </p>
      <div class="warning">
        <strong>注意：</strong>此链接将在 24 小时后过期。如果您没有请求重置密码，请忽略此邮件。
      </div>
      <p style="font-size: 14px; color: #666;">如果按钮无法点击，请复制以下链接到浏览器打开：</p>
      <p style="word-break: break-all; font-size: 12px; color: #667eea;">${resetUrl}</p>
    </div>
    <div class="footer">
      <p>此邮件由蜂群通知系统自动发送，请勿回复。</p>
    </div>
  </div>
</body>
</html>`;

  const text = `
蜂群通知系统 - 重置密码

您好，

我们收到了您重置密码的请求。请访问以下链接设置新密码：

${resetUrl}

注意：此链接将在 24 小时后过期。如果您没有请求重置密码，请忽略此邮件。

---
此邮件由蜂群通知系统自动发送，请勿回复。
`;

  return { subject, html, text };
}
