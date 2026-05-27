// ============================================
// S3 兼容存储备份服务（使用 aws4fetch）
// ============================================
import { AwsClient } from 'aws4fetch';
import type { Env } from '../types';

export interface S3Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  path: string;
  pathStyle?: boolean;
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

export async function getS3Config(env: Env, username: string): Promise<S3Config | null> {
  const kvKey = `user:${username}:s3_config`;
  const configStr = await env.SUBSCRIPTIONS.get(kvKey);
  if (!configStr) return null;
  try {
    return JSON.parse(configStr);
  } catch (e) {
    console.error(`[S3 Config] Failed to parse config for ${username}`);
    return null;
  }
}

export async function saveS3Config(env: Env, username: string, config: S3Config): Promise<void> {
  const configStr = JSON.stringify(config);
  await env.SUBSCRIPTIONS.put(`user:${username}:s3_config`, configStr);
}

// 创建 aws4fetch 客户端
function createS3Client(config: S3Config): AwsClient {
  const region = config.region === 'auto' ? 'us-east-1' : config.region;
  return new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: region,
    service: 's3',
  });
}

// 构建 S3 URL
function buildS3Url(config: S3Config, path: string, query?: Record<string, string>): string {
  const endpoint = config.endpoint.startsWith('http') ? config.endpoint : `https://${config.endpoint}`;
  const queryString = query ? '?' + new URLSearchParams(query).toString() : '';
  
  if (config.pathStyle) {
    // Path-style: https://endpoint/bucket/path
    return `${endpoint}/${config.bucket}${path}${queryString}`;
  } else {
    // Virtual-hosted style: https://bucket.endpoint/path
    const parsedEndpoint = new URL(endpoint);
    return `${parsedEndpoint.protocol}//${config.bucket}.${parsedEndpoint.host}${path}${queryString}`;
  }
}

// 使用 aws4fetch 发送 S3 请求
async function s3Request(
  method: string,
  path: string,
  config: S3Config,
  body?: string | ArrayBuffer,
  query?: Record<string, string>
): Promise<Response> {
  if (!config.endpoint || !config.accessKeyId || !config.secretAccessKey || !config.bucket) {
    throw new Error('未配置 S3 存储参数');
  }

  const client = createS3Client(config);
  const url = buildS3Url(config, path, query);
  
  const headers: Record<string, string> = {};
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  
  console.log(`[S3 Request] URL: ${url}, Method: ${method}, PathStyle: ${config.pathStyle}`);
  
  const request = new Request(url, {
    method,
    headers,
    body: body ? (typeof body === 'string' ? body : body) : undefined,
  });
  
  return client.fetch(request);
}

export async function exportAllData(env: Env): Promise<BackupData> {
  const data: Record<string, string> = {};
  let cursor: string | undefined;
  do {
    const list = await env.SUBSCRIPTIONS.list({ cursor });
    for (const key of list.keys) {
      const value = await env.SUBSCRIPTIONS.get(key.name);
      if (value !== null) data[key.name] = value;
    }
    cursor = list.cursor;
  } while (cursor);
  return { timestamp: new Date().toISOString(), version: '1.0', data };
}

export async function uploadBackup(env: Env, username: string, config: S3Config): Promise<BackupResult> {
  try {
    const backupData = await exportAllData(env);
    const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const prefix = config.path ? config.path.replace(/\/+$/, '') : 'backups/' + username;
    const key = prefix + '/' + date + '.json';
    const response = await s3Request('PUT', '/' + key, config, JSON.stringify(backupData, null, 2));
    if (!response.ok) {
      return { success: false, message: '上传失败 (' + response.status + '): ' + await response.text() };
    }
    return { success: true, message: '备份成功: ' + key };
  } catch (err: any) {
    return { success: false, message: '备份失败: ' + err.message };
  }
}

export async function listBackups(env: Env, username: string, config: S3Config): Promise<BackupInfo[]> {
  try {
    const prefix = config.path ? config.path.replace(/\/+$/, '') : 'backups/' + username;
    const response = await s3Request('GET', '/', config, undefined, { 'list-type': '2', 'prefix': prefix + '/' });
    if (!response.ok) {
      throw new Error('获取备份列表失败 (' + response.status + ')');
    }
    const xml = await response.text();
    const backups: BackupInfo[] = [];
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
    return backups.sort((a, b) => b.key.localeCompare(a.key));
  } catch (err: any) {
    throw new Error('列出备份失败: ' + err.message);
  }
}

export async function restoreBackup(env: Env, username: string, config: S3Config, backupKey: string): Promise<BackupResult> {
  try {
    const response = await s3Request('GET', '/' + backupKey, config);
    if (!response.ok) {
      return { success: false, message: '下载备份失败 (' + response.status + ')' };
    }
    const backupData: BackupData = await response.json();
    if (!backupData.data || typeof backupData.data !== 'object') {
      return { success: false, message: '无效的备份数据格式' };
    }
    // 清空现有数据
    let cursor: string | undefined;
    do {
      const list = await env.SUBSCRIPTIONS.list({ cursor });
      for (const key of list.keys) {
        await env.SUBSCRIPTIONS.delete(key.name);
      }
      cursor = list.cursor;
    } while (cursor);
    // 恢复备份数据
    const entries = Object.entries(backupData.data);
    for (const [key, value] of entries) {
      await env.SUBSCRIPTIONS.put(key, value);
    }
    return { success: true, message: '恢复成功: 已恢复 ' + entries.length + ' 条数据' };
  } catch (err: any) {
    return { success: false, message: '恢复失败: ' + err.message };
  }
}

export async function deleteBackup(env: Env, username: string, config: S3Config, backupKey: string): Promise<BackupResult> {
  try {
    const response = await s3Request('DELETE', '/' + backupKey, config);
    if (response.status !== 204 && !response.ok) {
      return { success: false, message: '删除失败 (' + response.status + ')' };
    }
    return { success: true, message: '删除成功: ' + backupKey };
  } catch (err: any) {
    return { success: false, message: '删除失败: ' + err.message };
  }
}

export async function testS3Connection(config: S3Config): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    const response = await s3Request('GET', '/', config, undefined, { 'list-type': '2', 'max-keys': '1' });
    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        message: '连接失败 (' + response.status + '): ' + errorText.substring(0, 200),
        details: {
          url: config.endpoint,
          bucket: config.bucket,
          region: config.region,
          pathStyle: config.pathStyle,
          status: response.status,
          error: errorText.substring(0, 500),
        },
      };
    }
    return { success: true, message: 'S3 连接成功' };
  } catch (err: any) {
    return {
      success: false,
      message: '连接异常: ' + err.message,
      details: { error: err.message },
    };
  }
}