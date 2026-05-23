// ============================================
// 钉钉机器人推送服务
// 通过 Webhook URL 向钉钉群发送消息
// 支持加签安全验证
// ============================================
import type { Env, PushPayload, ChannelResult } from '../types';

/**
 * 生成钉钉签名
 * 钉钉安全设置使用 HMAC-SHA256 算法
 *
 * @param secret - 加签密钥
 * @returns 签名和时间戳
 */
async function generateSign(secret: string): Promise<{ timestamp: string; sign: string }> {
  const timestamp = String(Date.now());

  // 使用 Web Crypto API 计算 HMAC-SHA256
  // 钉钉加签格式: timestamp + "\n" + secret
  const encoder = new TextEncoder();
  const signData = encoder.encode(timestamp + '\n' + secret);
  
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, signData);
  const sign = btoa(String.fromCharCode(...new Uint8Array(signature)));

  return { timestamp, sign };
}

/**
 * 发送钉钉机器人消息
 *
 * 文档: https://open.dingtalk.com/document/robots/custom-robot-access
 *
 * @param payload - 推送消息内容
 * @param env     - Workers 环境变量
 */
export async function sendDingtalk(
  payload: PushPayload,
  env: Env
): Promise<ChannelResult> {
  // 检查是否已配置 Webhook URL
  if (!env.DINGTALK_WEBHOOK_URL) {
    return {
      channel: 'dingtalk',
      success: false,
      message: '未配置钉钉 Webhook URL',
    };
  }

  try {
    // 构建 Webhook URL（带签名参数）
    let webhookUrl = env.DINGTALK_WEBHOOK_URL;

    // 如果配置了加签密钥，则附加签名参数
    if (env.DINGTALK_SECRET) {
      const { timestamp, sign } = await generateSign(env.DINGTALK_SECRET);
      webhookUrl += `&timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
    }

    // 构建钉钉消息体（markdown 格式）
    const text = [
      `### ${payload.title}`,
      payload.body || '',
      payload.url ? `[查看详情](${payload.url})` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: { title: payload.title, text },
      }),
    });

    const data = await res.json() as { errcode: number; errmsg: string };

    if (data.errcode === 0) {
      return {
        channel: 'dingtalk',
        success: true,
        message: '钉钉推送成功',
      };
    }

    return {
      channel: 'dingtalk',
      success: false,
      message: `钉钉推送失败: ${data.errmsg}`,
    };
  } catch (err: any) {
    return {
      channel: 'dingtalk',
      success: false,
      message: `钉钉推送异常: ${err.message}`,
    };
  }
}
