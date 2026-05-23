<script setup lang="ts">
// ============================================
// 订阅页面 - Web Push 浏览器订阅
// ============================================
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { getVapidKey, subscribe, unsubscribe } from '@/api';

const router = useRouter();

// 状态
const isSubscribed = ref(false);
const isLoading = ref(false);
const statusMsg = ref('');
const statusType = ref<'success' | 'error' | 'info'>('info');
let swRegistration: ServiceWorkerRegistration | null = null;

// 初始化
onMounted(async () => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    showStatus('您的浏览器不支持推送通知', 'error');
    return;
  }

  try {
    swRegistration = await navigator.serviceWorker.register('/sw.js');
    const subscription = await swRegistration.pushManager.getSubscription();
    isSubscribed.value = subscription !== null;
  } catch (err: any) {
    showStatus('Service Worker 注册失败: ' + err.message, 'error');
  }
});

// 切换订阅
async function toggleSubscription() {
  if (isLoading.value) return;
  isLoading.value = true;

  try {
    if (isSubscribed.value) {
      await doUnsubscribe();
    } else {
      await doSubscribe();
    }
  } catch (err: any) {
    showStatus('操作失败: ' + err.message, 'error');
  }

  isLoading.value = false;
}

// 订阅流程
async function doSubscribe() {
  if (!swRegistration) return;

  const { publicKey } = await getVapidKey();
  const applicationServerKey = urlBase64ToUint8Array(publicKey);

  const subscription = await swRegistration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });

  const result = await subscribe(subscription);
  if (result.success) {
    isSubscribed.value = true;
    showStatus('✅ 订阅成功！您将收到推送通知', 'success');
  } else {
    showStatus('订阅失败', 'error');
  }
}

// 取消订阅
async function doUnsubscribe() {
  if (!swRegistration) return;

  const subscription = await swRegistration.pushManager.getSubscription();
  if (subscription) {
    await subscription.unsubscribe();
    await unsubscribe(subscription.endpoint);
  }
  isSubscribed.value = false;
  showStatus('已取消订阅', 'info');
}

// 显示状态消息
function showStatus(msg: string, type: 'success' | 'error' | 'info') {
  statusMsg.value = msg;
  statusType.value = type;
  setTimeout(() => (statusMsg.value = ''), 5000);
}

// VAPID 公钥转换
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
</script>

<template>
  <div class="page">
    <div class="card">
      <div class="icon">🐝</div>
      <h1>蜂群</h1>
      <p class="subtitle">如蜂群般高效协作，多渠道推送使命必达</p>

      <button
        class="btn"
        :class="isSubscribed ? 'btn-danger' : 'btn-primary'"
        :disabled="isLoading"
        @click="toggleSubscription"
      >
        <span>{{ isSubscribed ? '🔕' : '📡' }}</span>
        <span>{{ isSubscribed ? '关闭推送通知' : '开启推送通知' }}</span>
      </button>

      <div v-if="statusMsg" class="status" :class="statusType">
        {{ statusMsg }}
      </div>

      <div class="badge" :class="isSubscribed ? 'badge-active' : 'badge-inactive'">
        {{ isSubscribed ? '● 已订阅' : '○ 未订阅' }}
      </div>

      <p class="footer">
        <a @click="router.push('/admin')">管理后台</a>
      </p>
    </div>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.card {
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  padding: 40px;
  max-width: 480px;
  width: 100%;
  text-align: center;
}

.icon {
  width: 80px;
  height: 80px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24px;
  font-size: 36px;
}

h1 {
  font-size: 24px;
  color: #1a1a2e;
  margin-bottom: 8px;
}

.subtitle {
  color: #666;
  font-size: 14px;
  margin-bottom: 32px;
  line-height: 1.6;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 32px;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  width: 100%;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
}

.btn-danger {
  background: #ff4757;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #ff6b81;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.status {
  margin-top: 20px;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
}

.status.success {
  background: #d4edda;
  color: #155724;
}

.status.error {
  background: #f8d7da;
  color: #721c24;
}

.status.info {
  background: #d1ecf1;
  color: #0c5460;
}

.badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  margin-top: 16px;
}

.badge-active {
  background: #d4edda;
  color: #155724;
}

.badge-inactive {
  background: #f8d7da;
  color: #721c24;
}

.footer {
  margin-top: 24px;
  font-size: 12px;
  color: #999;
}

.footer a {
  color: #667eea;
  cursor: pointer;
}

.footer a:hover {
  text-decoration: underline;
}
</style>
