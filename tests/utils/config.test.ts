import { describe, it, expect, vi, beforeEach } from 'vitest';
import { filterSensitiveConfig, hasSensitiveFields, SENSITIVE_FIELDS } from '../../src/utils/config';

describe('config utilities', () => {
  describe('filterSensitiveConfig', () => {
    it('should filter out secretAccessKey', () => {
      const config = {
        url: 'https://example.com',
        bucket: 'my-bucket',
        secretAccessKey: 'sk_xxx',
        accessKeyId: 'ak_xxx',
      };
      
      const filtered = filterSensitiveConfig(config);
      
      expect(filtered.url).toBe('https://example.com');
      expect(filtered.bucket).toBe('my-bucket');
      expect((filtered as any).secretAccessKey).toBeUndefined();
      expect((filtered as any).accessKeyId).toBeUndefined();
    });

    it('should filter out password and token', () => {
      const config = {
        url: 'https://dav.example.com',
        username: 'admin',
        password: 'secret123',
        token: 'token_xxx',
      };
      
      const filtered = filterSensitiveConfig(config);
      
      expect(filtered.url).toBe('https://dav.example.com');
      expect(filtered.username).toBe('admin');
      expect((filtered as any).password).toBeUndefined();
      expect((filtered as any).token).toBeUndefined();
    });

    it('should filter out all sensitive fields', () => {
      const config = {
        url: 'https://example.com',
        secretAccessKey: 'sk_xxx',
        accessKeyId: 'ak_xxx',
        password: 'pwd',
        secret: 'sec',
        token: 'tok',
        apiKey: 'key',
        privateKey: 'pk',
      };
      
      const filtered = filterSensitiveConfig(config);
      
      expect(filtered.url).toBe('https://example.com');
      expect((filtered as any).secretAccessKey).toBeUndefined();
      expect((filtered as any).accessKeyId).toBeUndefined();
      expect((filtered as any).password).toBeUndefined();
      expect((filtered as any).secret).toBeUndefined();
      expect((filtered as any).token).toBeUndefined();
      expect((filtered as any).apiKey).toBeUndefined();
      expect((filtered as any).privateKey).toBeUndefined();
    });

    it('should not modify original config object', () => {
      const config = {
        url: 'https://example.com',
        secretAccessKey: 'sk_xxx',
      };
      
      const filtered = filterSensitiveConfig(config);
      
      expect(filtered).not.toBe(config);
      expect(config.secretAccessKey).toBe('sk_xxx');
    });
  });

  describe('hasSensitiveFields', () => {
    it('should return true if config has sensitive fields', () => {
      const config = { password: 'secret' };
      expect(hasSensitiveFields(config)).toBe(true);
    });

    it('should return false if config has no sensitive fields', () => {
      const config = { url: 'https://example.com', name: 'test' };
      expect(hasSensitiveFields(config)).toBe(false);
    });

    it('should check all sensitive field types', () => {
      for (const field of SENSITIVE_FIELDS) {
        const config = { [field]: 'value' };
        expect(hasSensitiveFields(config)).toBe(true);
      }
    });
  });

  describe('SENSITIVE_FIELDS', () => {
    it('should contain expected fields', () => {
      expect(SENSITIVE_FIELDS).toContain('secretAccessKey');
      expect(SENSITIVE_FIELDS).toContain('accessKeyId');
      expect(SENSITIVE_FIELDS).toContain('password');
      expect(SENSITIVE_FIELDS).toContain('secret');
      expect(SENSITIVE_FIELDS).toContain('token');
      expect(SENSITIVE_FIELDS).toContain('apiKey');
      expect(SENSITIVE_FIELDS).toContain('privateKey');
    });
  });
});
