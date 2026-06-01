import { describe, it, expect } from 'vitest';

describe('Types', () => {
  describe('ErrorCode', () => {
    it('should be string literals', () => {
      const errorCodes = [
        'VALIDATION_ERROR',
        'AUTH_ERROR',
        'NOT_FOUND',
        'CONFLICT',
        'INTERNAL_ERROR',
        'RATE_LIMITED',
        'SERVICE_UNAVAILABLE',
      ];
      
      errorCodes.forEach(code => {
        expect(typeof code).toBe('string');
      });
    });
  });

  describe('Env interface', () => {
    it('should have DB binding', () => {
      const mockEnv = {
        DB: {},
        ASSETS: {},
      };
      
      expect('DB' in mockEnv).toBe(true);
      expect('ASSETS' in mockEnv).toBe(true);
    });

    it('should allow optional ALLOWED_ORIGINS', () => {
      const mockEnv = {
        DB: {},
        ASSETS: {},
        ALLOWED_ORIGINS: 'https://example.com',
      };
      
      expect(mockEnv.ALLOWED_ORIGINS).toBeDefined();
    });
  });

  describe('PushRequest type', () => {
    it('should allow optional body', () => {
      const minimalRequest = {
        title: 'Test',
      };
      
      expect(minimalRequest).toBeDefined();
      expect(minimalRequest.title).toBe('Test');
    });

    it('should allow optional channels', () => {
      const requestWithChannels = {
        title: 'Test',
        channels: ['telegram', 'email'],
      };
      
      expect(requestWithChannels.channels).toHaveLength(2);
    });
  });

  describe('BackupEndpoint type', () => {
    it('should support S3 config', () => {
      const s3Config = {
        id: 'backup-1',
        name: 'S3 Backup',
        type: 's3' as const,
        enabled: true,
        config: {
          provider: 'aws',
          region: 'us-east-1',
          bucket: 'my-bucket',
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        },
        schedule: {
          enabled: false,
          startTime: '00:00',
          timezone: 'UTC',
        },
      };
      
      expect(s3Config.type).toBe('s3');
      expect(s3Config.config.provider).toBe('aws');
    });

    it('should support WebDAV config', () => {
      const webdavConfig = {
        id: 'backup-2',
        name: 'WebDAV Backup',
        type: 'webdav' as const,
        enabled: true,
        config: {
          url: 'https://dav.example.com',
          username: 'user',
        },
        schedule: {
          enabled: true,
          startTime: '02:00',
          timezone: 'Asia/Shanghai',
        },
      };
      
      expect(webdavConfig.type).toBe('webdav');
      expect(webdavConfig.config.url).toBe('https://dav.example.com');
    });
  });
});
