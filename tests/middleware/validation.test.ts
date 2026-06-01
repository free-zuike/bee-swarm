import { describe, it, expect } from 'vitest';
import { schemas } from '../../src/middleware/validation';
import { z } from 'zod';

describe('Validation schemas', () => {
  describe('register schema', () => {
    it('should validate correct register data', () => {
      const data = {
        email: 'test@example.com',
        password: 'Password123',
      };
      
      const result = schemas.register.safeParse(data);
      
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const data = {
        email: 'invalid-email',
        password: 'password123',
      };
      
      const result = schemas.register.safeParse(data);
      
      expect(result.success).toBe(false);
    });

    it('should reject short password', () => {
      const data = {
        email: 'test@example.com',
        password: '1234567',
      };
      
      const result = schemas.register.safeParse(data);
      
      expect(result.success).toBe(false);
    });
  });

  describe('login schema', () => {
    it('should validate correct login data', () => {
      const data = {
        email: 'test@example.com',
        password: 'password123',
      };
      
      const result = schemas.login.safeParse(data);
      
      expect(result.success).toBe(true);
    });

    it('should reject empty password', () => {
      const data = {
        email: 'test@example.com',
        password: '',
      };
      
      const result = schemas.login.safeParse(data);
      
      expect(result.success).toBe(false);
    });
  });

  describe('apikey schema', () => {
    it('should validate correct apikey data', () => {
      const data = {
        username: 'testuser',
        password: 'password123',
      };
      
      const result = schemas.apikey.safeParse(data);
      
      expect(result.success).toBe(true);
    });

    it('should validate with optional refresh flag', () => {
      const data = {
        username: 'testuser',
        password: 'password123',
        refresh: true,
      };
      
      const result = schemas.apikey.safeParse(data);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.refresh).toBe(true);
      }
    });

    it('should default refresh to false', () => {
      const data = {
        username: 'testuser',
        password: 'password123',
      };
      
      const result = schemas.apikey.safeParse(data);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.refresh).toBe(false);
      }
    });
  });

  describe('push schema', () => {
    it('should validate correct push data', () => {
      const data = {
        title: 'Test Notification',
        body: 'This is a test',
        channels: ['telegram', 'email'],
      };
      
      const result = schemas.push.safeParse(data);
      
      expect(result.success).toBe(true);
    });

    it('should allow minimal push data', () => {
      const data = {
        title: 'Test Notification',
      };
      
      const result = schemas.push.safeParse(data);
      
      expect(result.success).toBe(true);
    });

    it('should reject empty title', () => {
      const data = {
        title: '',
      };
      
      const result = schemas.push.safeParse(data);
      
      expect(result.success).toBe(false);
    });
  });

  describe('token schema', () => {
    it('should validate correct token data', () => {
      const data = {
        email: 'test@example.com',
        password: 'password123',
      };
      
      const result = schemas.token.safeParse(data);
      
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const data = {
        email: 'invalid',
        password: 'password123',
      };
      
      const result = schemas.token.safeParse(data);
      
      expect(result.success).toBe(false);
    });
  });

  describe('refresh schema', () => {
    it('should validate correct refresh data', () => {
      const data = {
        refreshToken: 'some-refresh-token',
      };
      
      const result = schemas.refresh.safeParse(data);
      
      expect(result.success).toBe(true);
    });

    it('should reject empty refresh token', () => {
      const data = {
        refreshToken: '',
      };
      
      const result = schemas.refresh.safeParse(data);
      
      expect(result.success).toBe(false);
    });
  });
});
