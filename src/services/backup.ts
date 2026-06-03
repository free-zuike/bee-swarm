// ============================================
// 多备份端备份服务（支持 S3/WebDAV/R2）
// ============================================
import { AwsClient } from 'aws4fetch';
import type { Env } from '../types';
import { convertTimezone } from '../utils/timezone';
import { R2StorageService } from './r2StorageService';
import { 
  exportUserData, 
  importUserData, 
  validateBackupData,
  computeDataHash,
  createBackupRecord,
  updateBackupRecordStatus,
  getBackupRecords,
  deleteBackupRecord,
  type UserDataExport
} from './dataExportService';

// 备份端类型
export type EndpointType = 's3' | 'webdav' | 'r2';

// S3 配置
export interface S3Config {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  path?: string;
  pathStyle?: boolean;
}

// WebDAV 配置
export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  path?: string;
}

// R2 配置
export interface R2Config {
  path?: string;
}

// 备份端点配置
export interface BackupEndpoint {
  id: string;
  name: string;
  type: EndpointType;
  enabled: boolean;
  config: S3Config | WebDAVConfig | R2Config;
  r2_domain?: string;
  schedule?: {
    enabled: boolean;
    interval: number;
    startTime: string;
    timezone?: string;
    startDay?: number;
  };
  retention?: number;
  lastBackup?: {
    time: string;
    status: string;
    message: string;
  };
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
  
  try {
    const result = await env.DB.prepare(
      'SELECT * FROM backup_endpoints WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(username).all<any>();

    return (result.results || []).map((row: any) => ({
      id: row.id,
      name: row.name || '默认备份',
      type: row.type as EndpointType,
      enabled: row.enabled === 1,
      config: JSON.parse(row.config || '{}'),
      r2_domain: row.r2_domain,
      schedule: row.schedule ? JSON.parse(row.schedule) : { enabled: false, interval: 24, startTime: '02:00' },
      retention: row.retention || 30,
      lastBackup: row.last_backup ? JSON.parse(row.last_backup) : undefined,
    }));
  } catch (e) {
    console.error('[Backup] 获取备份端点失败', e);
    return [];
  }
}

// 保存用户的所有备份端
export async function saveBackupEndpoints(
  env: Env,
  username: string,
  endpoints: BackupEndpoint[]
): Promise<void> {
  if (!env.DB) return;
  
  // 确保用户存在，这里如果失败会抛出错误，阻止后续操作
  await ensureUserExists(env, username);
  
  try {
    // 在一个事务中删除并重新插入
    const stmt = env.DB.prepare(
      'DELETE FROM backup_endpoints WHERE user_id = ?'
    ).bind(username);
    
    await stmt.run();
    
    for (const endpoint of endpoints) {
      await saveSingleEndpoint(env, username, endpoint);
    }
  } catch (e) {
    const error = e as Error;
    console.error('[Backup] 保存备份端点失败:', error);
    
    // 如果是外键约束失败，说明用户记录可能在检查后被删除了
    if (error.message.includes('FOREIGN KEY constraint failed') || 
        error.message.includes('SQLITE_CONSTRAINT_FOREIGNKEY')) {
      throw new Error(`保存备份端点失败：用户记录不存在或已被删除。请重新登录后重试。`);
    }
    
    throw error;
  }
}

// 保存单个备份端点
async function saveSingleEndpoint(
  env: Env,
  username: string,
  endpoint: BackupEndpoint
): Promise<void> {
  const now = new Date().toISOString();
  
  const stmt = env.DB.prepare(`
    INSERT INTO backup_endpoints (id, user_id, name, type, config, r2_domain, enabled, schedule, retention, last_backup, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    endpoint.id,
    username,
    endpoint.name || '默认备份',
    endpoint.type,
    JSON.stringify(endpoint.config),
    endpoint.r2_domain || null,
    endpoint.enabled ? 1 : 0,
    JSON.stringify(endpoint.schedule || { enabled: false, interval: 24, startTime: '02:00' }),
    endpoint.retention || 30,
    endpoint.lastBackup ? JSON.stringify(endpoint.lastBackup) : null,
    now,
    now
  );
  
  await stmt.run();
}

// 确保用户存在于数据库中
async function ensureUserExists(env: Env, username: string): Promise<void> {
  if (!env.DB) return;
  
  try {
    // 先检查用户是否存在
    const check = await env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(username).first<any>();
    
    if (check) {
      // 用户已存在，直接返回
      return;
    }
    
    // 用户不存在，创建
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO users (id, email, password, created_at, updated_at, role, disabled)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, username, 'placeholder', now, now, 'user', 0).run();
    
    console.log('[Backup] 用户不存在，已自动创建:', username);
  } catch (e) {
    const error = e as Error;
    // 唯一约束冲突（用户已存在）是预期情况，忽略
    if (error.message.includes('UNIQUE constraint failed') || 
        error.message.includes('SQLITE_CONSTRAINT_UNIQUE')) {
      console.log('[Backup] 用户已存在，跳过创建:', username);
      return;
    }
    
    // 其他错误，比如外键约束、数据库连接问题等，需要抛出
    console.error('[Backup] 创建用户失败:', error);
    throw new Error(`无法确保用户存在: ${error.message}`);
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
  
  // 确保用户存在，这里如果失败会抛出错误，阻止后续操作
  await ensureUserExists(env, username);
  
  try {
    // 先删除旧的，再插入新的
    await env.DB.prepare(
      'DELETE FROM backup_endpoints WHERE id = ? AND user_id = ?'
    ).bind(endpoint.id, username).run();
    
    await saveSingleEndpoint(env, username, endpoint);
  } catch (e) {
    const error = e as Error;
    console.error('[Backup] 添加或更新备份端点失败:', error);
    
    // 如果是外键约束失败，说明用户记录可能在检查后被删除了
    if (error.message.includes('FOREIGN KEY constraint failed') || 
        error.message.includes('SQLITE_CONSTRAINT_FOREIGNKEY')) {
      throw new Error(`保存备份端点失败：用户记录不存在或已被删除。请重新登录后重试。`);
    }
    
    throw error;
  }
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

// 备份到单个端点
export async function uploadBackupToEndpoint(
  env: Env,
  username: string,
  endpoint: BackupEndpoint,
  data?: any
): Promise<BackupResult> {
  let backupRecordId = '';

  try {
    // 创建备份记录
    backupRecordId = crypto.randomUUID();
    await createBackupRecord(env, {
      id: backupRecordId,
      userId: username,
      endpointId: endpoint.id,
      endpointName: endpoint.name,
      status: 'pending',
    });

    // 导出用户数据（如果没有提供数据）
    const backupData = data || await exportUserData(env, username);
    const filename = `backup-${Date.now()}.json`;
    const jsonContent = JSON.stringify(backupData, null, 2);
    const dataHash = computeDataHash(backupData);

    // 更新备份记录为进行中
    await updateBackupRecordStatus(env, backupRecordId, username, 'pending', {
      sizeBytes: new Blob([jsonContent]).size,
      dataHash,
    });

    let storagePath = '';

    if (endpoint.type === 's3') {
      const config = endpoint.config as S3Config;
      const root = config.path || 'beeswarm';
      const key = `${root}/backups/${username}/${filename}`;
      storagePath = `s3://${config.bucket}/${key}`;

      const awsClient = new AwsClient({
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        service: 's3',
        region: config.region || 'auto',
      });

      const url = config.pathStyle
        ? `${config.endpoint}/${config.bucket}/${key}`
        : `https://${config.bucket}.${config.endpoint.replace(/^https?:\/\//, '')}/${key}`;

      const response = await awsClient.fetch(url, {
        method: 'PUT',
        body: jsonContent,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          message: `S3 upload failed (${response.status}): ${errorText.substring(0, 200)}`,
          endpointId: endpoint.id,
          statusCode: response.status,
        };
      }

      // 清理旧备份
      await cleanupOldBackupsS3(config, root, username, endpoint.retention || 30);
    } else if (endpoint.type === 'webdav') {
      const config = endpoint.config as WebDAVConfig;
      const root = config.path || 'beeswarm';
      const url = `${config.url.replace(/\/$/, '')}/${root}/backups/${username}/${filename}`;
      storagePath = url;

      // 确保目录存在
      try {
        await webdavRequest('MKCOL', `${config.url.replace(/\/$/, '')}/${root}/`, config);
        await webdavRequest('MKCOL', `${config.url.replace(/\/$/, '')}/${root}/backups/`, config);
        await webdavRequest('MKCOL', `${config.url.replace(/\/$/, '')}/${root}/backups/${username}/`, config);
      } catch (e) {
        // 目录可能已经存在，忽略错误
      }

      const response = await webdavRequest('PUT', url, config, jsonContent);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          message: `WebDAV upload failed (${response.status}): ${errorText.substring(0, 200)}`,
          endpointId: endpoint.id,
          statusCode: response.status,
        };
      }

      // 清理旧备份
      await cleanupOldBackupsWebDAV(config, root, username, endpoint.retention || 30);
    } else if (endpoint.type === 'r2') {
      const r2Service = new R2StorageService(env);
      if (!r2Service.isAvailable()) {
        return {
          success: false,
          message: 'R2 storage not available',
          endpointId: endpoint.id,
        };
      }

      const config = endpoint.config as R2Config;
      const root = config.path || 'backups';
      const key = `${root}/${username}/${filename}`;
      storagePath = `r2://${key}`;

      await r2Service.uploadBackup(key, jsonContent, 'application/json');

      // 清理旧备份
      await cleanupOldBackupsR2(r2Service, root, username, endpoint.retention || 30);
    }

    // 更新备份记录为成功
    await updateBackupRecordStatus(env, backupRecordId, username, 'success', {
      storagePath,
      sizeBytes: new Blob([jsonContent]).size,
      dataHash,
      completedAt: new Date().toISOString(),
    });

    return { success: true, message: 'Backup successful', endpointId: endpoint.id, count: 1 };
  } catch (err) {
    // 更新备份记录为失败
    if (backupRecordId) {
      await updateBackupRecordStatus(env, backupRecordId, username, 'failed', {
        errorMessage: (err as Error).message,
        completedAt: new Date().toISOString(),
      });
    }

    return {
      success: false,
      message: 'Backup failed',
      errorMessage: (err as Error).message,
      endpointId: endpoint.id,
    };
  }
}

// WebDAV 请求辅助函数
async function webdavRequest(
  method: string,
  url: string,
  config: WebDAVConfig,
  body?: string
): Promise<Response> {
  const headers = new Headers();
  const credentials = btoa(`${config.username}:${config.password}`);
  headers.set('Authorization', `Basic ${credentials}`);
  if (body) {
    headers.set('Content-Type', 'application/json');
  }

  return await fetch(url, {
    method,
    headers,
    body: body || undefined,
  });
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
    const awsClient = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: 's3',
      region: config.region || 'auto',
    });

    const listUrl = config.pathStyle
      ? `${config.endpoint}/${config.bucket}?list-type=2&prefix=${encodeURIComponent(prefix)}`
      : `https://${config.bucket}.${config.endpoint.replace(/^https?:\/\//, '')}?list-type=2&prefix=${encodeURIComponent(prefix)}`;

    const response = await awsClient.fetch(listUrl, { method: 'GET' });
    const xml = await response.text();

    // 简单的 XML 解析
    const keyMatches = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)];
    const lastModifiedMatches = [...xml.matchAll(/<LastModified>([^<]+)<\/LastModified>/g)];

    const files: { key: string; lastModified: string }[] = [];
    for (let i = 0; i < keyMatches.length; i++) {
      if (keyMatches[i]?.[1] && lastModifiedMatches[i]?.[1]) {
        files.push({
          key: keyMatches[i][1],
          lastModified: lastModifiedMatches[i][1],
        });
      }
    }

    // 按时间排序，删除旧的
    files.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
    for (let i = retention; i < files.length; i++) {
      const deleteUrl = config.pathStyle
        ? `${config.endpoint}/${config.bucket}/${files[i].key}`
        : `https://${config.bucket}.${config.endpoint.replace(/^https?:\/\//, '')}/${files[i].key}`;
      await awsClient.fetch(deleteUrl, { method: 'DELETE' });
    }
  } catch (e) {
    console.error('清理 S3 旧备份失败', e);
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
    const response = await webdavRequest('PROPFIND', `${baseUrl}${dirPath}`, config);
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
      await webdavRequest('DELETE', `${baseUrl}/${backups[i].key}`, config);
    }
  } catch (e) {
    console.error('清理 WebDAV 旧备份失败', e);
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
    console.error('清理 R2 旧备份失败', e);
  }
}

// 列出备份
export async function listBackupsFromEndpoint(
  env: Env,
  username: string,
  endpoint: BackupEndpoint
): Promise<BackupInfo[]> {
  if (endpoint.type === 's3') {
    const config = endpoint.config as S3Config;
    const root = config.path || 'beeswarm';
    const prefix = `${root}/backups/${username}/`;

    const awsClient = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: 's3',
      region: config.region || 'auto',
    });

    const listUrl = config.pathStyle
      ? `${config.endpoint}/${config.bucket}?list-type=2&prefix=${encodeURIComponent(prefix)}`
      : `https://${config.bucket}.${config.endpoint.replace(/^https?:\/\//, '')}?list-type=2&prefix=${encodeURIComponent(prefix)}`;

    const response = await awsClient.fetch(listUrl, { method: 'GET' });
    const xml = await response.text();

    const keyMatches = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)];
    const lastModifiedMatches = [...xml.matchAll(/<LastModified>([^<]+)<\/LastModified>/g)];
    const sizeMatches = [...xml.matchAll(/<Size>([^<]+)<\/Size>/g)];

    const files: BackupInfo[] = [];
    for (let i = 0; i < keyMatches.length; i++) {
      if (keyMatches[i]?.[1]) {
        files.push({
          key: keyMatches[i][1],
          lastModified: lastModifiedMatches[i]?.[1] || '',
          size: parseInt(sizeMatches[i]?.[1] || '0', 10),
        });
      }
    }

    return files.sort((a, b) => b.key.localeCompare(a.key));
  } else if (endpoint.type === 'webdav') {
    const config = endpoint.config as WebDAVConfig;
    const root = config.path || 'beeswarm';
    const dirPath = `/${root}/backups/${username}/`;
    const baseUrl = config.url.replace(/\/$/, '');
    const response = await webdavRequest('PROPFIND', `${baseUrl}${dirPath}`, config);

    if (!response.ok && response.status !== 207) {
      throw new Error('列出备份失败');
    }

    const xml = await response.text();
    const backups: BackupInfo[] = [];

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
      const lastModifiedMatch = block.match(
        /<D:getlastmodified[^>]*>([^<]+)<\/D:getlastmodified>/i
      );

      backups.push({
        key: `${root}/backups/${username}/${relativePath}`,
        size,
        lastModified: lastModifiedMatch ? lastModifiedMatch[1] : '',
      });
    }

    return backups.sort((a, b) => b.key.localeCompare(a.key));
  } else if (endpoint.type === 'r2') {
    const r2Service = new R2StorageService(env);
    if (!r2Service.isAvailable()) {
      throw new Error('R2 存储未配置');
    }

    const config = endpoint.config as R2Config;
    const root = config.path || 'backups';
    const prefix = `${root}/${username}/`;

    const backups = await r2Service.listBackups(prefix);
    return backups.map(b => ({
      key: b.key,
      size: b.size || 0,
      lastModified: b.uploadedAt || '',
    })).sort((a, b) => b.key.localeCompare(a.key));
  }
  return [];
}

// 恢复备份
export async function restoreBackupFromEndpoint(
  env: Env,
  username: string,
  endpoint: BackupEndpoint,
  key: string
): Promise<BackupResult> {
  const response = await downloadBackupFromEndpoint(env, username, endpoint, key);
  if (!response.ok) {
    return { success: false, message: '恢复备份失败' };
  }

  return { success: true, message: '备份内容已获取' };
}

// 下载备份
export async function downloadBackupFromEndpoint(
  env: Env,
  username: string,
  endpoint: BackupEndpoint,
  key: string
): Promise<Response> {
  if (endpoint.type === 's3') {
    const config = endpoint.config as S3Config;
    const awsClient = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: 's3',
      region: config.region || 'auto',
    });

    const url = config.pathStyle
      ? `${config.endpoint}/${config.bucket}/${key}`
      : `https://${config.bucket}.${config.endpoint.replace(/^https?:\/\//, '')}/${key}`;

    return await awsClient.fetch(url, { method: 'GET' });
  } else if (endpoint.type === 'webdav') {
    const config = endpoint.config as WebDAVConfig;
    const baseUrl = config.url.replace(/\/$/, '');
    const normalizedKey = key.startsWith('/') ? key : `/${key}`;
    return await webdavRequest('GET', `${baseUrl}${normalizedKey}`, config);
  } else if (endpoint.type === 'r2') {
    const r2Service = new R2StorageService(env);
    if (!r2Service.isAvailable()) {
      return new Response(JSON.stringify({ error: 'R2 存储未配置' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const content = await r2Service.downloadBackup(key);
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
}

// 删除备份
export async function deleteBackupFromEndpoint(
  env: Env,
  username: string,
  endpoint: BackupEndpoint,
  key: string
): Promise<BackupResult> {
  try {
    if (endpoint.type === 's3') {
      const config = endpoint.config as S3Config;
      const awsClient = new AwsClient({
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        service: 's3',
        region: config.region || 'auto',
      });

      const url = config.pathStyle
        ? `${config.endpoint}/${config.bucket}/${key}`
        : `https://${config.bucket}.${config.endpoint.replace(/^https?:\/\//, '')}/${key}`;

      const response = await awsClient.fetch(url, { method: 'DELETE' });
      if (response.status !== 204 && !response.ok) {
        return { success: false, message: '删除备份失败', statusCode: response.status };
      }
      return { success: true, message: '删除备份成功' };
    } else if (endpoint.type === 'webdav') {
      const config = endpoint.config as WebDAVConfig;
      const baseUrl = config.url.replace(/\/$/, '');
      const normalizedKey = key.startsWith('/') ? key : `/${key}`;
      const response = await webdavRequest('DELETE', `${baseUrl}${normalizedKey}`, config);
      if (response.status !== 204 && !response.ok) {
        return { success: false, message: '删除备份失败', statusCode: response.status };
      }
      return { success: true, message: '删除备份成功' };
    } else if (endpoint.type === 'r2') {
      const r2Service = new R2StorageService(env);
      if (!r2Service.isAvailable()) {
        return { success: false, message: 'R2 存储未配置' };
      }
      await r2Service.deleteBackup(key);
      return { success: true, message: '删除备份成功' };
    } else {
      return { success: false, message: '不支持的备份类型' };
    }
  } catch (err) {
    return { success: false, message: '删除失败', errorMessage: (err as Error).message };
  }
}

// 测试备份端点连接
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
      const awsClient = new AwsClient({
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        service: 's3',
        region: config.region || 'auto',
      });

      const url = config.pathStyle
        ? `${config.endpoint}/${config.bucket}?list-type=2&max-keys=1`
        : `https://${config.bucket}.${config.endpoint.replace(/^https?:\/\//, '')}?list-type=2&max-keys=1`;

      const response = await awsClient.fetch(url, { method: 'GET' });
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
      const baseUrl = config.url.replace(/\/$/, '');
      const response = await webdavRequest('PROPFIND', baseUrl, config);
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
  const enabledEndpoints = endpoints.filter(e => e.enabled);

  // 并发执行所有备份
  const promises = enabledEndpoints.map(async endpoint => {
    const result = await uploadBackupToEndpoint(env, username, endpoint);
    result.endpointName = endpoint.name;
    endpoint.lastBackup = {
      time: new Date().toISOString(),
      status: result.success ? 'success' : 'failed',
      message: result.message,
    };
    await saveBackupEndpoint(env, username, endpoint);
    return result;
  });

  return await Promise.all(promises);
}

// ============================================
// 数据导出/导入增强功能
// ============================================

// 导出用户数据为 JSON 格式
export async function exportData(env: Env, username: string) {
  return await exportUserData(env, username);
}

// 导入用户数据
export async function importData(
  env: Env,
  username: string,
  data: any,
  options?: { skipTables?: string[]; mergeMode?: 'overwrite' | 'merge' }
) {
  // 先验证数据
  const validation = validateBackupData(data);
  if (!validation.valid) {
    throw new Error(`Invalid backup data: ${validation.errors.join(', ')}`);
  }

  return await importUserData(env, username, data, options);
}

// 验证备份数据
export function validateBackup(data: any) {
  return validateBackupData(data);
}

// 获取备份历史记录
export async function getBackupHistory(env: Env, username: string, limit: number = 50) {
  return await getBackupRecords(env, username, limit);
}

// 删除备份记录
export async function deleteBackupRecordItem(env: Env, id: string, username: string) {
  return await deleteBackupRecord(env, id, username);
}

// 从备份端点恢复数据
export async function restoreFromEndpoint(
  env: Env,
  username: string,
  endpoint: BackupEndpoint,
  backupKey: string,
  options?: { skipTables?: string[]; mergeMode?: 'overwrite' | 'merge' }
) {
  try {
    // 下载备份文件
    const response = await downloadBackupFromEndpoint(env, username, endpoint, backupKey);
    if (!response.ok) {
      throw new Error(`Failed to download backup: ${response.status}`);
    }

    const content = await response.text();
    const data = JSON.parse(content);

    // 导入数据
    const result = await importData(env, username, data, options);

    // 记录恢复操作
    try {
      await createBackupRecord(env, {
        id: crypto.randomUUID(),
        userId: username,
        endpointId: endpoint.id,
        endpointName: endpoint.name,
        storagePath: backupKey,
        status: 'success',
        tableCounts: result.imported,
      });
    } catch (recordError) {
      console.warn('[Backup] Failed to record restore operation:', recordError);
    }

    return result;
  } catch (error) {
    throw new Error(`Restore failed: ${(error as Error).message}`);
  }
}
