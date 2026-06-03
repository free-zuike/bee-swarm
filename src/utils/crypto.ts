// ============================================
// 加密工具
// ============================================

/**
 * 从用户数据生成加密密钥（使用用户密码哈希和用户ID）
 */
async function deriveEncryptionKey(secret: string, salt: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  return key;
}

/**
 * 加密数据
 * @param data 要加密的数据字符串
 * @param secret 密钥材料（用户ID+密码哈希等）
 * @param salt 盐值（可以是用户ID或邮箱）
 * @returns 加密后的字符串，包含IV和加密数据
 */
export async function encryptData(data: string, secret: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await deriveEncryptionKey(secret, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 12 bytes IV for AES-GCM

  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(data));

  const ivBase64 = btoa(String.fromCharCode(...Array.from(iv)));
  const encryptedBase64 = btoa(String.fromCharCode(...Array.from(new Uint8Array(encrypted))));

  return `v1:${ivBase64}:${encryptedBase64}`;
}

/**
 * 解密数据
 * @param encryptedData 加密字符串（格式：v1:IV:DATA）
 * @param secret 密钥材料（与加密时相同）
 * @param salt 盐值（与加密时相同）
 * @returns 解密后的字符串
 */
export async function decryptData(
  encryptedData: string,
  secret: string,
  salt: string
): Promise<string> {
  const decoder = new TextDecoder();
  const key = await deriveEncryptionKey(secret, salt);

  // 检查是否是加密格式
  if (!encryptedData.startsWith('v1:')) {
    // 不是加密格式，直接返回
    return encryptedData;
  }

  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const ivBase64 = parts[1];
  const dataBase64 = parts[2];

  const iv = new Uint8Array([...atob(ivBase64)].map((c) => c.charCodeAt(0)));
  const encryptedBytes = new Uint8Array([...atob(dataBase64)].map((c) => c.charCodeAt(0)));

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encryptedBytes);

  return decoder.decode(decrypted);
}

/**
 * 生成安全的随机文件名
 */
export function generateSecureFilename(): string {
  const uuid = crypto.randomUUID();
  const timestamp = Date.now();
  return `backup-${timestamp}-${uuid}.json`;
}
