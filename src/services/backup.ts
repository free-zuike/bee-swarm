// ============================================
// S3 兼容存储备份服务
// 使用原生 fetch + AWS Signature V4 签名
// ============================================
import type { Env } from '../types';

// ------------------------------------------
// 类型定义
// ------------------------------------------

export interface S3Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  path: string; // 备份路径前缀，如 "myapp/backups"
}

interface BackupData {
  timestamp: string;
  version: string;
  data: Record<string, string>;
}

interface BackupInfo {
  key: string;
  size: number;
  lastModified: string;
}

interface BackupResult {
  success: boolean;
  message: string;
}

// ------------------------------------------
// S3 配置读写（从 KV）
// ------------------------------------------

export async function getS3Config(env: Env, username: string): Promise<S3Config | null> {
  const configStr = await env.SUBSCRIPTIONS.get(`user:${username}:s3_config`);
  if (!configStr) return null;
  return JSON.parse(configStr);
}

export async function saveS3Config(env: Env, username: string, config: S3Config): Promise<void> {
  await env.SUBSCRIPTIONS.put(`user:${username}:s3_config`, JSON.stringify(config));
}

// ------------------------------------------
// AWS Signature V4 签名工具
// ------------------------------------------

async function hmacSha256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

async function sha256Hash(data: string | ArrayBuffer): Promise<ArrayBuffer> {
  const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return crypto.subtle.digest('SHA-256', buffer);
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function uriEncode(str: string, encodeSlash = true): string {
  let result = '';
  for (const char of str) {
    const code = char.charCodeAt(0);
    if (
      (code >= 0x41 && code <= 0x5a) || // A-Z
      (code >= 0x61 && code <= 0x7a) || // a-z
      (code >= 0x30 && code <= 0x39) || // 0-9
      char === '_' ||
      char === '-' ||
      char === '~' ||
      char === '.'
    ) {
      result += char;
    } else if (char === '/' && !encodeSlash) {
      result += '/';
    } else {
      result += '%' + code.toString(16).toUpperCase().padStart(2, '0');
    }
  }
  return result;
}

async function signV4(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string | ArrayBuffer | undefined,
  accessKey: string,
  secretKey: string,
  region: string,
  service = 's3',
): Promise<Record<string, string>> {
  const parsedUrl = new URL(url);
  const datetime = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const date = datetime.slice(0, 8);

  // 计算请求体的 SHA-256 哈希
  const bodyHash = body ? toHex(await sha256Hash(body)) : 'UNSIGNED-PAYLOAD';

  // 设置必要的头部
  const signedHeaders: Record<string, string> = {
    ...headers,
    'x-amz-content-sha256': bodyHash,
    'x-amz-date': datetime,
  };

  // 规范头部（按字母排序，小写）
  const sortedHeaderKeys = Object.keys(signedHeaders)
    .map((k) => k.toLowerCase())
    .sort();
  const signedHeaderKeysStr = sortedHeaderKeys.join(';');
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k}:${(signedHeaders[k] || '').trim()}`)
    .join('\n') + '\n';

  // 规范请求
  const canonicalQueryString = parsedUrl.searchParams.toString()
    ? parsedUrl.searchParams.toString().split('&').sort().map((p) => {
        const [key, ...rest] = p.split('=');
        return `${uriEncode(key)}=${uriEncode(rest.join('='))}`;
      }).join('&')
    : '';

  const canonicalUri = uriEncode(parsedUrl.pathname, false);

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaderKeysStr,
    bodyHash,
  ].join('\n');

  // 待签字符串
  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    datetime,
    credentialScope,
    toHex(await sha256Hash(canonicalRequest)),
  ].join('\n');

  // 签名密钥
  const kDate = await hmacSha256(new TextEncoder().encode(`AWS4${secretKey}`), date);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, 'aws4_request');

  // 计算签名
  const signature = toHex(await hmacSha256(kSigning, stringToSign));

  // 添加 Authorization 头
  signedHeaders['Authorization'] =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaderKeysStr}, Signature=${signature}`;

  return signedHeaders;
}

// ------------------------------------------
// S3 请求封装
// ------------------------------------------

async function s3Request(
  method: string,
  path: string,
  config: S3Config,
  body?: string | ArrayBuffer,
  query?: Record<string, string>,
): Promise<Response> {
  const { endpoint, accessKeyId, secretAccessKey, bucket, region } = config;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('未配置 S3 存储参数');
  }

  const parsedEndpoint = new URL(endpoint);
  // 使用 path-style URL
  const url = `${parsedEndpoint.origin}/${bucket}${path}${query ? '?' + new URLSearchParams(query).toString() : ''}`;

  const headers: Record<string, string> = {
    'Host': parsedEndpoint.host,
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const signedHeaders = await signV4(method, url, headers, body, accessKeyId, secretAccessKey, region);

  return fetch(url, {
    method,
    headers: signedHeaders,
    body,
  });
}

// ------------------------------------------
// 备份操作
// ------------------------------------------

/** 导出所有 KV 数据 */
export async function exportAllData(env: Env): Promise<BackupData> {
  const data: Record<string, string> = {};
  let cursor: string | undefined;

  do {
    const list = await env.SUBSCRIPTIONS.list({ cursor });
    for (const key of list.keys) {
      const value = await env.SUBSCRIPTIONS.get(key.name);
      if (value !== null) {
        data[key.name] = value;
      }
    }
    cursor = list.cursor;
  } while (cursor);

  return {
    timestamp: new Date().toISOString(),
    version: '1.0',
    data,
  };
}

/** 上传备份到 S3 */
export async function uploadBackup(env: Env, username: string, config: S3Config): Promise<BackupResult> {
  try {
    const backupData = await exportAllData(env);
    const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const prefix = config.path ? config.path.replace(/\/+$/, '') : `backups/${username}`;
    const key = `${prefix}/${date}.json`;

    const body = JSON.stringify(backupData, null, 2);
    const response = await s3Request('PUT', `/${key}`, config, body);

    if (!response.ok) {
      const text = await response.text();
      return { success: false, message: `上传失败 (${response.status}): ${text}` };
    }

    return { success: true, message: `备份成功: ${key}` };
  } catch (err: any) {
    return { success: false, message: `备份失败: ${err.message}` };
  }
}

/** 列出所有备份 */
export async function listBackups(env: Env, username: string, config: S3Config): Promise<BackupInfo[]> {
  try {
    const prefix = config.path ? config.path.replace(/\/+$/, '') : `backups/${username}`;
    const response = await s3Request('GET', '/', config, undefined, {
      prefix: `${prefix}/`,
      'list-type': '2',
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`获取备份列表失败 (${response.status}): ${text}`);
    }

    const xml = await response.text();
    const backups: BackupInfo[] = [];

    // 简单解析 XML（不引入 XML 解析库）
    const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
    let match;

    while ((match = contentsRegex.exec(xml)) !== null) {
      const block = match[1];
      const keyMatch = block.match(/<Key>([^<]+)<\/Key>/);
      const sizeMatch = block.match(/<Size>([^<]+)<\/Size>/);
      const lastModifiedMatch = block.match(/<LastModified>([^<]+)<\/LastModified>/);

      if (keyMatch) {
        backups.push({
          key: keyMatch[1],
          size: sizeMatch ? parseInt(sizeMatch[1], 10) : 0,
          lastModified: lastModifiedMatch ? lastModifiedMatch[1] : '',
        });
      }
    }

    // 按时间倒序排列（最新的在前）
    backups.sort((a, b) => b.key.localeCompare(a.key));

    return backups;
  } catch (err: any) {
    throw new Error(`列出备份失败: ${err.message}`);
  }
}

/** 从备份恢复 */
export async function restoreBackup(env: Env, username: string, config: S3Config, backupKey: string): Promise<BackupResult> {
  try {
    const response = await s3Request('GET', `/${backupKey}`, config);

    if (!response.ok) {
      const text = await response.text();
      return { success: false, message: `下载备份失败 (${response.status}): ${text}` };
    }

    const backupData: BackupData = await response.json();

    if (!backupData.data || typeof backupData.data !== 'object') {
      return { success: false, message: '无效的备份数据格式' };
    }

    // 先清空现有 KV 数据
    let cursor: string | undefined;
    do {
      const list = await env.SUBSCRIPTIONS.list({ cursor });
      for (const key of list.keys) {
        await env.SUBSCRIPTIONS.delete(key.name);
      }
      cursor = list.cursor;
    } while (cursor);

    // 写入备份数据
    const entries = Object.entries(backupData.data);
    for (const [key, value] of entries) {
      await env.SUBSCRIPTIONS.put(key, value);
    }

    return {
      success: true,
      message: `恢复成功: 已恢复 ${entries.length} 条数据 (备份时间: ${backupData.timestamp})`,
    };
  } catch (err: any) {
    return { success: false, message: `恢复失败: ${err.message}` };
  }
}

/** 删除指定备份 */
export async function deleteBackup(env: Env, username: string, config: S3Config, backupKey: string): Promise<BackupResult> {
  try {
    const response = await s3Request('DELETE', `/${backupKey}`, config);

    if (response.status !== 204 && !response.ok) {
      const text = await response.text();
      return { success: false, message: `删除备份失败 (${response.status}): ${text}` };
    }

    return { success: true, message: `删除成功: ${backupKey}` };
  } catch (err: any) {
    return { success: false, message: `删除失败: ${err.message}` };
  }
}

/** 测试 S3 连接 */
export async function testS3Connection(config: S3Config): Promise<{ success: boolean; message: string }> {
  try {
    const { endpoint, accessKeyId, secretAccessKey, bucket, region } = config;

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      return { success: false, message: '请填写所有必填项' };
    }

    const response = await s3Request('GET', '/', config, undefined, {
      'max-keys': '1',
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, message: `连接失败 (${response.status}): ${text}` };
    }

    return { success: true, message: 'S3 连接成功' };
  } catch (err: any) {
    return { success: false, message: `连接异常: ${err.message}` };
  }
}
