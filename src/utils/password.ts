/**
 * 密码工具函数
 * 提供安全的密码哈希和验证功能
 */

/**
 * 使用 PBKDF2 算法安全哈希密码
 * 生成格式为 `salt:hash` 的字符串，salt 为 16 字节随机值
 *
 * @param password - 原始密码字符串
 * @returns 哈希后的密码字符串
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  // 生成 16 字节随机 salt
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // 使用 PBKDF2 进行密钥派生（100,000 次迭代，SHA-256 哈希）
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  const hashHex = Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `${saltHex}:${hashHex}`;
}

/**
 * 验证密码是否匹配存储的哈希值
 * 兼容新版 PBKDF2 格式和旧版 SHA-256 格式
 *
 * @param password - 用户输入的原始密码
 * @param stored - 存储的哈希密码字符串
 * @returns 密码是否匹配
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [saltHex, hashHex] = stored.split(':');

  // 如果没有 salt，说明是旧版 SHA-256 格式，进行兼容处理
  if (!saltHex || !hashHex) {
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const inputHashed = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return inputHashed === stored;
  }

  // 使用 PBKDF2 验证
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  const computedHash = Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return computedHash === hashHex;
}
