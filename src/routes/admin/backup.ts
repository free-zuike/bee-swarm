// ============================================
// 备份管理路由
// ============================================
import { Hono } from 'hono';
import type { Env } from '../../types';
import { filterSensitiveConfig } from '../../utils/config';
import {
  uploadBackupToEndpoint,
  listBackupsFromEndpoint,
  restoreBackupFromEndpoint,
  deleteBackupFromEndpoint,
  downloadBackupFromEndpoint,
  getBackupEndpoints,
  saveBackupEndpoints,
  saveBackupEndpoint,
  deleteBackupEndpoint,
  testBackupEndpoint,
  executeAllBackups,
  type BackupEndpoint,
  type S3Config,
  type WebDAVConfig,
} from '../../services/backup';

export const backupRoutes = new Hono<{ Bindings: Env; Variables: { username: string } }>();

/** 获取所有备份端 */
backupRoutes.get('/backup-endpoints', async (c) => {
  const username = c.get('username');
  const endpoints = await getBackupEndpoints(c.env, username);

  const safeEndpoints = endpoints.map((e) => ({
    ...e,
    config: filterSensitiveConfig(e.config as unknown as Record<string, unknown>),
  }));

  return c.json({ endpoints: safeEndpoints });
});

/** 添加备份端 */
backupRoutes.post('/backup-endpoints', async (c) => {
  const username = c.get('username');
  const body = await c.req.json<BackupEndpoint>();

  if (!body.name || !body.type) {
    return c.json({ error: '请提供名称和类型', code: 'VALIDATION_ERROR' }, 400);
  }

  const endpoints = await getBackupEndpoints(c.env, username);
  const newEndpoint: BackupEndpoint = {
    ...body,
    id: crypto.randomUUID(),
    enabled: body.enabled ?? true,
    schedule: body.schedule || { enabled: false, interval: 24, startTime: '02:00' },
    retention: body.retention || 30,
  };

  endpoints.push(newEndpoint);
  await saveBackupEndpoints(c.env, username, endpoints);

  const returnedEndpoint = {
    ...newEndpoint,
    config: filterSensitiveConfig(newEndpoint.config as unknown as Record<string, unknown>),
  };
  return c.json({ success: true, endpoint: returnedEndpoint });
});

/** 更新备份端 */
backupRoutes.put('/backup-endpoints/:id', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const body = await c.req.json<Partial<BackupEndpoint>>();

  const endpoints = await getBackupEndpoints(c.env, username);
  const index = endpoints.findIndex((e) => e.id === id);
  if (index === -1) {
    return c.json({ error: '备份端不存在', code: 'NOT_FOUND' }, 404);
  }

  const existingConfig = endpoints[index].config;
  if (body.config && existingConfig) {
    const existingS3 = existingConfig as Partial<S3Config>;
    const existingWebDAV = existingConfig as Partial<WebDAVConfig>;
    const newConfig = body.config as Partial<S3Config & WebDAVConfig>;

    const hasOriginalSecret = !!existingS3.secretAccessKey;
    const hasNewSecret = !!newConfig.secretAccessKey;
    if (hasOriginalSecret && !hasNewSecret) {
      newConfig.secretAccessKey = existingS3.secretAccessKey;
    }

    const hasOriginalPassword = !!existingWebDAV.password;
    const hasNewPassword = !!newConfig.password;
    if (hasOriginalPassword && !hasNewPassword) {
      newConfig.password = existingWebDAV.password;
    }
  }

  endpoints[index] = { ...endpoints[index], ...body };
  await saveBackupEndpoints(c.env, username, endpoints);

  const returnedEndpoint = {
    ...endpoints[index],
    config: filterSensitiveConfig(endpoints[index].config as unknown as Record<string, unknown>),
  };
  return c.json({ success: true, endpoint: returnedEndpoint });
});

/** 删除备份端 */
backupRoutes.delete('/backup-endpoints/:id', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');

  const success = await deleteBackupEndpoint(c.env, username, id);
  if (!success) {
    return c.json({ error: '备份端不存在', code: 'NOT_FOUND' }, 404);
  }
  return c.json({ success: true, message: '备份端已删除' });
});

/** 测试备份端连接 */
backupRoutes.post('/backup-endpoints/:id/test', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  let endpoint;

  if (id === 'new') {
    if (!body.type || !body.config) {
      return c.json({ error: '测试新配置需要传入 type 和 config', code: 'VALIDATION_ERROR' }, 400);
    }
    endpoint = {
      id: 'new',
      name: '新备份端',
      type: body.type,
      enabled: false,
      config: body.config,
      schedule: { enabled: false, interval: 24, startTime: '02:00' },
      retention: 30,
    };
  } else {
    const endpoints = await getBackupEndpoints(c.env, username);
    endpoint = endpoints.find((e) => e.id === id);
    if (!endpoint) {
      return c.json({ error: '备份端不存在', code: 'NOT_FOUND' }, 404);
    }

    const s3Config = endpoint.config as Partial<S3Config>;
    const webdavConfig = endpoint.config as Partial<WebDAVConfig>;
    const hasSecret = !!s3Config.secretAccessKey || !!webdavConfig.password;

    if (!hasSecret) {
      return c.json({
        success: false,
        message: '密钥未配置，请先编辑并保存密钥后重试',
      });
    }
  }

  const result = await testBackupEndpoint(endpoint);
  return c.json(result);
});

/** 列出指定备份端的备份 */
backupRoutes.get('/backup-endpoints/:id/backups', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');

  const endpoints = await getBackupEndpoints(c.env, username);
  const endpoint = endpoints.find((e) => e.id === id);
  if (!endpoint) {
    return c.json({ error: '备份端不存在', code: 'NOT_FOUND' }, 404);
  }

  try {
    const list = await listBackupsFromEndpoint(c.env, username, endpoint);
    return c.json({ backups: list });
  } catch (err) {
    return c.json({ error: (err as Error).message, code: 'INTERNAL_ERROR' }, 500);
  }
});

/** 从指定备份端恢复 */
backupRoutes.post('/backup-endpoints/:id/restore', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const { key } = await c.req.json<{ key: string }>();

  if (!key) {
    return c.json({ error: '请提供备份文件 key', code: 'VALIDATION_ERROR' }, 400);
  }

  const endpoints = await getBackupEndpoints(c.env, username);
  const endpoint = endpoints.find((e) => e.id === id);
  if (!endpoint) {
    return c.json({ error: '备份端不存在', code: 'NOT_FOUND' }, 404);
  }

  const result = await restoreBackupFromEndpoint(c.env, username, endpoint, key);
  return c.json(result);
});

/** 删除指定备份端的备份 */
backupRoutes.delete('/backup-endpoints/:id/backups', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const { key } = await c.req.json<{ key: string }>();

  if (!key) {
    return c.json({ error: '请提供备份文件 key', code: 'VALIDATION_ERROR' }, 400);
  }

  const endpoints = await getBackupEndpoints(c.env, username);
  const endpoint = endpoints.find((e) => e.id === id);
  if (!endpoint) {
    return c.json({ error: '备份端不存在', code: 'NOT_FOUND' }, 404);
  }

  const result = await deleteBackupFromEndpoint(c.env, username, endpoint, key);
  return c.json(result);
});

/** 下载指定备份 */
backupRoutes.get('/backup-endpoints/:id/backups/:key/download', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const key = decodeURIComponent(c.req.param('key'));

  const endpoints = await getBackupEndpoints(c.env, username);
  const endpoint = endpoints.find((e) => e.id === id);
  if (!endpoint) {
    return c.json({ error: '备份端不存在', code: 'NOT_FOUND' }, 404);
  }

  const response = await downloadBackupFromEndpoint(c.env, username, endpoint, key);

  if (!response.ok) {
    return c.json(
      { error: '下载备份失败 (' + response.status + ')', code: 'DOWNLOAD_FAILED' },
      500
    );
  }

  const data = await response.arrayBuffer();
  const filename = key.split('/').pop() || 'backup.json';
  return c.body(data, 200, {
    'Content-Type': 'application/json',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
});

/** 手动触发所有启用的备份 */
backupRoutes.post('/backup-all', async (c) => {
  const username = c.get('username');
  const results = await executeAllBackups(c.env, username);
  return c.json({ results });
});

/** 手动触发单个备份端备份 */
backupRoutes.post('/backup-endpoints/:id/backup', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');

  const endpoints = await getBackupEndpoints(c.env, username);
  const endpoint = endpoints.find((e) => e.id === id);
  if (!endpoint) {
    return c.json({ error: '备份端不存在', code: 'NOT_FOUND' }, 404);
  }

  const result = await uploadBackupToEndpoint(c.env, username, endpoint);
  result.endpointName = endpoint.name;

  endpoint.lastBackup = {
    time: new Date().toISOString(),
    status: result.success ? 'success' : 'failed',
    message: result.message,
  };
  await saveBackupEndpoint(c.env, username, endpoint);

  return c.json(result);
});
