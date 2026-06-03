// ============================================
// 数据导出服务测试
// ============================================
import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateBackupData,
  computeDataHash
} from '../../src/services/dataExportService';

// 模拟数据
const mockValidBackupData = {
  version: '2.0',
  exportedAt: new Date().toISOString(),
  userId: 'test-user',
  metadata: {
    source: 'd1_export',
    tableCounts: {}
  },
  tables: {
    channelConfigs: [],
    pushTemplates: [],
    scheduledPushes: []
  }
};

const mockInvalidBackupData = {
  // 缺少必需字段
  version: '2.0'
};

describe('Backup Validation', () => {
  it('should validate valid backup data', () => {
    const result = validateBackupData(mockValidBackupData);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should detect invalid backup data', () => {
    const result = validateBackupData(mockInvalidBackupData);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should warn on empty data', () => {
    const emptyData = {
      ...mockValidBackupData,
      tables: {}
    };
    const result = validateBackupData(emptyData);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('should warn on large push history', () => {
    const largeData = {
      ...mockValidBackupData,
      tables: {
        ...mockValidBackupData.tables,
        pushHistory: Array(1500).fill({})
      }
    };
    const result = validateBackupData(largeData);
    // 测试可以修改为检查是否有警告
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('Hash Computation', () => {
  it('should compute consistent hash for same data', () => {
    const data = { a: 1, b: 2 };
    const hash1 = computeDataHash(data);
    const hash2 = computeDataHash(data);
    expect(hash1).toBe(hash2);
  });

  it('should compute different hash for different data', () => {
    const data1 = { a: 1, b: 2 };
    const data2 = { a: 1, b: 3 };
    const hash1 = computeDataHash(data1);
    const hash2 = computeDataHash(data2);
    expect(hash1).not.toBe(hash2);
  });

  it('should handle invalid data gracefully', () => {
    const circular: any = {};
    circular.self = circular;
    expect(() => computeDataHash(circular)).not.toThrow();
  });
});

