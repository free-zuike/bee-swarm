// ============================================
// 多备份端备份服务（支持 S3/WebDAV/R2）
// ============================================
import { AwsClient } from 'aws4fetch';
import type { Env } from '../types';
import { convertTimezone } from '../utils/timezone';
import { R2StorageService } from './r2StorageService';

// 备份端类型
export type EndpointType = 's3' | 'webdav' | 'r2';

// S3 配置
export interface S3Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  path: string;
  pathStyle?: boolean;
}

// WebDAV 配置
export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  path: string;
}

// R2 配置
export interface R2Config {
  path: string;
}

// 备份端配置
export interface BackupEndpoint {
  id: string;
  name: string;
  type: EndpointType;
  enabled: boolean;
  config: S3Config | WebDAVConfig;
  schedule: {
    enabled: boolean;
    interval: number; // 小时
    startTime: string; // HH:mm
    timezone?: string; // 时区偏移，如 "+8"、"-5"
    startDay?: number; // 每周备份的日期（0=周日, 1-6=周一到周六）
  };
  retention: number; // 保留份数
  lastBackup?: {
    time: string;
    status: 'success' | 'failed';
    message?: string;
  };
}

// 备份数据
interface BackupData {
  timestamp: string;
  version: string;
  username?: string;
  data: Record<string, string>;
}

// 备份文件信息
export interface BackupInfo {
  key: string;
  size: number;
  lastModified: string;
}

// 备份结果
export interface BackupResult {
  success: boolean;
  message: string;
  endpointId?: string;
  endpointName?: string;
  statusCode?: number | null;
  errorMessage?: string;
  count?: number;
}

// 获取用户的所有备份端
export async function getBackupEndpoints(env: Env, username: string): Promise<BackupEndpoint[]> {
  if (!env.DB) return [];
  
  const result = await env.DB.prepare(
    'SELECT * FROM backup_endpoints WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(username).all<any>();

  return (result.results || []).map((row: any) => ({
    id: row.id,
    name: row.name || '默认备份',
    type: row.type as EndpointType,
    enabled: row.enabled === 1,
    config: JSON.parse(row.config || '{}'),
    schedule: {
      enabled: false,
      interval: 24,
      startTime: '02:00',
    },
    retention: 30,
    lastBackup: row.last_backup ? JSON.parse(row.last_backup) : undefined,
  }));
}

// 保存用户的所有备份端
export async function saveBackupEndpoints(
  env: Env,
  username: string,
  endpoints: BackupEndpoint[]
): Promise<void> {
  if (!env.DB) return;
  
  // 删除旧的
  await env.DB.prepare('DELETE FROM backup_endpoints WHERE user_id = ?').bind(username).run();
  
  // 插入新的
  for (const endpoint of endpoints) {
    await env.DB.prepare(`
      INSERT INTO backup_endpoints (id, user_id, name, type, config, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      endpoint.id,
      username,
      endpoint.name || '默认备份',
      endpoint.type,
      JSON.stringify(endpoint.config),
      endpoint.enabled ? 1 : 0,
      new Date().toISOString(),
      new Date().toISOString()
    ).run();
  }
}

// 获取单个备份端
export async function getBackupEndpoint(
  env: Env,
  username: string,
  endpointId: string
): Promise<BackupEndpoint | null> {
  const endpoints = await getBackupEndpoints(env, username);
  return endpoints.find((e) => e.id === endpointId) || null;
}

// 添加或更新备份端
export async function saveBackupEndpoint(
  env: Env,
  username: string,
  endpoint: BackupEndpoint
): Promise<void> {
  if (!env.DB) return;
  
  // 先删除旧的
  await env.DB.prepare(
    'DELETE FROM backup_endpoints WHERE id = ? AND user_id = ?'
  ).bind(endpoint.id, username).run();
  
  // 插入新的
  await env.DB.prepare(`
    INSERT INTO backup_endpoints (id, user_id, name, type, config, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    endpoint.id,
    username,
    endpoint.name || '默认备份',
    endpoint.type,
    JSON.stringify(endpoint.config),
    endpoint.enabled ? 1 : 0,
    new Date().toISOString(),
    new Date().toISOString()
  ).run();
}

// 删除备份端
export async function deleteBackupEndpoint(
  env: Env,
  username: string,
  endpointId: string
): Promise<boolean> {
  if (!env.DB) return false;
  
  const result = await env.DB.prepare(
    'DELETE FROM backup_endpoints WHERE id = ? AND user_id = ?'
  ).bind(endpointId, username).run();
  
  return result.success && (result.meta?.changes || 0) > 0;
}

// 导出所有数据（从 D1 备份）
export async function exportAllData(env: Env, username: string): Promise<BackupData> {
  const data: Record<string, string> = {};

  if (!env.DB) {
    return { timestamp: new Date().toISOString(), version: '1.0', username, data };
  }

  // 导出用户配置
  try {
    const channels = await env.DB.prepare(
      'SELECT * FROM channel_configs WHERE user_id = ?'
    ).bind(username).all();
    data['channel_configs'] = JSON.stringify(channels.results);
  } catch {}

  // 导出推送模板
  try {
    const templates = await env.DB.prepare(
      'SELECT * FROM push_templates WHERE user_id = ?'
    ).bind(username).all();
    data['push_templates'] = JSON.stringify(templates.results);
  } catch {}

  // 导出频道分组
  try {
    const groups = await env.DB.prepare(
      'SELECT * FROM channel_groups WHERE user_id = ?'
    ).bind(username).all();
    data['channel_groups'] = JSON.stringify(groups.results);
  } catch {}

  // 导出定时任务
  try {
    const scheduled = await env.DB.prepare(
      'SELECT * FROM scheduled_pushes WHERE user_id = ?'
    ).bind(username).all();
    data['scheduled_pushes'] = JSON.stringify(scheduled.results);
  } catch {}

  // 导出推送历史
  try {
    const history = await env.DB.prepare(
      'SELECT * FROM push_history WHERE user_id = ?'
    ).bind(username).all();
    data['push_history'] = JSON.stringify(history.results);
  } catch {}

  // 导出备份端配置
  try {
    const endpoints = await env.DB.prepare(
      'SELECT * FROM backup_endpoints WHERE user_id = ?'
    ).bind(username).all();
    data['backup_endpoints'] = JSON.stringify(endpoints.results);
  } catch {}

  return { timestamp: new Date().toISOString(), version: '1.0', username, data };
}

// 创建 S3 客户端
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
  const endpoint = config.endpoint.startsWith('http')
    ? config.endpoint
    : `https://${config.endpoint}`;
  const queryString = query ? '?' + new URLSearchParams(query).toString() : '';

  if (config.pathStyle) {
    return `${endpoint}/${config.bucket}${path}${queryString}`;
  } else {
    const parsedEndpoint = new URL(endpoint);
    return `${parsedEndpoint.protocol}//${config.bucket}.${parsedEndpoint.host}${path}${queryString}`;
  }
}

// S3 请求
async function s3Request(
  method: string,
  path: string,
  config: S3Config,
  body?: string | ArrayBuffer,
  query?: Record<string, string>
): Promise<Response> {
  const client = createS3Client(config);
  const url = buildS3Url(config, path, query);

  const headers: Record<string, string> = {};
  if (body) headers['Content-Type'] = 'application/json';

  const request = new Request(url, { method, headers, body });
  return client.fetch(request);
}

// WebDAV 请求（带重试）
async function webdavRequest(
  method: string,
  path: string,
  config: WebDAVConfig,
  body?: string | ArrayBuffer,
  retryCount = 0
): Promise<Response> {
  const url = config.url.replace(/\/$/, '') + path;
  const auth = btoa(`${config.username}:${config.password}`);

  const headers: Record<string, string> = {
    Authorization: `Basic ${auth}`,
  };
  if (body) headers['Content-Type'] = 'application/json';

  const response = await fetch(url, { method, headers, body });

  // 429 限流时重试（最多3次，间隔1秒）
  if (response.status === 429 && retryCount < 3) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return webdavRequest(method, path, config, body, retryCount + 1);
  }

  return response;
}

// 上传备份到指定端点
export async function uploadBackupToEndpoint(
  env: Env,
  username: string,
  endpoint: BackupEndpoint
): Promise<BackupResult> {
  try {
    const backupData = await exportAllData(env, username);

    // 使用端点配置的时区生成文件名（兼容旧数据的数字时区）
    const tz = convertTimezone(endpoint.schedule?.timezone || 'Asia/Shanghai');
    const dateStr = new Date()
      .toLocaleString('sv-SE', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
      .replace(/[:\s]/g, '-')
      .replace(/T/g, '-');
    const filename = `${dateStr}.json`;

    if (endpoint.type === 's3') {
      const config = endpoint.config as S3Config;
      const root = config.path ? config.path.replace(/\/+$/, '') : 'beeswarm';
      const key = `${root}/backups/${username}/${filename}`;
      const response = await s3Request(
        'PUT',
        '/' + key,
        config,
        JSON.stringify(backupData, null, 2)
      );

      if (!response.ok) {
        return {
          success: false,
          message: 'S3 上传失败 (' + response.status + ')',
          endpointId: endpoint.id,
        };
      }

      // 清理旧备份
      await cleanupOldBackupsS3(config, root, username, endpoint.retention);
    } else if (endpoint.type === 'webdav') {
      const config = endpoint.config as WebDAVConfig;
      const root = config.path ? config.path.replace(/\/+$/, '') : 'beeswarm';
      const path = `${root}/backups/${username}/${filename}`;

      // 递归创建目录（遇到已存在目录立即跳过，避免冗余请求）
      const dirPaths = [`/${root}/`, `/${root}/backups/`, `/${root}/backups/${username}/`];

      for (const dirPath of dirPaths) {
        const resp = await webdavRequest('MKCOL', dirPath, config);
        if (resp.ok || resp.status === 405 || resp.status === 409) {
          // 201 创建成功，405 已存在（Method Not Allowed on collection），409 冲突（已存在）
          continue;
        }
        return {
          success: false,
          message: 'WebDAV 创建目录失败 (' + resp.status + ')',
          endpointId: endpoint.id,
        };
      }

      const response = await webdavRequest(
        'PUT',
        '/' + path,
        config,
        JSON.stringify(backupData, null, 2)
      );

      if (!response.ok && response.status !== 201 && response.status !== 204) {
        const errorText = await response.text().catch(() => '');
        return {
          success: false,
          message: 'WebDAV 上传失败 (' + response.status + '): ' + errorText.substring(0, 200),
          endpointId: endpoint.id,
        };
      }

      // 清理旧备份
      await cleanupOldBackupsWebDAV(config, root, username, endpoint.retention);
    } else if (endpoint.type === 'r2') {
      const r2Service = new R2StorageService(env);
      if (!r2Service.isAvailable()) {
        return {
          success: false,
          message: 'R2 存储未配置',
          endpointId: endpoint.id,
        };
      }

      const config = endpoint.config as R2Config;
      const root = config.path ? config.path.replace(/\/+$/, '') : 'backups';
      const key = `${root}/${username}/${filename}`;

      await r2Service.uploadBackup(key, JSON.stringify(backupData, null, 2), 'application/json');

      // 清理旧备份
      await cleanupOldBackupsR2(r2Service, root, username, endpoint.retention);
    }

    return { success: true, message: '备份成功', endpointId: endpoint.id };
  } catch (err) {
    return {
      success: false,
      message: '备份失败',
      errorMessage: (err as Error).message,
      endpointId: endpoint.id,
    };
  }
}

// 清理 S3 旧备份
async function cleanupOldBackupsS3(
  config: S3Config,
  root: string,
  username: string,
  retention: number
): Promise<void> {
  try {
    const prefix = `${root}/backups/${username}/`;
    const response = await s3Request('GET', '/', config, undefined, {
      'list-type': '2',
      prefix: prefix,
    });
    if (!response.ok) return;

    const xml = await response.text();
    const backups: { key: string; lastModified: string }[] = [];
    const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
    let match;

    while ((match = contentsRegex.exec(xml)) !== null) {
      const block = match[1];
      const keyMatch = block.match(/<Key>([^<]+)<\/Key>/);
      const lastModifiedMatch = block.match(/<LastModified>([^<]+)<\/LastModified>/);
      if (keyMatch && !keyMatch[1].endsWith('/')) {
        backups.push({ key: keyMatch[1], lastModified: lastModifiedMatch?.[1] || '' });
      }
    }

    // 按时间排序，删除旧的
    backups.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
    for (let i = retention; i < backups.length; i++) {
      await s3Request('DELETE', '/' + backups[i].key, config);
    }
  } catch (e) {
    console.error('清理旧备份失败:', e);
  }
}

// 清理 WebDAV 旧备份
async function cleanupOldBackupsWebDAV(
  config: WebDAVConfig,
  root: string,
  username: string,
  retention: number
): Promise<void> {
  try {
    const dirPath = `/${root}/backups/${username}/`;
    const baseUrl = config.url.replace(/\/$/, '');
    const response = await webdavRequest('PROPFIND', dirPath, config);
    if (!response.ok && response.status !== 207) return;

    const xml = await response.text();
    const backups: { key: string; lastModified: string }[] = [];

    const responseRegex = /<D:response[^>]*>([\s\S]*?)<\/D:response>/gi;
    let match;

    while ((match = responseRegex.exec(xml)) !== null) {
      const block = match[1];
      const hrefMatch = block.match(/<D:href[^>]*>([^<]+)<\/D:href>/i);
      if (!hrefMatch) continue;

      let href = decodeURIComponent(hrefMatch[1]);
      let relativePath = href;

      if (href.startsWith('/')) {
        try {
          const urlObj = new URL(baseUrl);
          const basePath = urlObj.pathname;
          const fullBase = basePath + dirPath;
          if (href.startsWith(fullBase)) {
            relativePath = href.substring(fullBase.length);
          }
        } catch {
          if (href.includes(dirPath)) {
            relativePath = href.substring(href.indexOf(dirPath) + dirPath.length);
          }
        }
      } else {
        const prefix = dirPath.startsWith('/') ? dirPath.substring(1) : dirPath;
        if (relativePath.startsWith(prefix)) {
          relativePath = relativePath.substring(prefix.length);
        }
      }

      if (!relativePath || relativePath.endsWith('/')) continue;

      const sizeMatch = block.match(/<D:getcontentlength[^>]*>([^<]+)<\/D:getcontentlength>/i);
      const size = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;
      if (size === 0) continue;

      const lastModifiedMatch = block.match(
        /<D:getlastmodified[^>]*>([^<]+)<\/D:getlastmodified>/i
      );
      backups.push({
        key: `${root}/backups/${username}/${relativePath}`,
        lastModified: lastModifiedMatch ? lastModifiedMatch[1] : '',
      });
    }

    // 按时间排序，删除旧的
    backups.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
    for (let i = retention; i < backups.length; i++) {
      await webdavRequest('DELETE', '/' + backups[i].key, config);
    }
  } catch (e) {
    console.error('清理 WebDAV 旧备份失败:', e);
  }
}

// 清理 R2 旧备份
async function cleanupOldBackupsR2(
  r2Service: R2StorageService,
  root: string,
  username: string,
  retention: number
): Promise<void> {
  try {
    const prefix = `${root}/${username}/`;
    const backups = await r2Service.listBackups(prefix);

    if (backups.length <= retention) return;

    backups.sort((a, b) => {
      const dateA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
      const dateB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
      return dateB - dateA;
    });

    for (let i = retention; i < backups.length; i++) {
      await r2Service.deleteBackup(backups[i].key);
    }
  } catch (e) {
    console.error('清理 R2 旧备份失败:', e);
  }
}

// 列出备份
export async function listBackupsFromEndpoint(
  env: Env,
  username: string,
  endpoint: BackupEndpoint
): Promise<BackupInfo[]> {
  try {
    if (endpoint.type === 's3') {
      const config = endpoint.config as S3Config;
      const root = config.path ? config.path.replace(/\/+$/, '') : 'beeswarm';
      const response = await s3Request('GET', '/', config, undefined, {
        'list-type': '2',
        prefix: `${root}/backups/${username}/`,
      });

      if (!response.ok) throw new Error('列出备份失败');

      const xml = await response.text();
      const backups: BackupInfo[] = [];
      const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
      let match;

      while ((match = contentsRegex.exec(xml)) !== null) {
        const block = match[1];
        const keyMatch = block.match(/<Key>([^<]+)<\/Key>/);
        const sizeMatch = block.match(/<Size>([^<]+)<\/Size>/);
        const lastModifiedMatch = block.match(/<LastModified>([^<]+)<\/LastModified>/);
        if (keyMatch && !keyMatch[1].endsWith('/')) {
          backups.push({
            key: keyMatch[1],
            size: sizeMatch ? parseInt(sizeMatch[1], 10) : 0,
            lastModified: lastModifiedMatch ? lastModifiedMatch[1] : '',
          });
        }
      }
      return backups.sort((a, b) => b.key.localeCompare(a.key));
    } else if (endpoint.type === 'webdav') {
      const config = endpoint.config as WebDAVConfig;
      const root = config.path ? config.path.replace(/\/+$/, '') : 'beeswarm';
      const dirPath = `/${root}/backups/${username}/`;

      const response = await webdavRequest('PROPFIND', dirPath, config);
      if (!response.ok && response.status !== 207) {
        throw new Error('列出 WebDAV 备份失败');
      }

      const xml = await response.text();
      const backups: BackupInfo[] = [];

      // 计算 WebDAV 服务器的基础路径（用于从 href 中提取相对路径）
      // 例如 url=https://dav.example.com/dav/Koofr, dirPath=/beeswarm/backups/user/
      // PROPFIND 请求的完整 URL = https://dav.example.com/dav/Koofr/beeswarm/backups/user/
      // 返回的 href 可能是 /dav/Koofr/beeswarm/backups/user/filename.json
      const baseUrl = config.url.replace(/\/$/, '');

      // 解析 WebDAV PROPFIND 响应 (multistatus XML)
      const responseRegex = /<D:response[^>]*>([\s\S]*?)<\/D:response>/gi;
      let match;

      while ((match = responseRegex.exec(xml)) !== null) {
        const block = match[1];

        // 提取 href
        const hrefMatch = block.match(/<D:href[^>]*>([^<]+)<\/D:href>/i);
        if (!hrefMatch) continue;

        let href = decodeURIComponent(hrefMatch[1]);

        // 从 href 中提取相对于 dirPath 的文件名
        // href 可能是完整路径如 /dav/Koofr/beeswarm/backups/user/file.json
        // 也可能只是相对路径如 beeswarm/backups/user/file.json
        let relativePath = href;

        // 尝试从完整 URL 中提取
        if (href.startsWith('/')) {
          // 绝对路径：尝试匹配 baseUrl 的路径部分
          try {
            const urlObj = new URL(baseUrl);
            const basePath = urlObj.pathname; // 如 /dav/Koofr
            const fullBase = basePath + dirPath; // 如 /dav/Koofr/beeswarm/backups/user/
            if (href.startsWith(fullBase)) {
              relativePath = href.substring(fullBase.length);
            }
          } catch {
            // URL 解析失败，尝试直接匹配 dirPath
            if (href.endsWith(dirPath)) {
              relativePath = '';
            } else if (href.includes(dirPath)) {
              relativePath = href.substring(href.indexOf(dirPath) + dirPath.length);
            }
          }
        } else {
          // 相对路径：直接去掉 dirPath 前缀
          const prefix = dirPath.startsWith('/') ? dirPath.substring(1) : dirPath;
          if (relativePath.startsWith(prefix)) {
            relativePath = relativePath.substring(prefix.length);
          }
        }

        // 跳过目录本身和空路径
        if (!relativePath || relativePath.endsWith('/')) continue;

        // 提取内容长度
        const sizeMatch = block.match(/<D:getcontentlength[^>]*>([^<]+)<\/D:getcontentlength>/i);
        const size = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;

        // 跳过 0 字节的条目（通常是目录）
        if (size === 0) continue;

        // 提取最后修改时间
        const lastModifiedMatch = block.match(
          /<D:getlastmodified[^>]*>([^<]+)<\/D:getlastmodified>/i
        );
        const lastModified = lastModifiedMatch ? lastModifiedMatch[1] : '';

        backups.push({
          key: `${root}/backups/${username}/${relativePath}`,
          size,
          lastModified,
        });
      }

      return backups.sort((a, b) => b.key.localeCompare(a.key));
    } else if (endpoint.type === 'r2') {
      const r2Service = new R2StorageService(env);
      if (!r2Service.isAvailable()) {
        throw new Error('R2 存储未配置');
      }

      const config = endpoint.config as R2Config;
      const root = config.path ? config.path.replace(/\/+$/, '') : 'backups';
      const prefix = `${root}/${username}/`;

      const backups = await r2Service.listBackups(prefix);
      return backups.map(b => ({
        key: b.key,
        size: b.size || 0,
        lastModified: b.uploadedAt || '',
      })).sort((a, b) => b.key.localeCompare(a.key));
    }
    return [];
  } catch {
    throw new Error('列出备份时出错');
  }
}

// 从端点恢复备份
export async function restoreBackupFromEndpoint(
  env: Env,
  username: string,
  endpoint: BackupEndpoint,
  backupKey: string
): Promise<BackupResult> {
  // 恢复功能暂不支持
  return {
    success: false,
    message: '恢复功能暂不可用'
  };
}

// 下载备份文件
export async function downloadBackupFromEndpoint(
  env: Env,
  username: string,
  endpoint: BackupEndpoint,
  backupKey: string
): Promise<Response> {
  let response: Response;

  if (endpoint.type === 's3') {
    const config = endpoint.config as S3Config;
    response = await s3Request('GET', '/' + backupKey, config);
  } else if (endpoint.type === 'webdav') {
    const config = endpoint.config as WebDAVConfig;
    const normalizedKey = backupKey.startsWith('/') ? backupKey : '/' + backupKey;
    response = await webdavRequest('GET', normalizedKey, config);
  } else if (endpoint.type === 'r2') {
    const r2Service = new R2StorageService(env);
    if (!r2Service.isAvailable()) {
      return new Response(JSON.stringify({ error: 'R2 存储未配置' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const content = await r2Service.downloadBackup(backupKey);
    if (content === null) {
      return new Response(JSON.stringify({ error: '备份文件不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(content, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } else {
    return new Response(JSON.stringify({ error: '不支持的备份类型' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return response;
}

// 删除备份
export async function deleteBackupFromEndpoint(
  env: Env,
  username: string,
  endpoint: BackupEndpoint,
  backupKey: string
): Promise<BackupResult> {
  try {
    if (endpoint.type === 's3') {
      const config = endpoint.config as S3Config;
      const response = await s3Request('DELETE', '/' + backupKey, config);
      if (response.status !== 204 && !response.ok) {
        return { success: false, message: '删除备份失败', statusCode: response.status };
      }
      return { success: true, message: '删除备份成功' };
    } else if (endpoint.type === 'webdav') {
      const config = endpoint.config as WebDAVConfig;
      const normalizedKey = backupKey.startsWith('/') ? backupKey : '/' + backupKey;
      const response = await webdavRequest('DELETE', normalizedKey, config);
      if (response.status !== 204 && !response.ok) {
        return { success: false, message: '删除备份失败', statusCode: response.status };
      }
      return { success: true, message: '删除备份成功' };
    } else if (endpoint.type === 'r2') {
      const r2Service = new R2StorageService(env);
      if (!r2Service.isAvailable()) {
        return { success: false, message: 'R2 存储未配置' };
      }
      await r2Service.deleteBackup(backupKey);
      return { success: true, message: '删除备份成功' };
    } else {
      return { success: false, message: '不支持的备份类型' };
    }
  } catch (err) {
    return { success: false, message: '删除失败', errorMessage: (err as Error).message };
  }
}

// 测试备份端连接
export async function testBackupEndpoint(
  endpoint: BackupEndpoint,
  env?: Env
): Promise<{
  success: boolean;
  message: string;
  statusCode?: number | null;
  errorMessage?: string;
}> {
  try {
    if (endpoint.type === 's3') {
      const config = endpoint.config as S3Config;
      const response = await s3Request('GET', '/', config, undefined, {
        'list-type': '2',
        'max-keys': '1',
      });
      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          message: '连接失败',
          statusCode: response.status,
          errorMessage: errorText.substring(0, 200),
        };
      }
      return { success: true, message: 'S3 连接成功', statusCode: null };
    } else if (endpoint.type === 'webdav') {
      const config = endpoint.config as WebDAVConfig;
      const response = await webdavRequest('PROPFIND', '/', config);
      if (response.status === 429) {
        return { success: false, message: '请求太频繁', statusCode: 429 };
      }
      if (!response.ok && response.status !== 207) {
        return { success: false, message: '连接失败', statusCode: response.status };
      }
      return { success: true, message: 'WebDAV 连接成功', statusCode: null };
    } else if (endpoint.type === 'r2') {
      if (!env) {
        return { success: false, message: '测试 R2 连接需要环境变量', statusCode: null };
      }
      const r2Service = new R2StorageService(env);
      if (!r2Service.isAvailable()) {
        return { success: false, message: 'R2 存储未配置', statusCode: null };
      }
      return { success: true, message: 'R2 连接成功', statusCode: null };
    }

    return { success: false, message: '不支持的备份类型', statusCode: null };
  } catch (err) {
    return {
      success: false,
      message: '连接错误',
      statusCode: null,
      errorMessage: (err as Error).message,
    };
  }
}

// 执行所有启用的备份（并发上传，顺序更新状态）
export async function executeAllBackups(env: Env, username: string): Promise<BackupResult[]> {
  const endpoints = await getBackupEndpoints(env, username);
  const enabledEndpoints = endpoints.filter((e) => e.enabled);

  if (enabledEndpoints.length === 0) {
    return [{ success: false, message: '没有启用的备份端点' }];
  }

  // 并发上传（读取备份数据只发生一次，各端点独立上传）
  const uploadResults = await Promise.all(
    enabledEndpoints.map(async (endpoint) => {
      const result = await uploadBackupToEndpoint(env, username, endpoint);
      result.endpointName = endpoint.name;
      return { endpoint, result };
    })
  );

  // 顺序更新状态
  for (const { endpoint, result } of uploadResults) {
    endpoint.lastBackup = {
      time: new Date().toISOString(),
      status: result.success ? 'success' : 'failed',
      message: result.message,
    };
    await saveBackupEndpoint(env, username, endpoint);
  }

  return uploadResults.map((r) => r.result);
}
