// ============================================
// 操作撤销服务
// 提供操作历史和撤销功能
// ============================================

import type { Env } from '../types';

/**
 * 操作类型
 */
export type OperationType =
  | 'create'
  | 'update'
  | 'delete'
  | 'enable'
  | 'disable';

/**
 * 操作目标类型
 */
export type OperationTarget =
  | 'channel'
  | 'template'
  | 'group'
  | 'scheduled'
  | 'user';

/**
 * 操作记录
 */
export interface OperationRecord {
  id: string;
  userId: string;
  type: OperationType;
  target: OperationTarget;
  targetId: string;
  targetName?: string;
  previousData?: any;
  newData?: any;
  createdAt: string;
  undone: boolean;
  undoneAt?: string;
}

/**
 * 撤销结果
 */
export interface UndoResult {
  success: boolean;
  recordId: string;
  error?: string;
  restoredData?: any;
}

/**
 * 操作撤销服务类
 */
export class UndoService {
  private env: Env;
  /** 操作记录保留时间（秒） */
  private retentionSeconds: number;

  constructor(env: Env, retentionSeconds: number = 3600) {
    this.env = env;
    this.retentionSeconds = retentionSeconds;
  }

  /**
   * 记录操作
   */
  async recordOperation(
    userId: string,
    type: OperationType,
    target: OperationTarget,
    targetId: string,
    options: {
      targetName?: string;
      previousData?: any;
      newData?: any;
    } = {}
  ): Promise<string> {
    const operationId = crypto.randomUUID();

    const record: OperationRecord = {
      id: operationId,
      userId,
      type,
      target,
      targetId,
      targetName: options.targetName,
      previousData: options.previousData,
      newData: options.newData,
      createdAt: new Date().toISOString(),
      undone: false,
    };

    try {
      // 保存到数据库
      await this.env.DB!.prepare(
        `INSERT INTO operation_records (id, user_id, type, target, target_id, target_name, 
         previous_data, new_data, created_at, undone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          record.id,
          record.userId,
          record.type,
          record.target,
          record.targetId,
          record.targetName || null,
          record.previousData ? JSON.stringify(record.previousData) : null,
          record.newData ? JSON.stringify(record.newData) : null,
          record.createdAt,
          0
        )
        .run();

      // 同时保存到 KV 以便快速查询
      if (this.env.RATE_LIMIT_KV) {
        const key = `undo:${userId}:${operationId}`;
        await this.env.RATE_LIMIT_KV.put(key, JSON.stringify(record), {
          expirationTtl: this.retentionSeconds,
        });
      }

      console.log(`[Undo] Recorded operation: ${type} ${target} ${targetId}`);

      return operationId;
    } catch (error) {
      console.error('[Undo] Failed to record operation:', error);
      throw error;
    }
  }

  /**
   * 撤销操作
   */
  async undoOperation(operationId: string, userId: string): Promise<UndoResult> {
    try {
      // 获取操作记录
      const record = await this.getOperationRecord(operationId, userId);

      if (!record) {
        return {
          success: false,
          recordId: operationId,
          error: '操作记录不存在或无权访问',
        };
      }

      if (record.undone) {
        return {
          success: false,
          recordId: operationId,
          error: '该操作已被撤销',
        };
      }

      // 检查是否在撤销时间范围内
      const createdAt = new Date(record.createdAt);
      const now = new Date();
      const ageSeconds = (now.getTime() - createdAt.getTime()) / 1000;

      if (ageSeconds > this.retentionSeconds) {
        return {
          success: false,
          recordId: operationId,
          error: `操作已超过 ${this.retentionSeconds / 60} 分钟的撤销时限`,
        };
      }

      // 根据操作类型执行撤销
      let restoredData: any;

      switch (record.type) {
        case 'create':
          // 创建操作的撤销 = 删除
          restoredData = await this.undoCreate(record);
          break;
        case 'update':
          // 更新操作的撤销 = 恢复到之前的数据
          restoredData = await this.undoUpdate(record);
          break;
        case 'delete':
          // 删除操作的撤销 = 恢复数据
          restoredData = await this.undoDelete(record);
          break;
        case 'enable':
        case 'disable':
          // 启用/禁用操作的撤销 = 切换状态
          restoredData = await this.undoToggle(record);
          break;
        default:
          return {
            success: false,
            recordId: operationId,
            error: `不支持的操作类型: ${record.type}`,
          };
      }

      // 标记为已撤销
      await this.markAsUndone(operationId);

      return {
        success: true,
        recordId: operationId,
        restoredData,
      };
    } catch (error) {
      console.error('[Undo] Failed to undo operation:', error);
      return {
        success: false,
        recordId: operationId,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 获取可撤销的操作列表
   */
  async getUndoableOperations(
    userId: string,
    options: {
      limit?: number;
      target?: OperationTarget;
      type?: OperationType;
    } = {}
  ): Promise<OperationRecord[]> {
    const { limit = 10, target, type } = options;
    const cutoffTime = new Date(
      Date.now() - this.retentionSeconds * 1000
    ).toISOString();

    let query = `SELECT * FROM operation_records 
                 WHERE user_id = ? AND undone = 0 AND created_at >= ?`;
    const params: any[] = [userId, cutoffTime];

    if (target) {
      query += ' AND target = ?';
      params.push(target);
    }

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    try {
      const result = await this.env.DB!.prepare(query).bind(...params).all<any>();

      return (result.results || []).map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        type: row.type,
        target: row.target,
        targetId: row.target_id,
        targetName: row.target_name,
        previousData: row.previous_data ? JSON.parse(row.previous_data) : undefined,
        newData: row.new_data ? JSON.parse(row.new_data) : undefined,
        createdAt: row.created_at,
        undone: !!row.undone,
        undoneAt: row.undone_at,
      }));
    } catch (error) {
      console.error('[Undo] Failed to get undoable operations:', error);
      return [];
    }
  }

  /**
   * 批量撤销
   */
  async batchUndo(
    operationIds: string[],
    userId: string
  ): Promise<{
    total: number;
    success: number;
    failed: number;
    results: UndoResult[];
  }> {
    const results: UndoResult[] = [];

    for (const id of operationIds) {
      const result = await this.undoOperation(id, userId);
      results.push(result);
    }

    return {
      total: operationIds.length,
      success: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  /**
   * 获取操作记录
   */
  private async getOperationRecord(
    operationId: string,
    userId: string
  ): Promise<OperationRecord | null> {
    try {
      const result = await this.env.DB!.prepare(
        `SELECT * FROM operation_records WHERE id = ? AND user_id = ?`
      )
        .bind(operationId, userId)
        .first<any>();

      if (!result) return null;

      return {
        id: result.id,
        userId: result.user_id,
        type: result.type,
        target: result.target,
        targetId: result.target_id,
        targetName: result.target_name,
        previousData: result.previous_data ? JSON.parse(result.previous_data) : undefined,
        newData: result.new_data ? JSON.parse(result.new_data) : undefined,
        createdAt: result.created_at,
        undone: !!result.undone,
        undoneAt: result.undone_at,
      };
    } catch (error) {
      console.error('[Undo] Failed to get operation record:', error);
      return null;
    }
  }

  /**
   * 标记为已撤销
   */
  private async markAsUndone(operationId: string): Promise<void> {
    await this.env.DB!.prepare(
      `UPDATE operation_records SET undone = 1, undone_at = ? WHERE id = ?`
    )
      .bind(new Date().toISOString(), operationId)
      .run();
  }

  /**
   * 撤销创建操作（删除）
   */
  private async undoCreate(record: OperationRecord): Promise<any> {
    const tableMap: Record<OperationTarget, string> = {
      channel: 'channel_configs',
      template: 'push_templates',
      group: 'channel_groups',
      scheduled: 'scheduled_pushes',
      user: 'users',
    };

    const table = tableMap[record.target];

    const result = await this.env.DB!.prepare(
      `DELETE FROM ${table} WHERE id = ? AND user_id = ?`
    )
      .bind(record.targetId, record.userId)
      .run();

    return { deleted: result.meta?.changes > 0 };
  }

  /**
   * 撤销更新操作（恢复旧数据）
   */
  private async undoUpdate(record: OperationRecord): Promise<any> {
    if (!record.previousData) {
      throw new Error('没有之前的数据可供恢复');
    }

    const tableMap: Record<OperationTarget, string> = {
      channel: 'channel_configs',
      template: 'push_templates',
      group: 'channel_groups',
      scheduled: 'scheduled_pushes',
      user: 'users',
    };

    const table = tableMap[record.target];
    const data = record.previousData;

    // 构建更新语句
    const setClause = Object.keys(data)
      .map((key) => `${key} = ?`)
      .join(', ');
    const values = Object.values(data);
    values.push(record.targetId, record.userId);

    const result = await this.env.DB!.prepare(
      `UPDATE ${table} SET ${setClause}, updated_at = ? WHERE id = ? AND user_id = ?`
    )
      .bind(...values, new Date().toISOString())
      .run();

    return { updated: result.meta?.changes > 0, data: record.previousData };
  }

  /**
   * 撤销删除操作（恢复数据）
   */
  private async undoDelete(record: OperationRecord): Promise<any> {
    if (!record.previousData) {
      throw new Error('没有之前的数据可供恢复');
    }

    const tableMap: Record<OperationTarget, string> = {
      channel: 'channel_configs',
      template: 'push_templates',
      group: 'channel_groups',
      scheduled: 'scheduled_pushes',
      user: 'users',
    };

    const table = tableMap[record.target];
    const data = record.previousData;

    // 构建插入语句
    const columns = Object.keys(data);
    const placeholders = columns.map(() => '?').join(', ');
    const values = Object.values(data);

    const result = await this.env.DB!.prepare(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
    )
      .bind(...values)
      .run();

    return { inserted: result.meta?.changes > 0, data: record.previousData };
  }

  /**
   * 撤销启用/禁用操作（切换状态）
   */
  private async undoToggle(record: OperationRecord): Promise<any> {
    const tableMap: Record<OperationTarget, string> = {
      channel: 'channel_configs',
      template: 'push_templates',
      group: 'channel_groups',
      scheduled: 'scheduled_pushes',
      user: 'users',
    };

    const table = tableMap[record.target];

    // 获取当前状态
    const current = await this.env.DB!.prepare(
      `SELECT enabled FROM ${table} WHERE id = ? AND user_id = ?`
    )
      .bind(record.targetId, record.userId)
      .first<{ enabled: number }>();

    if (!current) {
      throw new Error('记录不存在');
    }

    // 切换状态
    const newEnabled = current.enabled ? 0 : 1;

    const result = await this.env.DB!.prepare(
      `UPDATE ${table} SET enabled = ?, updated_at = ? WHERE id = ? AND user_id = ?`
    )
      .bind(newEnabled, new Date().toISOString(), record.targetId, record.userId)
      .run();

    return { toggled: result.meta?.changes > 0, newState: newEnabled === 1 };
  }

  /**
   * 获取操作历史
   */
  async getOperationHistory(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      target?: OperationTarget;
    } = {}
  ): Promise<OperationRecord[]> {
    const { limit = 50, offset = 0, target } = options;

    let query = `SELECT * FROM operation_records WHERE user_id = ?`;
    const params: any[] = [userId];

    if (target) {
      query += ' AND target = ?';
      params.push(target);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    try {
      const result = await this.env.DB!.prepare(query).bind(...params).all<any>();

      return (result.results || []).map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        type: row.type,
        target: row.target,
        targetId: row.target_id,
        targetName: row.target_name,
        previousData: row.previous_data ? JSON.parse(row.previous_data) : undefined,
        newData: row.new_data ? JSON.parse(row.new_data) : undefined,
        createdAt: row.created_at,
        undone: !!row.undone,
        undoneAt: row.undone_at,
      }));
    } catch (error) {
      console.error('[Undo] Failed to get operation history:', error);
      return [];
    }
  }
}
