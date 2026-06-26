/**
 * TOTP (Time-based One-Time Password) 工具
 * 使用 Web Crypto API 实现，兼容 Cloudflare Workers
 */

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
 * 生成二维码 data URL（使用纯 SVG 实现）
 */
export async function generateQRCodeDataURL(url: string): Promise<string> {
  const qr = createQRCodeSVG(url);
  const svgBase64 = btoa(unescape(encodeURIComponent(qr)));
  return `data:image/svg+xml;base64,${svgBase64}`;
}

/**
 * QR Code SVG 生成器（基于 qr-code 规范的简化实现）
 */
function createQRCodeSVG(url: string): string {
  // 使用简化的 QR 码生成（Version 2, 25x25 模块）
  const size = 25;
  const modules = generateQRMatrix(url, size);
  const cellSize = 4;
  const margin = 20;
  const svgSize = size * cellSize + margin * 2;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}">`;
  svg += `<rect width="${svgSize}" height="${svgSize}" fill="white"/>`;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y][x]) {
        svg += `<rect x="${margin + x * cellSize}" y="${margin + y * cellSize}" width="${cellSize}" height="${cellSize}" fill="black"/>`;
      }
    }
  }

  svg += '</svg>';
  return svg;
}

/**
 * 生成 QR 码矩阵（简化版，适合短 URL）
 */
function generateQRMatrix(text: string, size: number): boolean[][] {
  const matrix: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false)
  );

  // 添加固定模式（三个角的定位图案）
  addFinderPattern(matrix, 0, 0);
  addFinderPattern(matrix, size - 7, 0);
  addFinderPattern(matrix, 0, size - 7);

  // 添加时序图案
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // 将文本数据编码到矩阵中（简化：使用字节模式）
  const data = encodeText(text, size);
  let bitIndex = 0;

  for (let x = size - 1; x >= 0; x -= 2) {
    if (x === 6) x = 5; // 跳过时序图案列
    for (let y = 0; y < size; y++) {
      for (let dx = 0; dx < 2; dx++) {
        const currentX = x - dx;
        if (currentX < 0 || currentX >= size) continue;
        if (matrix[y][currentX]) continue; // 跳过已填充的图案
        if (isReservedArea(currentX, y, size)) continue;

        matrix[y][currentX] = bitIndex < data.length ? data[bitIndex] : false;
        bitIndex++;
      }
    }
  }

  return matrix;
}

/**
 * 添加定位图案
 */
function addFinderPattern(matrix: boolean[][], row: number, col: number): void {
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      if (
        y === 0 ||
        y === 6 ||
        x === 0 ||
        x === 6 ||
        (y >= 2 && y <= 4 && x >= 2 && x <= 4)
      ) {
        matrix[row + y][col + x] = true;
      }
    }
  }
}

/**
 * 检查是否是保留区域
 */
function isReservedArea(x: number, y: number, size: number): boolean {
  // 定位图案 + 分隔符
  if (x < 8 && y < 8) return true;
  if (x >= size - 8 && y < 8) return true;
  if (x < 8 && y >= size - 8) return true;
  // 时序图案
  if (x === 6 || y === 6) return true;
  return false;
}

/**
 * 编码文本为位数组（简化版字节模式）
 */
function encodeText(text: string, size: number): boolean[] {
  const bits: boolean[] = [];
  const bytes = new TextEncoder().encode(text);

  // 模式指示符：字节模式 = 0100
  bits.push(false, true, false, false);

  // 字符计数（简化：使用 8 位）
  const count = Math.min(bytes.length, 255);
  for (let i = 7; i >= 0; i--) {
    bits.push(((count >> i) & 1) === 1);
  }

  // 数据
  for (const byte of bytes) {
    for (let i = 7; i >= 0; i--) {
      bits.push(((byte >> i) & 1) === 1);
    }
  }

  // 终止符
  for (let i = 0; i < 8; i++) {
    bits.push(false);
  }

  return bits;
}
