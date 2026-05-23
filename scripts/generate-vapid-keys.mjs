// ============================================
// VAPID 密钥对生成工具
// Web Push 必须的密钥，用于标识推送发送者身份
// 生成 ECDSA P-256 密钥对（用于 VAPID JWT 签名）
// ============================================

/**
 * Base64Url 编码（Web Push 标准格式）
 */
function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * 生成 VAPID 密钥对 (ECDSA P-256)
 * VAPID 使用 ECDSA 签名 JWT
 */
async function generateVAPIDKeys() {
  // 生成 ECDSA P-256 密钥对
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true, // 可导出
    ['sign', 'verify']
  );

  // 导出公钥（uncompressed point format: 0x04 + x + y，共 65 字节）
  const publicKeyBuffer = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  
  // 导出私钥（完整 PKCS#8 格式）
  const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: base64UrlEncode(publicKeyBuffer),
    privateKey: base64UrlEncode(privateKeyBuffer),  // 完整的 PKCS#8
  };
}

// 生成并输出密钥
const vapidKeys = await generateVAPIDKeys();

console.log('================================');
console.log('  VAPID 密钥对已生成 (ECDSA P-256)');
console.log('================================');
console.log('');
console.log('VAPID_PUBLIC_KEY=' + vapidKeys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + vapidKeys.privateKey);
console.log('');
console.log('请将以上两个值设置到 Cloudflare Secrets 中:');
console.log('  wrangler secret put VAPID_PUBLIC_KEY');
console.log('  wrangler secret put VAPID_PRIVATE_KEY');
console.log('================================');
