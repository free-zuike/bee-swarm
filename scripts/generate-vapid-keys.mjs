// ============================================
// VAPID 密钥对生成工具
// 使用 web-push 库生成标准格式密钥
// ============================================

const webpush = await import('web-push');

// 生成 VAPID 密钥对
const vapidKeys = webpush.generateVAPIDKeys();

console.log('================================');
console.log('  VAPID 密钥对已生成');
console.log('================================');
console.log('');
console.log('VAPID_PUBLIC_KEY=' + vapidKeys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + vapidKeys.privateKey);
console.log('');
console.log('请将以上两个值设置到 Cloudflare Secrets 中:');
console.log('  wrangler secret put VAPID_PUBLIC_KEY');
console.log('  wrangler secret put VAPID_PRIVATE_KEY');
console.log('================================');
