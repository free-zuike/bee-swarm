// ============================================
// API 版本管理服务
// 提供 API 版本控制和兼容性处理
// ============================================

/**
 * API 版本信息
 */
export interface APIVersion {
  version: string;
  status: 'current' | 'deprecated' | 'legacy';
  sunsetDate?: string;
  features: string[];
  breakingChanges: string[];
}

/**
 * API 版本配置
 */
const API_VERSIONS: Record<string, APIVersion> = {
  'v1': {
    version: 'v1',
    status: 'legacy',
    sunsetDate: '2025-12-31',
    features: [
      '基础推送功能',
      '渠道管理',
      '模板管理',
    ],
    breakingChanges: [
      '使用旧版 API 格式',
    ],
  },
  'v2': {
    version: 'v2',
    status: 'current',
    features: [
      '基础推送功能',
      '渠道管理',
      '模板管理',
      '分组管理',
      '定时推送',
      'Webhook',
      '统计分析',
      '健康检查',
      '备份恢复',
      'AI 辅助功能',
      'Cloudflare 深度集成',
    ],
    breakingChanges: [],
  },
};

/**
 * 当前稳定版本
 */
export const CURRENT_API_VERSION = 'v2';

/**
 * 获取所有 API 版本
 */
export function getAPIVersions(): APIVersion[] {
  return Object.values(API_VERSIONS);
}

/**
 * 获取特定版本信息
 */
export function getVersionInfo(version: string): APIVersion | null {
  return API_VERSIONS[version] || null;
}

/**
 * 获取当前版本信息
 */
export function getCurrentVersionInfo(): APIVersion {
  return API_VERSIONS[CURRENT_API_VERSION];
}

/**
 * 检查版本是否已弃用
 */
export function isVersionDeprecated(version: string): boolean {
  const info = API_VERSIONS[version];
  if (!info) return false;
  return info.status === 'deprecated' || info.status === 'legacy';
}

/**
 * 检查版本是否已过期
 */
export function isVersionExpired(version: string): boolean {
  const info = API_VERSIONS[version];
  if (!info || !info.sunsetDate) return false;
  return new Date() > new Date(info.sunsetDate);
}

/**
 * 生成版本兼容性提示头
 */
export function getVersionHeaders(): Record<string, string> {
  const current = getCurrentVersionInfo();
  const sunsetDate = current.sunsetDate 
    ? new Date(current.sunsetDate).toUTCString() 
    : undefined;

  return {
    'API-Version': current.version,
    'API-Deprecation': isVersionDeprecated(CURRENT_API_VERSION) ? 'true' : 'false',
    ...(sunsetDate ? { 'Sunset': sunsetDate } : {}),
  };
}

/**
 * API 版本转换器
 * 将旧版本请求转换为新版本格式
 */
export class APIVersionConverter {
  /**
   * 转换 v1 到 v2 格式
   */
  static convertV1ToV2(data: any): any {
    return {
      // 基本字段映射
      title: data.title || data.subject || '',
      body: data.content || data.message || data.body || '',
      url: data.url || data.link || '',
      channels: this.normalizeChannels(data.channels || data.targets || []),
      
      // 扩展字段
      templateId: data.template_id || data.templateId || undefined,
      scheduledTime: data.scheduled_time || data.scheduledTime || undefined,
      options: {
        retry: data.retry !== undefined ? data.retry : true,
        timeout: data.timeout || 30000,
        ...data.options,
      },
    };
  }

  /**
   * 规范化渠道格式
   */
  private static normalizeChannels(channels: any[] | string[]): string[] {
    if (Array.isArray(channels)) {
      return channels.map(ch => 
        typeof ch === 'string' ? ch : ch.id || ch.channel || ch.name
      );
    }
    return [];
  }

  /**
   * 转换 v2 到 v1 格式（降级）
   */
  static convertV2ToV1(data: any): any {
    return {
      subject: data.title,
      message: data.body,
      link: data.url,
      targets: data.channels,
      template_id: data.templateId,
      scheduled_time: data.scheduledTime,
    };
  }
}

/**
 * API 版本中间件
 * 处理版本协商和转换
 */
export function createVersionMiddleware() {
  return async (c: any, next: any) => {
    const path = c.req.path;
    
    // 提取版本号
    const versionMatch = path.match(/^\/api\/(v\d+)/);
    const requestedVersion = versionMatch ? versionMatch[1] : CURRENT_API_VERSION;

    // 检查版本是否存在
    if (!API_VERSIONS[requestedVersion]) {
      return c.json({
        error: `API 版本 ${requestedVersion} 不存在`,
        code: 'INVALID_API_VERSION',
        currentVersion: CURRENT_API_VERSION,
        availableVersions: Object.keys(API_VERSIONS),
      }, 400);
    }

    // 检查版本是否已过期
    if (isVersionExpired(requestedVersion)) {
      return c.json({
        error: `API 版本 ${requestedVersion} 已过期`,
        code: 'API_VERSION_EXPIRED',
        currentVersion: CURRENT_API_VERSION,
        sunsetDate: getVersionInfo(requestedVersion)?.sunsetDate,
      }, 410); // Gone
    }

    // 设置版本头
    const headers = getVersionHeaders();
    Object.entries(headers).forEach(([key, value]) => {
      c.res.headers.set(key, value);
    });

    // 在上下文保存版本信息
    c.set('apiVersion', requestedVersion);

    await next();
  };
}

/**
 * API 版本兼容性检查装饰器
 */
export function versionCompatible(minVersion: string) {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(...args: any[]) {
      const c = args[0];
      const currentVersion = c.get('apiVersion') || CURRENT_API_VERSION;

      // 版本比较
      const currentNum = parseInt(currentVersion.replace('v', ''));
      const minNum = parseInt(minVersion.replace('v', ''));

      if (currentNum < minNum) {
        return c.json({
          error: `此功能需要 API 版本 ${minVersion} 或更高版本`,
          code: 'INSUFFICIENT_API_VERSION',
          currentVersion,
          requiredVersion: minVersion,
          upgradeGuide: `请使用 /api/${CURRENT_API_VERSION}${c.req.path.replace(/^\/api\/v\d+/, '')}`,
        }, 426); // Upgrade Required
      }

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}
