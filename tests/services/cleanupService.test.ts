import { describe, it, expect } from 'vitest';
import { isSafeTable, shouldDeleteTable } from '../../src/services/cleanupService';

describe('Cleanup Service - Table Safety Checks', () => {
  describe('isSafeTable', () => {
    it('should return true for safe tables', () => {
      const safeTables = [
        'users', 'channel_configs', 'push_templates', 'scheduled_pushes',
        'channel_groups', 'push_history', 'audit_logs', 'metrics',
        'scheduled_locks', 'backup_runs', 'backup_endpoints',
        'backup_records', 'system_settings', 'd1_migrations',
        'sqlite_sequence', 'sqlite_stat1'
      ];
      
      for (const table of safeTables) {
        expect(isSafeTable(table)).toBe(true);
        expect(isSafeTable(table.toUpperCase())).toBe(true);
        expect(isSafeTable(table.toLowerCase())).toBe(true);
      }
    });

    it('should return false for unsafe tables', () => {
      expect(isSafeTable('users_backup_20240604')).toBe(false);
      expect(isSafeTable('password_reset_requests')).toBe(false);
      expect(isSafeTable('some_new_table')).toBe(false);
    });
  });

  describe('shouldDeleteTable', () => {
    it('should return true for backup tables', () => {
      expect(shouldDeleteTable('users_backup_20240604_auto')).toBe(true);
      expect(shouldDeleteTable('users_backup_20240607_remove_cache_cache')).toBe(true);
      expect(shouldDeleteTable('push_history_backup_20240603')).toBe(true);
    });

    it('should return true for temp tables ending with _new', () => {
      expect(shouldDeleteTable('users_new')).toBe(true);
      expect(shouldDeleteTable('push_templates_new')).toBe(true);
    });

    it('should return true for deprecated tables', () => {
      expect(shouldDeleteTable('password_reset_requests')).toBe(true);
    });

    it('should return false for safe tables', () => {
      expect(shouldDeleteTable('users')).toBe(false);
      expect(shouldDeleteTable('channel_configs')).toBe(false);
      expect(shouldDeleteTable('push_history')).toBe(false);
    });

    it('should return false for unknown tables', () => {
      expect(shouldDeleteTable('some_new_feature_table')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string', () => {
      expect(isSafeTable('')).toBe(false);
      expect(shouldDeleteTable('')).toBe(false);
    });

    it('should handle null-like strings', () => {
      expect(isSafeTable('null')).toBe(false);
      expect(shouldDeleteTable('null')).toBe(false);
    });

    it('should handle table names with special characters', () => {
      expect(isSafeTable('users_test')).toBe(false);
      expect(shouldDeleteTable('users_test_backup_20240101')).toBe(true);
    });
  });
});

describe('Cleanup Service - Whitelist Maintenance', () => {
  it('should have all expected business tables in whitelist', () => {
    const expectedTables = [
      'users', 'channel_configs', 'push_templates', 'scheduled_pushes',
      'channel_groups', 'push_history', 'audit_logs', 'metrics',
      'scheduled_locks', 'backup_runs', 'backup_endpoints',
      'backup_records', 'system_settings'
    ];
    
    for (const table of expectedTables) {
      expect(isSafeTable(table)).toBe(true);
    }
  });

  it('should have all system tables in whitelist', () => {
    const systemTables = ['d1_migrations', 'sqlite_sequence', 'sqlite_stat1'];
    
    for (const table of systemTables) {
      expect(isSafeTable(table)).toBe(true);
    }
  });
});
