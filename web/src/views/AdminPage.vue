<script setup lang="ts">
// ============================================
// 管理后台 - 多渠道推送管理
// ============================================
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { getChannels, getSubscriptions, sendPush } from '@/api';
import type { ChannelConfig, PushChannel, PushResult, PushSubscription } from '@/types';

const router = useRouter();

// 认证状态
const password = ref('');
const isLoggedIn = ref(false);
const isLoggingIn = ref(false);

// 渠道状态
const channels = ref<ChannelConfig[]>([]);
const selectedChannels = ref<Set<PushChannel>>(new Set());

// 订阅状态
const subCount = ref(0);
const subscriptions = ref<PushSubscription[]>([]);

// 推送表单
const pushTitle = ref('');
const pushBody = ref('');
const pushUrl = ref('');
const isPushing = ref(false);
const pushResults = ref<PushResult[]>([]);

// 统计
const lastPushTime = ref('-');
const enabledChannelCount = computed(() => channels.value.filter((c) => c.enabled).length);

// 初始化：检查登录状态
onMounted(() => {
  const savedPassword = sessionStorage.getItem('push_hub_token');
  if (savedPassword) {
    password.value = savedPassword;
    login();
  }
});

// 登录
async function login() {
  if (!password.value || isLoggingIn.value) return;
  isLoggingIn.value = true;

  try {
    await loadChannels();
    await loadSubs();
    sessionStorage.setItem('push_hub_token', password.value);
    isLoggedIn.value = true;
  } catch (err: any) {
    console.error('Login failed:', err);
    isLoggedIn.value = false;
    alert('登录失败: ' + (err.message || '请检查密码是否正确'));
  }

  isLoggingIn.value = false;
}

// 退出登录
function logout() {
  sessionStorage.removeItem('push_hub_token');
  password.value = '';
  isLoggedIn.value = false;
}

// 加载渠道配置
async function loadChannels() {
  const data = await getChannels(password.value);
  channels.value = data.channels;
}

// 加载订阅列表
async function loadSubs() {
  const data = await getSubscriptions(password.value);
  subCount.value = data.total;
  subscriptions.value = data.subscriptions;
}

// 切换渠道选择
function toggleChannel(ch: ChannelConfig) {
  if (!ch.enabled) return;
  if (selectedChannels.value.has(ch.id)) {
    selectedChannels.value.delete(ch.id);
  } else {
    selectedChannels.value.add(ch.id);
  }
}

// 发送推送
async function doPush() {
  if (!pushTitle.value.trim()) {
    alert('请输入标题');
    return;
  }
  if (isPushing.value) return;
  isPushing.value = true;

  try {
    const payload: any = {
      title: pushTitle.value.trim(),
      body: pushBody.value.trim(),
      url: pushUrl.value.trim(),
    };
    if (selectedChannels.value.size > 0) {
      payload.channels = Array.from(selectedChannels.value);
    }

    const result = await sendPush(password.value, payload);
    pushResults.value = result.results;
    lastPushTime.value = new Date().toLocaleTimeString('zh-CN');

    if (result.success) {
      pushTitle.value = '';
      pushBody.value = '';
      pushUrl.value = '';
    }
  } catch (err: any) {
    pushResults.value = [{ channel: 'webpush', success: false, message: err.message }];
  }

  isPushing.value = false;
}

// 格式化 endpoint 显示
function formatEndpoint(ep: string): string {
  return ep.length > 80 ? ep.substring(0, 40) + '...' + ep.substring(ep.length - 30) : ep;
}
</script>

<template>
  <!-- 登录遮罩 -->
  <div v-if="!isLoggedIn" class="login-overlay">
    <div class="login-card">
      <h2>🔐 管理后台</h2>
      <p>请输入管理密码</p>
      <input
        v-model="password"
        type="password"
        placeholder="输入密码..."
        @keydown.enter="login"
      />
      <button class="btn btn-primary" :disabled="isLoggingIn" @click="login">
        登 录
      </button>
    </div>
  </div>

  <!-- 主界面 -->
  <div v-else class="page">
    <header class="header">
      <h1>🐝 蜂群管理后台</h1>
      <span class="logout" @click="logout">退出登录</span>
    </header>

    <div class="container">
      <!-- 统计概览 -->
      <div class="stats">
        <div class="stat-card">
          <div class="label">Web Push 订阅</div>
          <div class="value">{{ subCount }}</div>
        </div>
        <div class="stat-card">
          <div class="label">已启用渠道</div>
          <div class="value">{{ enabledChannelCount }}</div>
        </div>
        <div class="stat-card">
          <div class="label">最近推送</div>
          <div class="value">{{ lastPushTime }}</div>
        </div>
      </div>

      <!-- 发送推送 -->
      <div class="panel">
        <h2>📤 发送推送通知</h2>

        <!-- 渠道选择 -->
        <div class="form-group">
          <label>选择推送渠道</label>
          <div class="channel-grid">
            <div
              v-for="ch in channels"
              :key="ch.id"
              class="channel-tag"
              :class="{
                active: selectedChannels.has(ch.id),
                disabled: !ch.enabled,
              }"
              @click="toggleChannel(ch)"
            >
              <span class="ch-icon">{{ ch.icon }}</span>
              <span class="ch-name">{{ ch.name }}</span>
            </div>
          </div>
          <p class="hint">绿色为已启用渠道，点击选择/取消。不选择则推送到所有已启用渠道。</p>
        </div>

        <!-- 消息内容 -->
        <div class="form-group">
          <label>标题 *</label>
          <input v-model="pushTitle" type="text" placeholder="通知标题" />
        </div>
        <div class="form-group">
          <label>内容</label>
          <textarea v-model="pushBody" placeholder="通知内容..."></textarea>
        </div>
        <div class="form-group">
          <label>跳转 URL（可选）</label>
          <input v-model="pushUrl" type="url" placeholder="https://example.com" />
        </div>

        <button class="btn btn-primary" :disabled="isPushing" @click="doPush">
          🚀 发送推送
        </button>
        <button class="btn btn-secondary" @click="loadChannels">刷新渠道</button>
        <button class="btn btn-secondary" @click="loadSubs">刷新订阅</button>

        <!-- 推送结果 -->
        <div v-if="pushResults.length" class="result-list">
          <div
            v-for="r in pushResults"
            :key="r.channel"
            class="result-item"
            :class="r.success ? 'success' : 'error'"
          >
            <span class="ch-label">
              {{ channels.find((c) => c.id === r.channel)?.icon || '❓' }}
              {{ channels.find((c) => c.id === r.channel)?.name || r.channel }}
            </span>
            <span>{{ r.message }}</span>
          </div>
        </div>
      </div>

      <!-- 订阅列表 -->
      <div class="panel">
        <h2>📋 Web Push 订阅列表</h2>
        <div class="sub-list">
          <div v-if="subscriptions.length === 0" class="empty">暂无订阅用户</div>
          <div
            v-for="sub in subscriptions"
            :key="sub.endpoint"
            class="sub-item"
            :title="sub.endpoint"
          >
            {{ formatEndpoint(sub.endpoint) }}
          </div>
        </div>
      </div>

      <!-- API 文档 -->
      <div class="panel">
        <h2>🔌 API 接口文档</h2>
        <div class="api-doc">
          <div class="comment">// 发送推送（支持指定渠道）</div>
          <div><span class="method">POST</span> <span class="url">/api/admin/push?password=密码</span></div>
          <div>{ "title": "标题", "body": "内容", "channels": ["wework"] }</div>
          <br />
          <div class="comment">// 可用渠道: webpush, wework, dingtalk, feishu, telegram, bark, ntfy, email</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.login-card {
  background: white;
  border-radius: 16px;
  padding: 40px;
  width: 360px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.login-card h2 {
  margin-bottom: 8px;
  color: #1a1a2e;
}

.login-card p {
  color: #666;
  font-size: 14px;
  margin-bottom: 24px;
}

.login-card input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 16px;
  margin-bottom: 16px;
}

.login-card input:focus {
  outline: none;
  border-color: #667eea;
}

.page {
  min-height: 100vh;
  background: #f0f2f5;
}

.header {
  background: white;
  padding: 16px 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header h1 {
  font-size: 20px;
  color: #1a1a2e;
}

.logout {
  color: #667eea;
  cursor: pointer;
  font-size: 14px;
}

.logout:hover {
  text-decoration: underline;
}

.container {
  max-width: 960px;
  margin: 24px auto;
  padding: 0 24px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}

.stat-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  text-align: center;
}

.stat-card .label {
  font-size: 12px;
  color: #999;
  margin-bottom: 4px;
}

.stat-card .value {
  font-size: 24px;
  font-weight: 700;
  color: #1a1a2e;
}

.panel {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  margin-bottom: 24px;
}

.panel h2 {
  font-size: 18px;
  color: #1a1a2e;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.channel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
  margin-bottom: 20px;
}

.channel-tag {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  border: 2px solid #e0e0e0;
  background: white;
  transition: all 0.2s;
  text-align: center;
  user-select: none;
}

.channel-tag.active {
  border-color: #667eea;
  background: #f0f0ff;
}

.channel-tag.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.channel-tag .ch-icon {
  font-size: 18px;
  display: block;
  margin-bottom: 2px;
}

.channel-tag .ch-name {
  font-size: 12px;
  color: #666;
}

.channel-tag.active .ch-name {
  color: #667eea;
  font-weight: 600;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 6px;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 10px 14px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.3s;
  font-family: inherit;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #667eea;
}

.form-group textarea {
  resize: vertical;
  min-height: 80px;
}

.hint {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: #f0f0f0;
  color: #333;
  margin-left: 8px;
}

.btn-secondary:hover {
  background: #e0e0e0;
}

.result-list {
  margin-top: 16px;
}

.result-item {
  padding: 10px 14px;
  border-radius: 8px;
  margin-bottom: 6px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.result-item.success {
  background: #d4edda;
  color: #155724;
}

.result-item.error {
  background: #f8d7da;
  color: #721c24;
}

.result-item .ch-label {
  font-weight: 600;
  min-width: 100px;
}

.sub-list {
  max-height: 300px;
  overflow-y: auto;
}

.sub-item {
  padding: 10px 14px;
  border-bottom: 1px solid #f0f0f0;
  font-size: 12px;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub-item:last-child {
  border-bottom: none;
}

.empty {
  text-align: center;
  padding: 32px;
  color: #999;
  font-size: 14px;
}

.api-doc {
  background: #1a1a2e;
  color: #e0e0e0;
  border-radius: 12px;
  padding: 20px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.8;
  overflow-x: auto;
}

.api-doc .comment {
  color: #6a9955;
}

.api-doc .method {
  color: #569cd6;
}

.api-doc .url {
  color: #ce9178;
}
</style>
