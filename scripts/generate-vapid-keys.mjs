// ============================================
// VAPID 密钥对生成工具
// Web Push 必须的密钥，用于标识推送发送者身份
// ============================================
import webPush from 'web-push';

const vapidKeys = webPush.generateVAPIDKeys();

console.log('================================');
console.log('  VAPID 密钥对已生成');
console.log('================================');
console.log('');
console.log('VAPID_PUBLIC_KEY=' + vapidKeys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + vapidKeys.privateKey);
console.log('');
console.log('请将以上两个值复制到 wrangler.toml 的 [vars] 中');
console.log('================================');
