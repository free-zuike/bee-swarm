import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Env } from '../../src/types';

// 模拟 D1 数据库 - 简化版本
class SimpleMockD1Database {
  prepare(_sql: string) {
    return {
      bind: (..._params: any[]) => ({
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => ({ success: true }),
      }),
    };
  }
}

interface TestEnv extends Env {
  DB: SimpleMockD1Database;
}

const createMockEnv = (): TestEnv => {
  return {
    DB: new SimpleMockD1Database(),
  } as TestEnv;
};

describe('API Routes Structure', () => {
  describe('API Export', () => {
    it('should export api router', async () => {
      const { api } = await import('../../src/routes/api');
      expect(api).toBeDefined();
    });

    it('should have register route', async () => {
      const { api } = await import('../../src/routes/api');
      const routes = api.routes;
      const registerRoute = routes.find(r => r.path === '/register');
      expect(registerRoute).toBeDefined();
      expect(registerRoute?.method).toBe('POST');
    });

    it('should have login route', async () => {
      const { api } = await import('../../src/routes/api');
      const routes = api.routes;
      const loginRoute = routes.find(r => r.path === '/login');
      expect(loginRoute).toBeDefined();
      expect(loginRoute?.method).toBe('POST');
    });

    it('should have token route', async () => {
      const { api } = await import('../../src/routes/api');
      const routes = api.routes;
      const tokenRoute = routes.find(r => r.path === '/token');
      expect(tokenRoute).toBeDefined();
      expect(tokenRoute?.method).toBe('POST');
    });

    it('should have refresh route', async () => {
      const { api } = await import('../../src/routes/api');
      const routes = api.routes;
      const refreshRoute = routes.find(r => r.path === '/refresh');
      expect(refreshRoute).toBeDefined();
      expect(refreshRoute?.method).toBe('POST');
    });

    it('should have apikey routes', async () => {
      const { api } = await import('../../src/routes/api');
      const routes = api.routes;
      const apikeyGet = routes.find(r => r.path === '/apikey' && r.method === 'GET');
      const apikeyPost = routes.find(r => r.path === '/apikey' && r.method === 'POST');
      expect(apikeyGet).toBeDefined();
      expect(apikeyPost).toBeDefined();
    });
  });

  describe('Admin API Routes', () => {
    it('should have channels route', async () => {
      const { api } = await import('../../src/routes/api');
      const routes = api.routes;
      const adminRoutes = routes.filter(r => r.path.startsWith('/admin'));
      const channelsRoute = adminRoutes.find(r => r.path === '/admin/channels');
      expect(channelsRoute).toBeDefined();
    });

    it('should have push route', async () => {
      const { api } = await import('../../src/routes/api');
      const routes = api.routes;
      const adminRoutes = routes.filter(r => r.path.startsWith('/admin'));
      const pushRoute = adminRoutes.find(r => r.path === '/admin/push');
      expect(pushRoute).toBeDefined();
      expect(pushRoute?.method).toBe('POST');
    });

    it('should have templates routes', async () => {
      const { api } = await import('../../src/routes/api');
      const routes = api.routes;
      const adminRoutes = routes.filter(r => r.path.startsWith('/admin'));
      const templatesRoute = adminRoutes.find(r => r.path === '/admin/templates');
      expect(templatesRoute).toBeDefined();
      expect(templatesRoute?.method).toBe('GET');
    });

    it('should have groups routes', async () => {
      const { api } = await import('../../src/routes/api');
      const routes = api.routes;
      const adminRoutes = routes.filter(r => r.path.startsWith('/admin'));
      const groupsRoute = adminRoutes.find(r => r.path === '/admin/groups');
      expect(groupsRoute).toBeDefined();
      expect(groupsRoute?.method).toBe('GET');
    });

    it('should have scheduled routes', async () => {
      const { api } = await import('../../src/routes/api');
      const routes = api.routes;
      const adminRoutes = routes.filter(r => r.path.startsWith('/admin'));
      const scheduledRoute = adminRoutes.find(r => r.path === '/admin/scheduled');
      expect(scheduledRoute).toBeDefined();
      expect(scheduledRoute?.method).toBe('GET');
    });

    it('should have audit routes', async () => {
      const { api } = await import('../../src/routes/api');
      const routes = api.routes;
      const adminRoutes = routes.filter(r => r.path.startsWith('/admin'));
      const auditRoute = adminRoutes.find(r => r.path === '/admin/audit');
      expect(auditRoute).toBeDefined();
      expect(auditRoute?.method).toBe('GET');
    });

    it('should have webhook routes', async () => {
      const { api } = await import('../../src/routes/api');
      const routes = api.routes;
      const adminRoutes = routes.filter(r => r.path.startsWith('/admin'));
      const webhookPushRoute = adminRoutes.find(r => r.path === '/admin/webhook/push');
      const webhookUrlRoute = adminRoutes.find(r => r.path === '/admin/webhook/url');
      expect(webhookPushRoute).toBeDefined();
      expect(webhookUrlRoute).toBeDefined();
    });

    it('should have backup routes', async () => {
      const { api } = await import('../../src/routes/api');
      const routes = api.routes;
      const adminRoutes = routes.filter(r => r.path.startsWith('/admin'));
      const backupRoute = adminRoutes.find(r => r.path.includes('/admin/backup'));
      expect(backupRoute).toBeDefined();
    });
  });
});

describe('API Route Handlers', () => {
  let mockEnv: TestEnv;

  beforeEach(async () => {
    mockEnv = createMockEnv();
  });

  describe('Input Validation', () => {
    it('should validate registration input structure', async () => {
      const { schemas } = await import('../../src/middleware/validation');
      const result = schemas.register.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should validate login input structure', async () => {
      const { schemas } = await import('../../src/middleware/validation');
      const result = schemas.login.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should validate push input structure', async () => {
      const { schemas } = await import('../../src/middleware/validation');
      const result = schemas.push.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should validate apikey input structure', async () => {
      const { schemas } = await import('../../src/middleware/validation');
      const result = schemas.apikey.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should validate token input structure', async () => {
      const { schemas } = await import('../../src/middleware/validation');
      const result = schemas.token.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should validate refresh input structure', async () => {
      const { schemas } = await import('../../src/middleware/validation');
      const result = schemas.refresh.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('Validation Rules', () => {
    it('should require email for registration', async () => {
      const { schemas } = await import('../../src/middleware/validation');
      const result = schemas.register.safeParse({ password: 'password123' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.path.includes('email'))).toBe(true);
      }
    });

    it('should require password for registration', async () => {
      const { schemas } = await import('../../src/middleware/validation');
      const result = schemas.register.safeParse({ email: 'test@example.com' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.path.includes('password'))).toBe(true);
      }
    });

    it('should validate email format', async () => {
      const { schemas } = await import('../../src/middleware/validation');
      const result = schemas.register.safeParse({
        email: 'invalid-email',
        password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('should validate password minimum length', async () => {
      const { schemas } = await import('../../src/middleware/validation');
      const result = schemas.register.safeParse({
        email: 'test@example.com',
        password: '123',
      });
      expect(result.success).toBe(false);
    });

    it('should require title for push', async () => {
      const { schemas } = await import('../../src/middleware/validation');
      const result = schemas.push.safeParse({
        body: 'Test message',
        channels: ['bark'],
      });
      expect(result.success).toBe(false);
    });

    it('should allow push without channels (optional)', async () => {
      const { schemas } = await import('../../src/middleware/validation');
      const result = schemas.push.safeParse({
        title: 'Test',
        body: 'Test message',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid push input', async () => {
      const { schemas } = await import('../../src/middleware/validation');
      const result = schemas.push.safeParse({
        title: 'Test',
        body: 'Test message',
        channels: ['bark'],
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid registration input', async () => {
      const { schemas } = await import('../../src/middleware/validation');
      const result = schemas.register.safeParse({
        email: 'test@example.com',
        password: 'Password123',
      });
      expect(result.success).toBe(true);
    });
  });
});

describe('API Security Configuration', () => {
  describe('Middleware Setup', () => {
    it('should export API router', async () => {
      const { api } = await import('../../src/routes/api');
      expect(api).toBeDefined();
    });

    it('should have route definitions', async () => {
      const { api } = await import('../../src/routes/api');
      expect(api.routes).toBeDefined();
      expect(Array.isArray(api.routes)).toBe(true);
    });

    it('should have multiple route handlers', async () => {
      const { api } = await import('../../src/routes/api');
      expect(api.routes.length).toBeGreaterThan(0);
    });
  });
});
