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

    const res = await fetch(`${server}/${env.topic}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Title': payload.title,       // ntfy 使用 Header 传递标题
        'Priority': 'default',        // 默认优先级
        'Click': payload.url || '',   // 点击跳转链接
      },
      body: payload.body || '',
    });

    // ntfy 成功返回空响应
    if (res.ok) {
      return {
        channel: 'ntfy',
        success: true,
        message: 'ntfy 推送成功',
      };
    }

    return {
      channel: 'ntfy',
      success: false,
      message: `ntfy 推送失败: ${res.status} ${res.statusText}`,
    };
  } catch (err: any) {
    return {
      channel: 'ntfy',
      success: false,
      message: `ntfy 推送异常: ${err.message}`,
    };
  }
}
