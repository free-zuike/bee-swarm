// ============================================
// R2 存储服务
// ============================================

import type { Env } from '../types';

/**
 * 备份文件信息
 */
export interface BackupFileInfo {
  key: string;
  size?: number;
  uploadedAt?: string;
  contentType?: string;
}

/**
 * R2 存储服务类
 * 提供备份文件的上传、下载和删除功能
 */
export class R2StorageService {
  private bucket: R2Bucket | undefined;

  constructor(env: Env) {
    this.bucket = env.BACKUP_BUCKET;
  }

  /**
   * 检查 R2 是否可用
   */
  isAvailable(): boolean {
    return !!this.bucket;
  }

  /**
   * 上传备份文件到 R2
   * @param key 文件名/路径
   * @param content 文件内容
   * @param contentType MIME 类型
   */
  async uploadBackup(key: string, content: string | Uint8Array, contentType: string = 'application/json'): Promise<void> {
    if (!this.bucket) {
      throw new Error('R2 bucket not available');
    }

    const body = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    
    await this.bucket.put(key, body, {
      httpMetadata: {
        contentType,
      },
      customMetadata: {
        uploadedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * 下载备份文件
   * @param key 文件名/路径
   */
  async downloadBackup(key: string): Promise<string | null> {
    if (!this.bucket) {
      return null;
    }

    const object = await this.bucket.get(key);
    if (!object) {
      return null;
    }

    const content = await object.text();
    return content;
  }

  /**
   * 删除备份文件
   * @param key 文件名/路径
   */
  async deleteBackup(key: string): Promise<void> {
    if (!this.bucket) {
      return;
    }

    await this.bucket.delete(key);
  }

  /**
   * 列出备份文件
   * @param prefix 路径前缀
   */
  async listBackups(prefix: string = ''): Promise<BackupFileInfo[]> {
    if (!this.bucket) {
      return [];
    }

    const list = await this.bucket.list({ prefix });
    return list.objects.map(obj => ({
      key: obj.key,
      size: obj.size,
      uploadedAt: obj.uploaded?.toISOString(),
    }));
  }

  /**
   * 获取备份文件信息
   * @param key 文件名/路径
   */
  async getBackupInfo(key: string): Promise<BackupFileInfo | null> {
    if (!this.bucket) {
      return null;
    }

    const object = await this.bucket.head(key);
    if (!object) {
      return null;
    }

    return {
      key: object.key,
      size: object.size,
      uploadedAt: object.uploaded?.toISOString(),
      contentType: object.httpMetadata?.contentType,
    };
  }
}