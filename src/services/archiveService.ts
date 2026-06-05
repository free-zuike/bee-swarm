// ============================================
// 数据归档服务 - 将旧数据归档到 R2 存储
// ============================================
import type { Env } from '../types';
import { R2StorageService } from './r2StorageService';

export interface ArchiveConfig {
  /** 归档天数阈值 */
  archiveAfterDays: number;
  /** 每次归档的记录数 */
  batchSize: number;
}

/** 归档推送历史到 R2 */
export async function archivePushHistory(
  env: Env,
  username: string,
  config: Partial<ArchiveConfig> = {}
): Promise<{ archived: number; failed: number }> {
  const cfg = { archiveAfterDays: 30, batchSize: 50, ...config };
  const r2 = new R2StorageService(env);

  if (!r2.isAvailable()) {
    console.log('[Archive] R2 not available, skipping archive');
    return { archived: 0, failed: 0 };
  }

  const cutoff = new Date(Date.now() - cfg.archiveAfterDays * 24 * 60 * 60 * 1000).toISOString();
  let archived = 0;
  let failed = 0;

  try {
    // 1. 获取要归档的记录
    const records = await env
      .DB!.prepare(
        `SELECT * FROM push_history 
       WHERE user_id = ? AND created_at < ? 
       ORDER BY created_at ASC 
       LIMIT ?`
      )
      .bind(username, cutoff, cfg.batchSize)
      .all<Record<string, unknown>>();

    if (!records.results || records.results.length === 0) {
      return { archived: 0, failed: 0 };
    }

    // 2. 上传到 R2
    const archiveKey = `archives/${username}/push_history_${new Date().toISOString().slice(0, 10)}.json`;

    const archiveData = {
      table: 'push_history',
      archivedAt: new Date().toISOString(),
      records: records.results,
    };

    const success = await r2.uploadObject(
      archiveKey,
      JSON.stringify(archiveData, null, 2),
      'application/json'
    );

    if (success) {
      // 3. 删除已归档的记录
      const ids = records.results.map((r) => r.id as string);
      const placeholders = ids.map(() => '?').join(',');
      await env
        .DB!.prepare(`DELETE FROM push_history WHERE id IN (${placeholders})`)
        .bind(...ids)
        .run();

      archived = ids.length;
      console.log(`[Archive] Archived ${archived} push history records to ${archiveKey}`);
    } else {
      failed = records.results.length;
      console.error('[Archive] Failed to upload to R2');
    }
  } catch (err) {
    console.error('[Archive] Error archiving push history:', err);
  }

  return { archived, failed };
}

/** 从 R2 恢复归档数据 */
export async function restoreArchivedData(
  env: Env,
  username: string,
  archiveKey: string
): Promise<{ restored: number }> {
  const r2 = new R2StorageService(env);

  if (!r2.isAvailable()) {
    throw new Error('R2 storage not available');
  }

  const content = await r2.getObject(archiveKey);
  if (!content) {
    throw new Error('Archive not found');
  }

  const archiveData = JSON.parse(content) as {
    table: string;
    archivedAt: string;
    records: Record<string, unknown>[];
  };

  if (archiveData.table !== 'push_history') {
    throw new Error('Invalid archive type');
  }

  let restored = 0;

  for (const record of archiveData.records) {
    try {
      // 重新插入记录（使用新的 ID）
      await env
        .DB!.prepare(
          `INSERT INTO push_history (id, user_id, title, body, url, channels, status, results, latency_ms, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          username,
          record.title,
          record.body,
          record.url,
          JSON.stringify(record.channels),
          record.status,
          JSON.stringify(record.results),
          record.latency_ms,
          record.created_at,
          new Date().toISOString()
        )
        .run();
      restored++;
    } catch (err) {
      console.error('[Restore] Error restoring record:', err);
    }
  }

  return { restored };
}

/** 列出可用的归档 */
export async function listArchives(
  env: Env,
  username: string
): Promise<{ key: string; size: number; archivedAt: string }[]> {
  const r2 = new R2StorageService(env);

  if (!r2.isAvailable()) {
    return [];
  }

  const archives = await r2.listObjects(`archives/${username}/`);

  return archives
    .filter((a) => a.key.endsWith('.json'))
    .map((a) => ({
      key: a.key,
      size: a.size || 0,
      archivedAt: a.lastModified || '',
    }));
}
