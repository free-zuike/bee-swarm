// ============================================
// 多备份端备份服务（支持 S3/WebDAV）
// ============================================
import { AwsClient } from 'aws4fetch';
import type { Env } from '../types';

// 备份端类型
export type EndpointType = 's3' | 'webdav';

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
}

// 获取用户的所有备份端
export async function getBackupEndpoints(env: Env, username: string): Promise<BackupEndpoint[]> {
  const kvKey = `user:${username}:backup_endpoints`;
  const configStr = await env.SUBSCRIPTIONS.get(kvKey);
  if (!configStr) return [];
  try {
    return JSON.parse(configStr);
  } catch (e) {
    console.error(`[Backup] Failed to parse endpoints for ${username}`);
    return [];
  }
}

// 保存用户的所有备份端
export async function saveBackupEndpoints(env: Env, username: string, endpoints: BackupEndpoint[]): Promise<void> {
  const kvKey = `user:${username}:backup_endpoints`;
  await env.SUBSCRIPTIONS.put(kvKey, JSON.stringify(endpoints));
}

// 获取单个备份端
export async function getBackupEndpoint(env: Env, username: string, endpointId: string): Promise<BackupEndpoint | null> {
  const endpoints = await getBackupEndpoints(env, username);
  return endpoints.find(e => e.id === endpointId) || null;
}

// 添加或更新备份端
export async function saveBackupEndpoint(env: Env, username: string, endpoint: BackupEndpoint): Promise<void> {
  const endpoints = await getBackupEndpoints(env, username);
  const index = endpoints.findIndex(e => e.id === endpoint.id);
  if (index >= 0) {
    endpoints[index] = endpoint;
  } else {
    endpoints.push(endpoint);
  }
  await saveBackupEndpoints(env, username, endpoints);
}

// 删除备份端
export async function deleteBackupEndpoint(env: Env, username: string, endpointId: string): Promise<boolean> {
  const endpoints = await getBackupEndpoints(env, username);
  const newEndpoints = endpoints.filter(e => e.id !== endpointId);
  if (newEndpoints.length === endpoints.length) return false;
  await saveBackupEndpoints(env, username, newEndpoints);
  return true;
}

// 导出所有数据
export async function exportAllData(env: Env, username: string): Promise<BackupData> {
  const data: Record<string, string> = {};
  let cursor: string | undefined;
  do {
    const list = await env.SUBSCRIPTIONS.list({ prefix: `user:${username}:`, cursor });
    for (const key of list.keys) {
      const value = await env.SUBSCRIPTIONS.get(key.name);
      if (value !== null) data[key.name] = value;
    }
    cursor = list.cursor;
  } while (cursor);
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
  const endpoint = config.endpoint.startsWith('http') ? config.endpoint : `https://${config.endpoint}`;
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
    'Authorization': `Basic ${auth}`,
  };
  if (body) headers['Content-Type'] = 'application/json';
  
  const response = await fetch(url, { method, headers, body });
  
  // 429 限流时重试（最多3次，间隔1秒）
  if (response.status === 429 && retryCount < 3) {
    await new Promise(resolve => setTimeout(resolve, 1000));
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
    const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${date}.json`;
    
    if (endpoint.type === 's3') {
      const config = endpoint.config as S3Config;
      const root = config.path ? config.path.replace(/\/+$/, '') : 'beeswarm';
      const key = `${root}/backups/${username}/${filename}`;
      const response = await s3Request('PUT', '/' + key, config, JSON.stringify(backupData, null, 2));
      
      if (!response.ok) {
        return { success: false, message: 'S3 上传失败 (' + response.status + ')', endpointId: endpoint.id };
      }
      
      // 清理旧备份
      await cleanupOldBackupsS3(config, root, username, endpoint.retention);
      
    } else if (endpoint.type === 'webdav') {
      const config = endpoint.config as WebDAVConfig;
      const root = config.path ? config.path.replace(/\/+$/, '') : 'beeswarm';
      const path = `${root}/backups/${username}/${filename}`;
      
      // 确保目录存在（忽略 405 目录已存在错误）
      const mkcolResponse = await webdavRequest('MKCOL', `/${root}/`, config);
      if (!mkcolResponse.ok && mkcolResponse.status !== 405) {
        return { success: false, message: 'WebDAV 创建目录失败 (' + mkcolResponse.status + ')', endpointId: endpoint.id };
      }
      
      await new Promise(resolve => setTimeout(resolve, 500)); // 避免限流
      
      const mkcolResponse2 = await webdavRequest('MKCOL', `/${root}/backups/`, config);
      if (!mkcolResponse2.ok && mkcolResponse2.status !== 405) {
        return { success: false, message: 'WebDAV 创建目录失败 (' + mkcolResponse2.status + ')', endpointId: endpoint.id };
      }
      
      await new Promise(resolve => setTimeout(resolve, 500)); // 避免限流
      
      const mkcolResponse3 = await webdavRequest('MKCOL', `/${root}/backups/${username}/`, config);
      if (!mkcolResponse3.ok && mkcolResponse3.status !== 405) {
        return { success: false, message: 'WebDAV 创建目录失败 (' + mkcolResponse3.status + ')', endpointId: endpoint.id };
      }
      
      await new Promise(resolve => setTimeout(resolve, 500)); // 避免限流
      
      const response = await webdavRequest('PUT', '/' + path, config, JSON.stringify(backupData, null, 2));
      
      if (!response.ok && response.status !== 201 && response.status !== 204) {
        const errorText = await response.text().catch(() => '');
        return { success: false, message: 'WebDAV 上传失败 (' + response.status + '): ' + errorText.substring(0, 200), endpointId: endpoint.id };
      }
      
      // 清理旧备份
      await cleanupOldBackupsWebDAV(config, root, username, endpoint.retention);
    }
    
    return { success: true, message: '备份成功', endpointId: endpoint.id };
  } catch (err: any) {
    return { success: false, message: '备份失败: ' + err.message, endpointId: endpoint.id };
  }
}

// 清理 S3 旧备份
async function cleanupOldBackupsS3(config: S3Config, root: string, username: string, retention: number): Promise<void> {
  try {
    const prefix = `${root}/backups/${username}/`;
    const response = await s3Request('GET', '/', config, undefined, { 'list-type': '2', 'prefix': prefix });
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
async function cleanupOldBackupsWebDAV(config: WebDAVConfig, root: string, username: string, retention: number): Promise<void> {
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
      
      const lastModifiedMatch = block.match(/<D:getlastmodified[^>]*>([^<]+)<\/D:getlastmodified>/i);
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
      const response = await s3Request('GET', '/', config, undefined, { 'list-type': '2', 'prefix': `${root}/backups/${username}/` });
      
      if (!response.ok) throw new Error('获取备份列表失败 (' + response.status + ')');
      
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
        throw new Error('获取 WebDAV 备份列表失败 (' + response.status + ')');
      }
      
      const xml = await response.text();
      const backups: BackupInfo[] = [];
      
      // 计算 WebDAV 服务器的基础路径（用于从 href 中提取相对路径）
      // 例如 url=https://dav.example.com/dav/Koofr, dirPath=/beeswarm/backups/user/
      // PROPFIND 请求的完整 URL = https://dav.example.com/dav/Koofr/beeswarm/backups/user/
      // 返回的 href 可能是 /dav/Koofr/beeswarm/backups/user/filename.json
      const baseUrl = config.url.replace(/\/$/, '');
      const fullRequestPath = baseUrl + dirPath; // 完整请求路径
      
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
        const lastModifiedMatch = block.match(/<D:getlastmodified[^>]*>([^<]+)<\/D:getlastmodified>/i);
        const lastModified = lastModifiedMatch ? lastModifiedMatch[1] : '';
        
        backups.push({
          key: `${root}/backups/${username}/${relativePath}`,
          size,
          lastModified,
        });
      }
      
      return backups.sort((a, b) => b.key.localeCompare(a.key));
    }
    return [];
  } catch (err: any) {
    throw new Error('列出备份失败: ' + err.message);
  }
}

// 从端点恢复备份
export async function restoreBackupFromEndpoint(
  env: Env,
  username: string,
  endpoint: BackupEndpoint,
  backupKey: string
): Promise<BackupResult> {
  try {
    let response: Response;
    
    if (endpoint.type === 's3') {
      const config = endpoint.config as S3Config;
      response = await s3Request('GET', '/' + backupKey, config);
    } else if (endpoint.type === 'webdav') {
      const config = endpoint.config as WebDAVConfig;
      response = await webdavRequest('GET', backupKey, config);
    } else {
      return { success: false, message: '不支持的备份类型' };
    }
    
    if (!response.ok) {
      return { success: false, message: '下载备份失败 (' + response.status + ')' };
    }
    
    const backupData: BackupData = await response.json();
    if (!backupData.data || typeof backupData.data !== 'object') {
      return { success: false, message: '无效的备份数据格式' };
    }
    
    // 清空当前用户的数据（只删除 user:${username}: 前缀的键）
    let cursor: string | undefined;
    do {
      const list = await env.SUBSCRIPTIONS.list({ prefix: `user:${username}:`, cursor });
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

// 删除备份
export async function deleteBackupFromEndpoint(
  env: Env,
  username: string,
  endpoint: BackupEndpoint,
  backupKey: string
): Promise<BackupResult> {
  try {
    let response: Response;
    
    if (endpoint.type === 's3') {
      const config = endpoint.config as S3Config;
      response = await s3Request('DELETE', '/' + backupKey, config);
    } else if (endpoint.type === 'webdav') {
      const config = endpoint.config as WebDAVConfig;
      response = await webdavRequest('DELETE', backupKey, config);
    } else {
      return { success: false, message: '不支持的备份类型' };
    }
    
    if (response.status !== 204 && !response.ok) {
      return { success: false, message: '删除失败 (' + response.status + ')' };
    }
    return { success: true, message: '删除成功' };
  } catch (err: any) {
    return { success: false, message: '删除失败: ' + err.message };
  }
}

// 测试备份端连接
export async function testBackupEndpoint(endpoint: BackupEndpoint): Promise<{ success: boolean; message: string }> {
  try {
    if (endpoint.type === 's3') {
      const config = endpoint.config as S3Config;
      const response = await s3Request('GET', '/', config, undefined, { 'list-type': '2', 'max-keys': '1' });
      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, message: '连接失败 (' + response.status + '): ' + errorText.substring(0, 200) };
      }
      return { success: true, message: 'S3 连接成功' };
      
    } else if (endpoint.type === 'webdav') {
      const config = endpoint.config as WebDAVConfig;
      const response = await webdavRequest('PROPFIND', '/', config);
      if (response.status === 429) {
        return { success: false, message: '请求过于频繁 (429)，请稍后再试' };
      }
      if (!response.ok && response.status !== 207) {
        return { success: false, message: '连接失败 (' + response.status + ')' };
      }
      return { success: true, message: 'WebDAV 连接成功' };
    }
    
    return { success: false, message: '不支持的备份类型' };
  } catch (err: any) {
    return { success: false, message: '连接异常: ' + err.message };
  }
}

// 执行所有启用的备份
export async function executeAllBackups(env: Env, username: string): Promise<BackupResult[]> {
  const endpoints = await getBackupEndpoints(env, username);
  const enabledEndpoints = endpoints.filter(e => e.enabled);
  
  if (enabledEndpoints.length === 0) {
    return [{ success: false, message: '没有启用的备份端' }];
  }
  
  const results: BackupResult[] = [];
  for (const endpoint of enabledEndpoints) {
    const result = await uploadBackupToEndpoint(env, username, endpoint);
    result.endpointName = endpoint.name;
    
    // 更新最后备份状态
    endpoint.lastBackup = {
      time: new Date().toISOString(),
      status: result.success ? 'success' : 'failed',
      message: result.message,
    };
    await saveBackupEndpoint(env, username, endpoint);
    
    results.push(result);
  }
  
  return results;
}

// 兼容性：获取旧版 S3 配置并迁移
export async function migrateOldS3Config(env: Env, username: string): Promise<void> {
  const oldConfigStr = await env.SUBSCRIPTIONS.get(`user:${username}:s3_config`);
  if (!oldConfigStr) return;
  
  try {
    const oldConfig: S3Config = JSON.parse(oldConfigStr);
    const endpoints = await getBackupEndpoints(env, username);
    
    // 如果已经有备份端，不重复迁移
    if (endpoints.length > 0) return;
    
    // 创建新的备份端
    const newEndpoint: BackupEndpoint = {
      id: crypto.randomUUID(),
      name: '默认备份',
      type: 's3',
      enabled: true,
      config: oldConfig,
      schedule: {
        enabled: false,
        interval: 24,
        startTime: '02:00',
      },
      retention: 30,
    };
    
    endpoints.push(newEndpoint);
    await saveBackupEndpoints(env, username, endpoints);
    
    // 删除旧配置
    await env.SUBSCRIPTIONS.delete(`user:${username}:s3_config`);
  } catch (e) {
    console.error('迁移旧配置失败:', e);
  }
}
