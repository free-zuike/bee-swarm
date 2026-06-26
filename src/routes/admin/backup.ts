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
  exportData,
  importData,
  validateBackup,
  getBackupHistory,
  deleteBackupRecordItem,
  restoreFromEndpoint,
  type BackupEndpoint,
  type S3Config,
  type WebDAVConfig,
  type R2Config,
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

  try {
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
  } catch (err) {
    const error = err as Error;
    console.error('[Backup] 创建备份端点失败:', error);

    // 特殊处理外键约束失败的错误
    if (
      error.message.includes('FOREIGN KEY constraint failed') ||
      error.message.includes('SQLITE_CONSTRAINT_FOREIGNKEY')
    ) {
      return c.json(
        {
          error: '数据库错误：无法创建备份端点，请尝试重新登录或联系管理员',
          code: 'DB_FOREIGN_KEY_ERROR',
        },
        500
      );
    }

    return c.json(
      {
        error: '创建备份端点失败：' + error.message,
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
});

/** 更新备份端 */
backupRoutes.put('/backup-endpoints/:id', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const body = await c.req.json<Partial<BackupEndpoint>>();

  try {
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

      const hasOriginalAccessKey = !!existingS3.accessKeyId;
      const hasNewAccessKey = !!newConfig.accessKeyId;
      if (hasOriginalAccessKey && !hasNewAccessKey) {
        newConfig.accessKeyId = existingS3.accessKeyId;
      }

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
  } catch (err) {
    const error = err as Error;
    console.error('[Backup] 更新备份端点失败:', error);

    // 特殊处理外键约束失败的错误
    if (
      error.message.includes('FOREIGN KEY constraint failed') ||
      error.message.includes('SQLITE_CONSTRAINT_FOREIGNKEY')
    ) {
      return c.json(
        {
          error: '数据库错误：无法更新备份端点，请尝试重新登录或联系管理员',
          code: 'DB_FOREIGN_KEY_ERROR',
        },
        500
      );
    }

    return c.json(
      {
        error: '更新备份端点失败：' + error.message,
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
});

/** 删除备份端 */
backupRoutes.delete('/backup-endpoints/:id', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');

  try {
    const success = await deleteBackupEndpoint(c.env, username, id);
    if (!success) {
      return c.json({ error: '备份端不存在', code: 'NOT_FOUND' }, 404);
    }
    return c.json({ success: true, message: '备份端已删除' });
  } catch (err) {
    const error = err as Error;
    console.error('[Backup] 删除备份端点失败:', error);
    return c.json(
      {
        error: '删除备份端点失败：' + error.message,
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
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

    // R2 通过 Workers 绑定访问，不需要密钥配置
    if (endpoint.type !== 'r2') {
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
  }

  const result = await testBackupEndpoint(endpoint, c.env);
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

  if (!endpoint.enabled) {
    return c.json({ error: '该备份端已禁用', code: 'ENDPOINT_DISABLED' }, 400);
  }

  try {
    const list = await listBackupsFromEndpoint(c.env, username, endpoint);
    return c.json({ backups: list });
  } catch (err) {
    return c.json({ error: (err as Error).message, code: 'INTERNAL_ERROR' }, 500);
  }
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

  if (!endpoint.enabled) {
    return c.json({ error: '该备份端已禁用', code: 'ENDPOINT_DISABLED' }, 400);
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

  if (!endpoint.enabled) {
    return c.json({ error: '该备份端已禁用', code: 'ENDPOINT_DISABLED' }, 400);
  }

  // 动态导入以避免循环依赖
  const { UserService } = await import('../../services/userService');
  const { decryptData } = await import('../../utils/crypto');

  // 获取用户信息用于解密
  const userService = new UserService(c.env);
  const user = await userService.findByEmail(username);
  if (!user) {
    return c.json({ error: '用户不存在', code: 'NOT_FOUND' }, 404);
  }

  const response = await downloadBackupFromEndpoint(c.env, username, endpoint, key);

  if (!response.ok) {
    return c.json(
      { error: '下载备份失败 (' + response.status + ')', code: 'DOWNLOAD_FAILED' },
      500
    );
  }

  let content = await response.text();

  // 尝试解密备份内容
  try {
    const encryptionSecret = user.password;
    const encryptionSalt = user.id;
    content = await decryptData(content, encryptionSecret, encryptionSalt);
  } catch (decryptError) {
    // 解密失败，可能是旧的未加密备份，直接使用原始内容
    console.warn('[Backup] Decryption failed, using raw content:', decryptError);
  }

  const filename = key.split('/').pop() || 'backup.json';
  return c.body(content, 200, {
    'Content-Type': 'application/json',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
});

/** 手动触发所有启用的备份 */
backupRoutes.post('/backup-all', async (c) => {
  const username = c.get('username');
  try {
    const results = await executeAllBackups(c.env, username);
    return c.json({ results });
  } catch (err) {
    const error = err as Error;
    console.error('[Backup] 执行所有备份失败:', error);
    return c.json(
      {
        error: '执行备份失败：' + error.message,
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
});

/** 手动触发单个备份端备份 */
backupRoutes.post('/backup-endpoints/:id/backup', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');

  try {
    const endpoints = await getBackupEndpoints(c.env, username);
    const endpoint = endpoints.find((e) => e.id === id);
    if (!endpoint) {
      return c.json({ error: '备份端不存在', code: 'NOT_FOUND' }, 404);
    }

    if (!endpoint.enabled) {
      return c.json({ error: '该备份端已禁用', code: 'ENDPOINT_DISABLED' }, 400);
    }

    const result = await uploadBackupToEndpoint(c.env, username, endpoint);
    result.endpointName = endpoint.name;

    try {
      endpoint.lastBackup = {
        time: new Date().toISOString(),
        status: result.success ? 'success' : 'failed',
        message: result.message,
      };
      await saveBackupEndpoint(c.env, username, endpoint);
    } catch (saveErr) {
      console.error('[Backup] 保存备份状态失败:', saveErr);
      // 即使保存失败也返回备份结果
    }

    return c.json(result);
  } catch (err) {
    const error = err as Error;
    console.error('[Backup] 执行备份失败:', error);
    return c.json(
      {
        success: false,
        message: '执行备份失败：' + error.message,
      },
      500
    );
  }
});

// ============================================
// 备份增强功能 API
// ============================================

/** 导出用户数据 */
backupRoutes.get('/export', async (c) => {
  const username = c.get('username');

  try {
    const data = await exportData(c.env, username);
    const filename = `backup-${username}-${new Date().toISOString().split('T')[0]}.json`;

    return c.json(data, 200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
  } catch (err) {
    const error = err as Error;
    console.error('[Backup] 导出数据失败:', error);
    return c.json({ error: '导出失败：' + error.message }, 500);
  }
});

/** 导入用户数据 */
backupRoutes.post('/import', async (c) => {
  const username = c.get('username');

  try {
    const body = await c.req.json();
    if (!body.data) {
      return c.json({ error: '请提供导入数据', code: 'VALIDATION_ERROR' }, 400);
    }
    const options = {
      skipTables: body.skipTables || [],
      mergeMode: body.mergeMode || 'overwrite',
    };

    const result = await importData(c.env, username, body.data, options);
    return c.json(result);
  } catch (err) {
    const error = err as Error;
    console.error('[Backup] 导入数据失败:', error);
    return c.json({ error: '导入失败：' + error.message }, 400);
  }
});

/** 验证备份数据 */
backupRoutes.post('/validate', async (c) => {
  const body = await c.req.json();
  if (!body.data) {
    return c.json({ valid: false, errors: ['请提供验证数据'] });
  }
  const validation = validateBackup(body.data);
  return c.json(validation);
});

/** 获取备份历史记录 */
backupRoutes.get('/history', async (c) => {
  const username = c.get('username');
  const limit = parseInt(c.req.query('limit') || '50', 10);

  try {
    const history = await getBackupHistory(c.env, username, limit);
    return c.json({ history });
  } catch (err) {
    const error = err as Error;
    console.error('[Backup] 获取备份历史失败:', error);
    return c.json({ error: '获取历史记录失败：' + error.message }, 500);
  }
});

/** 删除备份记录 */
backupRoutes.delete('/history/:id', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');

  try {
    const success = await deleteBackupRecordItem(c.env, id, username);
    return c.json({ success });
  } catch (err) {
    const error = err as Error;
    console.error('[Backup] 删除备份记录失败:', error);
    return c.json({ error: '删除失败：' + error.message }, 500);
  }
});

/** 从备份端点恢复数据 */
backupRoutes.post('/backup-endpoints/:id/restore', async (c) => {
  const username = c.get('username');
  const id = c.req.param('id');
  const { backupKey, skipTables, mergeMode } = await c.req.json();

  if (!backupKey) {
    return c.json({ error: '请提供备份文件 key' }, 400);
  }

  try {
    const endpoints = await getBackupEndpoints(c.env, username);
    const endpoint = endpoints.find((e) => e.id === id);

    if (!endpoint) {
      return c.json({ error: '备份端不存在' }, 404);
    }

    const result = await restoreFromEndpoint(c.env, username, endpoint, backupKey, {
      skipTables,
      mergeMode,
    });

    return c.json(result);
  } catch (err) {
    const error = err as Error;
    console.error('[Backup] 恢复数据失败:', error);
    return c.json({ error: '恢复失败：' + error.message }, 500);
  }
});
