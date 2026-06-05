// ============================================
// R2 数据归档服务
// 利用 R2 存储归档历史数据，减少 D1 数据库压力
// ============================================
import type { Env } from '../types';

export interface ArchiveConfig {
  /** 归档保留天数 */
  archiveRetentionDays: number;
  /** 每次归档的最大记录数 */
  archiveBatchSize: number;
  /** 是否压缩归档 */
  compressArchive: boolean;
}

const DEFAULT_ARCHIVE_CONFIG: ArchiveConfig = {
  archiveRetentionDays: 365,
  archiveBatchSize: 500,
  compressArchive: true,
};

/**
 * 将过期数据归档到 R2
 * 先查询数据，然后写入 R2，再从 D1 删除
 */
export async function archiveOldDataToR2(
  env: Env,
  config: Partial<ArchiveConfig> = {}
): Promise<{
  archivedCount: number;
  r2ObjectKey: string | null;
  error: string | null;
}> {
  const cfg = { ...DEFAULT_ARCHIVE_CONFIG, ...config };

  if (!env.BUCKET) {
    return { archivedCount: 0, r2ObjectKey: null, error: 'R2 bucket not configured' };
  }

  try {
    // 计算归档时间点
    const archiveCutoff = new Date(
      Date.now() - cfg.archiveRetentionDays * 24 * 60 * 60 * 1000
    ).toISOString();

    // 1. 查询要归档的数据
    const pushHistoryResult = await env
      .DB!.prepare(
        `SELECT * FROM push_history 
         WHERE created_at < ? 
         LIMIT ?`
      )
      .bind(archiveCutoff, cfg.archiveBatchSize)
      .all();

    if (!pushHistoryResult.results || pushHistoryResult.results.length === 0) {
      return { archivedCount: 0, r2ObjectKey: null, error: null };
    }

    // 2. 准备归档数据
    const archiveData = {
      schemaVersion: '1.0',
      archiveDate: new Date().toISOString(),
      retentionPeriod: `${cfg.archiveRetentionDays} days`,
      data: {
        pushHistory: pushHistoryResult.results,
      },
      recordCount: pushHistoryResult.results.length,
    };

    // 3. 生成 R2 文件名
    const dateStr = new Date().toISOString().split('T')[0];
    const timestamp = Date.now();
    const r2ObjectKey = `archives/push-history/${dateStr}/${timestamp}.json`;

    // 4. 写入 R2
    const dataToStore = JSON.stringify(archiveData, null, 2);
    
    await env.BUCKET.put(r2ObjectKey, dataToStore, {
      httpMetadata: {
        contentType: 'application/json',
        cacheControl: 'public, max-age=31536000', // 1 年
      },
      customMetadata: {
        'archive-date': archiveCutoff,
        'record-count': String(archiveData.recordCount),
      },
    });

    // 5. 从 D1 删除已归档的数据
    const deleteResult = await env
      .DB!.prepare(
        `DELETE FROM push_history 
         WHERE created_at < ? 
         LIMIT ?`
      )
      .bind(archiveCutoff, archiveData.recordCount)
      .run();

    const archivedCount = deleteResult.meta?.changes || 0;

    console.log(
      `[Archive] Archived ${archivedCount} records to R2: ${r2ObjectKey}`
    );

    return {
      archivedCount,
      r2ObjectKey,
      error: null,
    };
  } catch (err) {
    console.error('[Archive] Error archiving data:', err);
    return {
      archivedCount: 0,
      r2ObjectKey: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * 从 R2 检索归档数据
 */
export async function retrieveArchiveFromR2(
  env: Env,
  objectKey: string
): Promise<any | null> {
  if (!env.BUCKET) {
    return null;
  }

  try {
    const object = await env.BUCKET.get(objectKey);
    if (!object) {
      return null;
    }

    const content = await object.text();
    return JSON.parse(content);
  } catch (err) {
    console.error('[Archive] Error retrieving archive:', err);
    return null;
  }
}

/**
 * 列出 R2 中的归档文件
 */
export async function listArchivesFromR2(
  env: Env,
  limit = 50
): Promise<{ key: string; size: number; uploaded: Date }[]> {
  if (!env.BUCKET) {
    return [];
  }

  try {
    const listed = await env.BUCKET.list({ limit, prefix: 'archives/push-history/' });
    return listed.objects.map((obj) => ({
      key: obj.key,
      size: obj.size,
      uploaded: obj.uploaded,
    }));
  } catch (err) {
    console.error('[Archive] Error listing archives:', err);
    return [];
  }
}
