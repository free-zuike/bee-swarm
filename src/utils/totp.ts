/**
 * TOTP (Time-based One-Time Password) 工具
 * 使用 Web Crypto API 实现，兼容 Cloudflare Workers
 */
import QRCode from 'qrcode';

/**
 * 生成随机 TOTP secret (Base32 编码)
 */
export function generateTOTPSecret(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => chars[b % 32])
    .join('');
}

/**
 * Base32 解码
 */
function base32Decode(encoded: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = encoded.replace(/[^A-Z2-7]/gi, '').toUpperCase();
  const length = Math.floor((cleaned.length * 5) / 8);
  const result = new Uint8Array(length);

  let bits = 0;
  let value = 0;
  let index = 0;

  for (const char of cleaned) {
    const charIndex = chars.indexOf(char);
    if (charIndex === -1) continue;

    value = (value << 5) | charIndex;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;
      result[index++] = (value >>> bits) & 0xff;
    }
  }

  return result;
}

/**
 * 生成 TOTP 代码
 */
export async function generateTOTP(
  secret: string,
  timeStep: number = 30,
  digits: number = 6
): Promise<string> {
  const keyBytes = base32Decode(secret);
  const epoch = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / timeStep);

  // 将 counter 转换为 8 字节大端序
  const counterBytes = new ArrayBuffer(8);
  const view = new DataView(counterBytes);
  view.setUint32(4, counter, false);

  // 导入密钥
  const keyBuffer = new Uint8Array(keyBytes).buffer as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  // 计算 HMAC
  const hmac = await crypto.subtle.sign('HMAC', key, counterBytes);
  const hmacBytes = new Uint8Array(hmac);

  // 动态截断
  const offset = hmacBytes[hmacBytes.length - 1] & 0x0f;
  const binary =
    ((hmacBytes[offset] & 0x7f) << 24) |
    ((hmacBytes[offset + 1] & 0xff) << 16) |
    ((hmacBytes[offset + 2] & 0xff) << 8) |
    (hmacBytes[offset + 3] & 0xff);

  // 生成指定长度的代码
  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, '0');
}

/**
 * 验证 TOTP 代码（允许前后各 1 个时间步的偏差）
 */
export async function verifyTOTP(
  secret: string,
  token: string,
  window: number = 1
): Promise<boolean> {
  const timeStep = 30;
  const epoch = Math.floor(Date.now() / 1000);
  const currentCounter = Math.floor(epoch / timeStep);

  for (let i = -window; i <= window; i++) {
    const counter = currentCounter + i;
    const keyBytes = base32Decode(secret);

    const counterBytes = new ArrayBuffer(8);
    const view = new DataView(counterBytes);
    view.setUint32(4, counter, false);

    const keyBuffer = new Uint8Array(keyBytes).buffer as ArrayBuffer;
    const key = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );

    const hmac = await crypto.subtle.sign('HMAC', key, counterBytes);
    const hmacBytes = new Uint8Array(hmac);

    const offset = hmacBytes[hmacBytes.length - 1] & 0x0f;
    const binary =
      ((hmacBytes[offset] & 0x7f) << 24) |
      ((hmacBytes[offset + 1] & 0xff) << 16) |
      ((hmacBytes[offset + 2] & 0xff) << 8) |
      (hmacBytes[offset + 3] & 0xff);

    const expected = (binary % 1000000).toString().padStart(6, '0');
    if (expected === token) {
      return true;
    }
  }
  return false;
}

/**
 * 生成二维码 data URL（使用 qrcode 库）
 */
export async function generateQRCodeDataURL(url: string): Promise<string> {
  const svg = await QRCode.toString(url, {
    type: 'svg',
    margin: 2,
    width: 200,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
  const svgBase64 = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${svgBase64}`;
}
