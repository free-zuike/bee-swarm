// ============================================
// Bark 推送服务
// iOS 专属推送工具，通过 URL Scheme 发送通知
// 官网: https://github.com/Finb/bark-server
// ============================================
import type { PushPayload, ChannelResult } from '../types';

/**
 * 发送 Bark 推送通知
 *
 * 使用 GET 请求，参数通过 URL 传递
 * 格式: https://api.day.app/{key}/{title}/{body}
 *
 * @param payload - 推送消息内容
 * @param env     - Workers 环境变量
 */
export async function sendBark(
  payload: PushPayload,
  env: Record<string, string>
): Promise<ChannelResult> {
  // 检查是否已配置 Bark Key
  if (!env.key) {
    return {
      channel: 'bark',
      success: false,
      message: '未配置 Bark Key',
    };
  }

  try {
    // 构建推送 URL
    const server = env.server || 'https://api.day.app';
    const url = new URL(`${server}/${env.key}/${encodeURIComponent(payload.title)}`);

    // 附加可选参数
    if (payload.body) {
      url.searchParams.set('body', payload.body);
    }
    if (payload.url) {
      url.searchParams.set('url', payload.url);
    }
    if (payload.icon) {
      url.searchParams.set('icon', payload.icon);
    }

    const res = await fetch(url.toString());
    const data = await res.json() as { code: number; message: string };

    if (data.code === 200) {
      return {
        channel: 'bark',
        success: true,
        message: 'Bark 推送成功',
      };
    }

    return {
      channel: 'bark',
      success: false,
      message: `Bark 推送失败: ${data.message}`,
    };
  } catch (err: any) {
    return {
      channel: 'bark',
      success: false,
      message: `Bark 推送异常: ${err.message}`,
    };
  }
}
