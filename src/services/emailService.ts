// ============================================
// 邮件发送服务
// 使用 worker-mailer 发送邮件
// ============================================

import type { Env } from '../types';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * 通过 worker-mailer 发送邮件
 */
export async function sendEmail(env: Env, options: EmailOptions): Promise<boolean> {
  if (!env.MAILER) {
    console.warn('[Email] MAILER binding not configured, email not sent');
    return false;
  }

  const mailFrom = env.MAIL_FROM || 'noreply@bee-swarm.app';

  try {
    const response = await env.MAILER.fetch(new Request('https://worker-mailer.example.com/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: mailFrom,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>/g, ''),
      }),
    }));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Email] Failed to send:', errorText);
      return false;
    }

    console.log(`[Email] Sent to ${options.to}`);
    return true;
  } catch (error) {
    console.error('[Email] Error:', (error as Error).message);
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
