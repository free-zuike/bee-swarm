// ============================================
// VAPID 密钥对生成工具
// 使用 jose 库生成，输出 JWK 格式（避免 PKCS#8 兼容问题）
// ============================================

const { generateKeyPair, exportJWK } = await import('jose');

async function generateVAPIDKeys() {
  const { publicKey, privateKey } = await generateKeyPair('ES256', {
    extractable: true,
  });

  const publicJWK = await exportJWK(publicKey);
  const privateJWK = await exportJWK(privateKey);

  // 只保留必要字段，转为紧凑 JSON
  const pub = JSON.stringify({ kty: publicJWK.kty, crv: publicJWK.crv, x: publicJWK.x, y: publicJWK.y });
  const priv = JSON.stringify({ kty: privateJWK.kty, crv: privateJWK.crv, d: privateJWK.d, x: privateJWK.x, y: privateJWK.y });

  return { publicKey: pub, privateKey: priv };
}

const keys = await generateVAPIDKeys();

console.log('================================');
console.log('  VAPID 密钥对已生成 (JWK 格式)');
console.log('================================');
console.log('');
console.log('VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
console.log('');
console.log('请将以上两个值设置到 Cloudflare Secrets 中:');
console.log('  wrangler secret put VAPID_PUBLIC_KEY');
console.log('  wrangler secret put VAPID_PRIVATE_KEY');
console.log('================================');
