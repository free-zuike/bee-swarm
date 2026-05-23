<script setup lang="ts">
// ============================================
// 管理后台 - 多渠道推送管理
// ============================================
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { getStatus, setupPassword, getChannels, saveChannels, getSubscriptions, sendPush } from '@/api';
import type { ChannelConfig, ChannelDefinition, ChannelSettings, PushChannel, PushResult, PushSubscription } from '@/types';

const router = useRouter();

// 页面状态：setup / login / dashboard
const pageState = ref<'loading' | 'setup' | 'login' | 'dashboard'>('loading');

// 初始化设置
const setupPassword1 = ref('');
const setupPassword2 = ref('');
const isSettingUp = ref(false);
const setupError = ref('');

// 登录
const password = ref('');
const isLoggingIn = ref(false);
const loginError = ref('');

// 渠道状态
const channels = ref<ChannelConfig[]>([]);
const channelDefinitions = ref<ChannelDefinition[]>([]);
const channelSettings = ref<ChannelSettings>({});
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

// Tab 控制
const activeTab = ref<'push' | 'settings' | 'subs'>('push');

// 设置面板
const expandedChannels = ref<Set<string>>(new Set());
const isSaving = ref(false);
const saveMessage = ref('');
const saveMessageType = ref<'success' | 'error'>('success');

// 统计
const lastPushTime = ref('-');
const enabledChannelCount = computed(() => channels.value.filter((c) => c.enabled).length);

// 设置 Tab 中显示的渠道定义（排除 webpush）
const settingsDefinitions = computed(() =>
  channelDefinitions.value.filter((d) => d.id !== 'webpush')
);

// 判断渠道是否已配置（至少有一个必填字段有值）
function isChannelConfigured(def: ChannelDefinition): boolean {
  return def.fields.some((f) => {
    const key = `channel:${def.id}:${f.key}`;
    return channelSettings.value[key] && channelSettings.value[key].trim() !== '';
  });
}

// 获取渠道设置值
function getSettingValue(channelId: string, fieldKey: string): string {
  return channelSettings.value[`channel:${channelId}:${fieldKey}`] || '';
}

// 设置渠道值
function setSettingValue(channelId: string, fieldKey: string, value: string) {
  channelSettings.value[`channel:${channelId}:${fieldKey}`] = value;
}

// 切换渠道卡片展开/折叠
function toggleChannelExpand(channelId: string) {
  if (expandedChannels.value.has(channelId)) {
    expandedChannels.value.delete(channelId);
  } else {
    expandedChannels.value.add(channelId);
  }
}

// 初始化：检查系统状态
onMounted(async () => {
  try {
    const { initialized } = await getStatus();

    if (!initialized) {
      // 首次访问，需要设置密码
      pageState.value = 'setup';
      return;
    }

    // 已初始化，尝试自动登录
    const savedPassword = sessionStorage.getItem('push_hub_token');
    if (savedPassword) {
      password.value = savedPassword;
      try {
        await loadChannels();
        await loadSubs();
        pageState.value = 'dashboard';
        return;
      } catch {
        // 自动登录失败，清除旧密码
        sessionStorage.removeItem('push_hub_token');
      }
    }

    pageState.value = 'login';
  } catch {
    pageState.value = 'login';
  }
});

// 设置密码
async function doSetup() {
  if (setupPassword1.value.length < 4) {
    setupError.value = '密码长度至少 4 位';
    return;
  }
  if (setupPassword1.value !== setupPassword2.value) {
    setupError.value = '两次输入的密码不一致';
    return;
  }

  isSettingUp.value = true;
  setupError.value = '';

  try {
    await setupPassword(setupPassword1.value);
    // 设置成功，自动登录
    password.value = setupPassword1.value;
    sessionStorage.setItem('push_hub_token', password.value);
    await loadChannels();
    await loadSubs();
    pageState.value = 'dashboard';
  } catch (err: any) {
    setupError.value = err.message || '设置失败';
  }

  isSettingUp.value = false;
}

// 登录
async function login() {
  if (!password.value || isLoggingIn.value) return;
  isLoggingIn.value = true;
  loginError.value = '';

  try {
    await loadChannels();
    await loadSubs();
    sessionStorage.setItem('push_hub_token', password.value);
    pageState.value = 'dashboard';
  } catch (err: any) {
    loginError.value = err.message || '登录失败';
  }

  isLoggingIn.value = false;
}

// 退出登录
function logout() {
  sessionStorage.removeItem('push_hub_token');
  password.value = '';
  loginError.value = '';
  pageState.value = 'login';
}

// 加载渠道配置
async function loadChannels() {
  const data = await getChannels(password.value);
  channels.value = data.channels;
  channelSettings.value = data.settings;
  channelDefinitions.value = data.definitions;
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

// 保存渠道设置
async function doSaveSettings() {
  if (isSaving.value) return;
  isSaving.value = true;
  saveMessage.value = '';

  try {
    const result = await saveChannels(password.value, channelSettings.value);
    channels.value = result.channels;
    saveMessage.value = result.message || '保存成功';
    saveMessageType.value = 'success';
  } catch (err: any) {
    saveMessage.value = err.message || '保存失败';
    saveMessageType.value = 'error';
  }

  isSaving.value = false;
}

// 格式化 endpoint 显示
function formatEndpoint(ep: string): string {
  return ep.length > 80 ? ep.substring(0, 40) + '...' + ep.substring(ep.length - 30) : ep;
}
</script>

<template>
  <!-- 加载中 -->
  <div v-if="pageState === 'loading'" class="loading-overlay">
    <div class="loading-spinner"></div>
    <p>加载中...</p>
  </div>

  <!-- 首次设置密码 -->
  <div v-else-if="pageState === 'setup'" class="login-overlay">
    <div class="login-card">
      <h2>🐝 蜂群初始化</h2>
      <p>首次使用，请设置管理密码</p>
      <input
        v-model="setupPassword1"
        type="password"
        placeholder="设置密码（至少 4 位）"
        @keydown.enter="$refs.confirmInput?.focus()"
      />
      <input
        ref="confirmInput"
        v-model="setupPassword2"
        type="password"
        placeholder="确认密码"
        @keydown.enter="doSetup"
      />
      <div v-if="setupError" class="login-error">{{ setupError }}</div>
      <button class="btn btn-primary" :disabled="isSettingUp" @click="doSetup">
        {{ isSettingUp ? '设置中...' : '完成设置' }}
      </button>
    </div>
  </div>

  <!-- 登录 -->
  <div v-else-if="pageState === 'login'" class="login-overlay">
    <div class="login-card">
      <h2>🔐 管理后台</h2>
      <p>请输入管理密码</p>
      <input
        v-model="password"
        type="password"
        placeholder="输入密码..."
        @keydown.enter="login"
      />
      <div v-if="loginError" class="login-error">{{ loginError }}</div>
      <button class="btn btn-primary" :disabled="isLoggingIn" @click="login">
        {{ isLoggingIn ? '登录中...' : '登 录' }}
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
      <!-- Tab 导航 -->
      <div class="tab-nav">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'push' }"
          @click="activeTab = 'push'"
        >
          📤 推送
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'settings' }"
          @click="activeTab = 'settings'"
        >
          ⚙️ 设置
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'subs' }"
          @click="activeTab = 'subs'"
        >
          📋 订阅
        </button>
      </div>

      <!-- ==================== 推送 Tab ==================== -->
      <div v-if="activeTab === 'push'" class="tab-content">
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

      <!-- ==================== 设置 Tab ==================== -->
      <div v-if="activeTab === 'settings'" class="tab-content">
        <div class="panel">
          <h2>⚙️ 渠道设置</h2>
          <p class="hint" style="margin-bottom: 20px;">配置各推送渠道的连接参数，保存后渠道将自动启用。</p>

          <!-- 渠道卡片列表 -->
          <div class="channel-cards">
            <div
              v-for="def in settingsDefinitions"
              :key="def.id"
              class="channel-card"
            >
              <!-- 卡片头部（可点击折叠） -->
              <div
                class="channel-card-header"
                @click="toggleChannelExpand(def.id)"
              >
                <div class="channel-card-info">
                  <span class="channel-card-icon">{{ def.icon }}</span>
                  <span class="channel-card-name">{{ def.name }}</span>
                  <span
                    class="channel-status-tag"
                    :class="isChannelConfigured(def) ? 'configured' : 'unconfigured'"
                  >
                    {{ isChannelConfigured(def) ? '已配置' : '未配置' }}
                  </span>
                </div>
                <span class="expand-arrow" :class="{ expanded: expandedChannels.has(def.id) }">
                  ▾
                </span>
              </div>

              <!-- 卡片内容（配置表单） -->
              <div v-if="expandedChannels.has(def.id)" class="channel-card-body">
                <div
                  v-for="field in def.fields"
                  :key="field.key"
                  class="form-group"
                >
                  <label>
                    {{ field.label }}
                    <span v-if="field.required" class="required-mark">*</span>
                  </label>
                  <input
                    :type="field.type === 'password' ? 'password' : 'text'"
                    :value="getSettingValue(def.id, field.key)"
                    :placeholder="field.placeholder || `请输入${field.label}`"
                    @input="setSettingValue(def.id, field.key, ($event.target as HTMLInputElement).value)"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- 保存消息 -->
          <div
            v-if="saveMessage"
            class="save-message"
            :class="saveMessageType"
          >
            {{ saveMessage }}
          </div>

          <!-- 保存按钮 -->
          <div class="save-actions">
            <button class="btn btn-primary" :disabled="isSaving" @click="doSaveSettings">
              {{ isSaving ? '保存中...' : '💾 保存设置' }}
            </button>
          </div>
        </div>
      </div>

      <!-- ==================== 订阅 Tab ==================== -->
      <div v-if="activeTab === 'subs'" class="tab-content">
        <div class="panel">
          <h2>📋 Web Push 订阅列表</h2>
          <div class="sub-stats">
            <span class="sub-count">共 {{ subCount }} 个订阅</span>
            <button class="btn btn-secondary btn-sm" @click="loadSubs">刷新</button>
          </div>
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
      </div>
    </div>
  </div>
</template>

<style scoped>
.loading-overlay {
  position: fixed;
  inset: 0;
  background: #f0f2f5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #666;
}

.loading-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #e0e0e0;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

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
  margin-bottom: 12px;
  box-sizing: border-box;
}

.login-card input:focus {
  outline: none;
  border-color: #667eea;
}

.login-error {
  color: #e74c3c;
  font-size: 13px;
  margin-bottom: 12px;
  text-align: left;
  padding: 8px 12px;
  background: #fff5f5;
  border-radius: 6px;
  border: 1px solid #fecaca;
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

/* ==================== Tab 导航 ==================== */

.tab-nav {
  display: flex;
  gap: 4px;
  margin-bottom: 24px;
  background: white;
  border-radius: 12px;
  padding: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.tab-btn {
  flex: 1;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: transparent;
  color: #666;
  transition: all 0.2s;
}

.tab-btn:hover {
  background: #f5f5f5;
  color: #333;
}

.tab-btn.active {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.tab-content {
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ==================== 统计 ==================== */

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

/* ==================== 面板 ==================== */

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

/* ==================== 渠道选择网格 ==================== */

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

/* ==================== 表单 ==================== */

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
  box-sizing: border-box;
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

.required-mark {
  color: #e74c3c;
  margin-left: 2px;
}

.hint {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

/* ==================== 按钮 ==================== */

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

.btn-sm {
  padding: 6px 14px;
  font-size: 12px;
}

/* ==================== 推送结果 ==================== */

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

/* ==================== 渠道设置卡片 ==================== */

.channel-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.channel-card {
  background: #fafafa;
  border: 1px solid #eee;
  border-radius: 12px;
  overflow: hidden;
  transition: box-shadow 0.2s;
}

.channel-card:hover {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.channel-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.channel-card-header:hover {
  background: #f0f0f5;
}

.channel-card-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.channel-card-icon {
  font-size: 22px;
}

.channel-card-name {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a2e;
}

.channel-status-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 20px;
  letter-spacing: 0.5px;
}

.channel-status-tag.configured {
  background: #d4edda;
  color: #155724;
}

.channel-status-tag.unconfigured {
  background: #f0f0f0;
  color: #999;
}

.expand-arrow {
  font-size: 14px;
  color: #999;
  transition: transform 0.3s;
}

.expand-arrow.expanded {
  transform: rotate(180deg);
}

.channel-card-body {
  padding: 0 20px 20px;
  border-top: 1px solid #eee;
  margin-top: 0;
  padding-top: 16px;
}

/* ==================== 保存操作 ==================== */

.save-actions {
  display: flex;
  justify-content: flex-end;
}

.save-message {
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 16px;
}

.save-message.success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.save-message.error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

/* ==================== 订阅列表 ==================== */

.sub-stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.sub-count {
  font-size: 13px;
  color: #999;
}

.sub-list {
  max-height: 500px;
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

/* ==================== API 文档 ==================== */

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
