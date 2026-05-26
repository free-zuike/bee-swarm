// ============================================
// S3 兼容存储备份服务
// ============================================
import type { Env } from '../types';

export interface S3Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  path: string;
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

async function hmacSha256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

async function sha256Hash(data: string | ArrayBuffer): Promise<ArrayBuffer> {
  const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return crypto.subtle.digest('SHA-256', buffer);
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function signV4(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string | ArrayBuffer | undefined,
  accessKey: string,
  secretKey: string,
  region: string,
): Promise<Record<string, string>> {
  const parsedUrl = new URL(url);
  const datetime = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const date = datetime.slice(0, 8);
  const bodyHash = body ? toHex(await sha256Hash(body)) : 'UNSIGNED-PAYLOAD';
  const signedHeaders: Record<string, string> = { ...headers, 'x-amz-content-sha256': bodyHash, 'x-amz-date': datetime };
  const sortedHeaderKeys = Object.keys(signedHeaders).map((k) => k.toLowerCase()).sort();
  const signedHeaderKeysStr = sortedHeaderKeys.join(';');
  const canonicalHeaders = sortedHeaderKeys.map((k) => `${k}:${(signedHeaders[k] || '').trim()}`).join('\n') + '\n';
  const canonicalQueryString = parsedUrl.search ? parsedUrl.search.slice(1).split('&').sort().map((p) => { const [key, ...rest] = p.split('='); return `${key}=${rest.join('=')}`; }).join('&') : '';
  const canonicalUri = parsedUrl.pathname;
  const canonicalRequest = [method, canonicalUri, canonicalQueryString, canonicalHeaders, signedHeaderKeysStr, bodyHash].join('\n');
  const credentialScope = `${date}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', datetime, credentialScope, toHex(await sha256Hash(canonicalRequest))].join('\n');
  const kDate = await hmacSha256(new TextEncoder().encode(`AWS4${secretKey}`), date);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, 's3');
  const kSigning = await hmacSha256(kService, 'aws4_request');
  const signature = toHex(await hmacSha256(kSigning, stringToSign));
  signedHeaders['Authorization'] = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaderKeysStr}, Signature=${signature}`;
  return signedHeaders;
}

async function s3Request(method: string, path: string, config: S3Config, body?: string | ArrayBuffer, query?: Record<string, string>): Promise<Response> {
  const { endpoint, accessKeyId, secretAccessKey, bucket, region } = config;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) throw new Error('未配置 S3 存储参数');
  const endpointWithProtocol = endpoint.startsWith('http') ? endpoint : `https://${endpoint}`;
  const parsedEndpoint = new URL(endpointWithProtocol);
  const queryString = query ? '?' + new URLSearchParams(query).toString() : '';
  // 使用 path-style URL（兼容中国科技云）
  const url = parsedEndpoint.protocol + '//' + parsedEndpoint.host + '/' + bucket + path + queryString;
  const headers: Record<string, string> = { 'Host': parsedEndpoint.host };
  if (body) headers['Content-Type'] = 'application/json';
  const signedHeaders = await signV4(method, url, headers, body, accessKeyId, secretAccessKey, region);
  return fetch(url, { method, headers: signedHeaders, body });
}

export async function exportAllData(env: Env): Promise<BackupData> {
  const data: Record<string, string> = {};
  let cursor: string | undefined;
  do { const list = await env.SUBSCRIPTIONS.list({ cursor }); for (const key of list.keys) { const value = await env.SUBSCRIPTIONS.get(key.name); if (value !== null) data[key.name] = value; } cursor = list.cursor; } while (cursor);
  return { timestamp: new Date().toISOString(), version: '1.0', data };
}

export async function uploadBackup(env: Env, username: string, config: S3Config): Promise<BackupResult> {
  try {
    const backupData = await exportAllData(env);
    const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const prefix = config.path ? config.path.replace(/\/+$/, '') : 'backups/' + username;
    const key = prefix + '/' + date + '.json';
    const response = await s3Request('PUT', '/' + key, config, JSON.stringify(backupData, null, 2));
    if (!response.ok) return { success: false, message: '上传失败 (' + response.status + '): ' + await response.text() };
    return { success: true, message: '备份成功: ' + key };
  } catch (err: any) { return { success: false, message: '备份失败: ' + err.message }; }
}

export async function listBackups(env: Env, username: string, config: S3Config): Promise<BackupInfo[]> {
  try {
    const prefix = config.path ? config.path.replace(/\/+$/, '') : 'backups/' + username;
    const response = await s3Request('GET', '/', config, undefined, { 'list-type': '2', 'prefix': prefix + '/' });
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
      if (keyMatch) backups.push({ key: keyMatch[1], size: sizeMatch ? parseInt(sizeMatch[1], 10) : 0, lastModified: lastModifiedMatch ? lastModifiedMatch[1] : '' });
    }
    return backups.sort((a, b) => b.key.localeCompare(a.key));
  } catch (err: any) { throw new Error('列出备份失败: ' + err.message); }
}

export async function restoreBackup(env: Env, username: string, config: S3Config, backupKey: string): Promise<BackupResult> {
  try {
    const response = await s3Request('GET', '/' + backupKey, config);
    if (!response.ok) return { success: false, message: '下载备份失败 (' + response.status + ')' };
    const backupData: BackupData = await response.json();
    if (!backupData.data || typeof backupData.data !== 'object') return { success: false, message: '无效的备份数据格式' };
    let cursor: string | undefined;
    do { const list = await env.SUBSCRIPTIONS.list({ cursor }); for (const key of list.keys) await env.SUBSCRIPTIONS.delete(key.name); cursor = list.cursor; } while (cursor);
    const entries = Object.entries(backupData.data);
    for (const [key, value] of entries) await env.SUBSCRIPTIONS.put(key, value);
    return { success: true, message: '恢复成功: 已恢复 ' + entries.length + ' 条数据' };
  } catch (err: any) { return { success: false, message: '恢复失败: ' + err.message }; }
}

export async function deleteBackup(env: Env, username: string, config: S3Config, backupKey: string): Promise<BackupResult> {
  try {
    const response = await s3Request('DELETE', '/' + backupKey, config);
    if (response.status !== 204 && !response.ok) return { success: false, message: '删除失败 (' + response.status + ')' };
    return { success: true, message: '删除成功: ' + backupKey };
  } catch (err: any) { return { success: false, message: '删除失败: ' + err.message }; }
}

export async function testS3Connection(config: S3Config): Promise<{ success: boolean; message: string }> {
  try {
    console.log(`[S3 Test] Endpoint: ${config.endpoint}, Region: ${config.region}, Bucket: ${config.bucket}`);
    console.log(`[S3 Test] Has AccessKey: ${!!config.accessKeyId}, Has SecretKey: ${!!config.secretAccessKey}`);
    const response = await s3Request("GET", "/", config, undefined, { "max-keys": "1" });
    console.log(`[S3 Test] Response status: ${response.status}`);
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[S3 Test] Error response: ${errorText.substring(0, 500)}`);
      return { success: false, message: "连接失败 (" + response.status + "): " + errorText.substring(0, 200) };
    }
    return { success: true, message: "S3 连接成功" };
  } catch (err: any) { 
    console.log(`[S3 Test] Exception: ${err.message}`);
    return { success: false, message: "连接异常: " + err.message }; 
  }
}
