// ============================================
// 飞书机器人推送服务
// 通过 Webhook URL 向飞书群发送消息
// ============================================
import type { PushPayload, ChannelResult } from '../types';

/**
 * 发送飞书机器人消息
 *
 * 文档: https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot
 *
 * @param payload - 推送消息内容
 * @param env     - Workers 环境变量
 */
export async function sendFeishu(
  payload: PushPayload,
  env: Record<string, string>
): Promise<ChannelResult> {
  // 检查是否已配置 Webhook URL
  if (!env.webhook_url) {
    return {
      channel: 'feishu',
      success: false,
      message: '未配置飞书 Webhook URL',
    };
  }

  try {
    // 构建飞书富文本消息
    // 飞书使用 post 格式，支持更丰富的排版
    type FeishuContentItem = { tag: string; text?: string; href?: string };
    type FeishuContentRow = FeishuContentItem[];
    const content: FeishuContentRow[] = [
      // 标题行
      [
        {
          tag: 'text',
          text: payload.title,
        },
      ],
    ];

    // 正文内容
    if (payload.body) {
      content.push([
        {
          tag: 'text',
          text: `\n${payload.body}`,
        },
      ]);
    }

    // 跳转链接
    if (payload.url) {
      content.push([
        {
          tag: 'a',
          text: '查看详情',
          href: payload.url,
        },
      ]);
    }

    const res = await fetch(env.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msg_type: 'post',
        content: {
          post: {
            zh_cn: { title: payload.title, content },
          },
        },
      }),
    });

    const data = (await res.json()) as { code: number; msg: string };

    if (data.code === 0) {
      return {
        channel: 'feishu',
        success: true,
        message: '飞书推送成功',
      };
    }

    return {
      channel: 'feishu',
      success: false,
      message: `飞书推送失败: ${data.msg}`,
    };
  } catch (err) {
    return {
      channel: 'feishu',
      success: false,
      message: `飞书推送异常: ${(err as Error).message}`,
    };
  }
}
