/**
 * KV 存储批量操作工具
 */
export class KvBatch {
  private kv: {
    get: (key: string) => Promise<string | null>;
    put: (
      key: string,
      value: string,
      options?: { expirationTtl?: number; metadata?: unknown }
    ) => Promise<void>;
    delete: (key: string) => Promise<void>;
    list: (options: { prefix: string; limit?: number; cursor?: string }) => Promise<{
      keys: Array<{ name: string }>;
      cursor?: string;
      list_complete?: boolean;
    }>;
  };

  constructor(kv: KvBatch['kv']) {
    this.kv = kv;
  }

  /**
   * 批量获取多个键的值
   * @param keys 要获取的键数组
   * @returns 包含键值对的 Map
   */
  async batchGet<T>(keys: string[]): Promise<Map<string, T>> {
    const results = new Map<string, T>();
    const promises = keys.map(async (key) => {
      try {
        const value = await this.kv.get(key);
        if (value !== null && value !== undefined) {
          results.set(key, JSON.parse(value) as T);
        }
      } catch (_e) {
        // 单个键获取失败不影响其他键
      }
    });
    await Promise.all(promises);
    return results;
  }

  /**
   * 批量设置多个键值对
   * @param entries 键值对数组
   * @param options KV 设置选项
   */
  async batchPut(
    entries: Array<{ key: string; value: string }>,
    options?: { expirationTtl?: number; metadata?: unknown }
  ): Promise<void> {
    const promises = entries.map(({ key, value }) => this.kv.put(key, value, options));
    await Promise.all(promises);
  }

  /**
   * 批量删除多个键
   * @param keys 要删除的键数组
   */
  async batchDelete(keys: string[]): Promise<void> {
    const promises = keys.map((key) => this.kv.delete(key));
    await Promise.all(promises);
  }

  /**
   * 列出指定前缀的所有键
   * @param prefix 键前缀
   * @param limit 每次列表的最大数量
   */
  async listAllKeys(prefix: string, limit = 1000): Promise<string[]> {
    const allKeys: string[] = [];
    let cursor: string | undefined = undefined;
    let listComplete = false;

    while (!listComplete) {
      const list = await this.kv.list({ prefix, limit, cursor });
      const keys = list.keys.map((k: { name: string }) => k.name);
      allKeys.push(...keys);
      cursor = list.cursor;
      listComplete = list.list_complete ?? true;
    }

    return allKeys;
  }

  /**
   * 列出指定前缀的所有键并获取它们的值
   * @param prefix 键前缀
   */
  async listAndGetAll<T>(prefix: string): Promise<Map<string, T>> {
    const keys = await this.listAllKeys(prefix);
    return await this.batchGet<T>(keys);
  }
}

/**
 * 快速创建 KvBatch 实例的工厂函数
 */
export function createKvBatch(kv: KvBatch['kv']): KvBatch {
  return new KvBatch(kv);
}
