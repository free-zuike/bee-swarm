// ============================================
// TOTP (Time-based One-Time Password) 实现
// RFC 6238 - HMAC-SHA1 + 时间窗口
// ============================================

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** 生成 20 字节随机 secret 并编码为 base32 */
export function generateTOTPSecret(length = 20): string {
  const buffer = new Uint8Array(length);
  crypto.getRandomValues(buffer);
  return encodeBase32(buffer);
}

/** Base32 编码 */
function encodeBase32(bytes: Uint8Array): string {
  let bits = '';
  for (const b of bytes) {
    bits += b.toString(2).padStart(8, '0');
  }
  let result = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    result += BASE32_CHARS[parseInt(chunk, 2)];
  }
  return result;
}

/** Base32 解码 */
function decodeBase32(str: string): Uint8Array {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const c of clean) {
    const idx = BASE32_CHARS.indexOf(c);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return bytes;
}

/** HMAC-SHA1（使用 Web Crypto API） */
async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    message.buffer.slice(message.byteOffset, message.byteOffset + message.byteLength) as ArrayBuffer
  );
  return new Uint8Array(signature);
}

/** 动态截断 */
function dynamicTruncation(hash: Uint8Array): number {
  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);
  return binary % 1000000;
}

/** 计算 TOTP 值 */
async function computeTOTP(secret: string, timeStep: number): Promise<string> {
  const key = decodeBase32(secret);
  const time = Math.floor(Date.now() / 1000 / 30);
  const timeBuffer = new ArrayBuffer(8);
  const timeView = new DataView(timeBuffer);
  timeView.setUint32(4, time + timeStep, false);
  const message = new Uint8Array(timeBuffer);
  const hash = await hmacSha1(key, message);
  const code = dynamicTruncation(hash);
  return code.toString().padStart(6, '0');
}

/** 验证 TOTP（允许前后1个时间窗口） */
export async function verifyTOTP(secret: string, token: string): Promise<boolean> {
  for (let offset = -1; offset <= 1; offset++) {
    const expected = await computeTOTP(secret, offset);
    if (expected === token) {
      return true;
    }
  }
  return false;
}

/** 生成二维码 data URL（使用 SVG 内联） */
export async function generateQRCodeDataURL(url: string): Promise<string> {
  const qr = createQRCodeSVG(url);
  const svgBase64 = btoa(unescape(encodeURIComponent(qr)));
  return `data:image/svg+xml;base64,${svgBase64}`;
}

/** 简易 QR Code SVG 生成（仅用于 TOTP setup，生产建议用 qrcode 库） */
function createQRCodeSVG(_url: string): string {
  // 使用简单的文本表示作为后备，实际项目可集成 qrcode 库
  // 这里生成一个基础的 SVG 占位，用户可以复制 otpauth URL 手动添加
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
    <rect width="200" height="200" fill="white"/>
    <text x="100" y="90" text-anchor="middle" font-size="14" fill="#333">TOTP Setup</text>
    <text x="100" y="115" text-anchor="middle" font-size="10" fill="#666">Please copy the</text>
    <text x="100" y="130" text-anchor="middle" font-size="10" fill="#666">otpauth URL below</text>
  </svg>`;
  return svg;
}
