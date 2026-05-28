import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/utils/password';

describe('password utilities', () => {
  const testPassword = 'test-password-123';

  it('should hash and verify password correctly', async () => {
    const hashed = await hashPassword(testPassword);
    
    expect(hashed).toBeDefined();
    expect(hashed).not.toBe(testPassword);
    
    const isValid = await verifyPassword(testPassword, hashed);
    expect(isValid).toBe(true);
  });

  it('should reject incorrect password', async () => {
    const hashed = await hashPassword(testPassword);
    const isValid = await verifyPassword('wrong-password', hashed);
    
    expect(isValid).toBe(false);
  });

  it('should handle empty password', async () => {
    const hashed = await hashPassword('');
    expect(hashed).toBeDefined();
    
    const isValid = await verifyPassword('', hashed);
    expect(isValid).toBe(true);
  });
});