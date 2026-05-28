<script setup lang="ts">
// ============================================
// 管理后台 - 多渠道推送管理（邮箱+密码认证）
// ============================================
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { themeState, useThemeStore } from '@/stores/theme';
import { setLocale, t, currentLocale } from '@/i18n';
import { register, login, getToken, refreshToken, getChannelsWithToken, saveChannelWithToken, sendPushWithToken, getHistoryWithToken, getApiKeyWithToken, getBackupEndpoints, addBackupEndpoint, updateBackupEndpoint, deleteBackupEndpoint, testBackupEndpoint, listBackupsFromEndpoint, restoreBackupFromEndpoint, deleteBackupFromEndpoint, backupAll, backupSingleEndpoint } from '@/api';
import type { BackupEndpoint } from '@/api';
import type { ChannelConfig, ChannelDefinition, ChannelSettings, PushChannel, PushResult } from '@/types';

// 导入子组件
import AuthForm from '@/components/admin/AuthForm.vue';
import PushForm from '@/components/admin/PushForm.vue';
import ChannelSettingsPanel from '@/components/admin/ChannelSettings.vue';
import PushHistory from '@/components/admin/PushHistory.vue';
import BackupManager from '@/components/admin/BackupManager.vue';

const router = useRouter();
const themeStore = useThemeStore();

const isDark = computed(() => themeState.isDark);

function goToApiDocs() {
  router.push('/docs');
}

function toggleLocale() {
  const newLocale: 'zh' | 'en' = currentLocale.value === 'zh' ? 'en' : 'zh';
  setLocale(newLocale);
}

// ==================== 页面状态 ====================
const pageState = ref<'loading' | 'auth' | 'dashboard'>('loading');

// ==================== 认证相关 ====================
const isAuthing = ref(false);
const authError = ref('');

// 登录后的凭证
const email = ref('');
const password = ref('');

// Token 相关
const accessToken = ref('');
const refreshTokenValue = ref('');
const tokenExpiresAt = ref(0);

// ==================== Dashboard Tab ====================
const activeTab = ref<'push' | 'history'>('push');

// ==================== 设置面板 ====================
const showSettings = ref(false);

// ==================== 渠道状态 ====================
const channels = ref<ChannelConfig[]>([]);
const channelDefinitions = ref<ChannelDefinition[]>([]);
const channelSettings = ref<ChannelSettings>({});
const selectedChannels = ref<Set<PushChannel>>(new Set());

// ==================== 推送表单 ====================
const isPushing = ref(false);
const pushResults = ref<PushResult[]>([]);
const lastPushTime = ref('-');

// ==================== 历史记录 ====================
const pushHistory = ref<any[]>([]);
const isLoadingHistory = ref(false);

// ==================== API Key ====================
const apiKey = ref('');

// ==================== 子组件引用 ====================
const channelSettingsRef = ref<InstanceType<typeof ChannelSettingsPanel> | null>(null);
const backupManagerRef = ref<InstanceType<typeof BackupManager> | null>(null);

// ==================== API Key 加载 ====================
async function loadApiKey(refresh = false) {
  try {
    const data = await getApiKeyWithToken(accessToken.value, refresh);
    if (data.apikey) {
      apiKey.value = data.apikey;
    }
  } catch (e) {
    console.error('Failed to load API key:', e);
  }
}

// ==================== 历史记录加载 ====================
async function loadHistory() {
  isLoadingHistory.value = true;
  try {
    const data = await getHistoryWithToken(accessToken.value);
    pushHistory.value = data.history || [];
    // 如果有历史记录，设置 lastPushTime 为最近一条的时间
    if (pushHistory.value.length > 0) {
      lastPushTime.value = new Date(pushHistory.value[0].time).toLocaleString('zh-CN');
    }
  } catch (err: any) {
    console.error('加载历史记录失败:', err);
  }
  isLoadingHistory.value = false;
}

// ==================== 统计 ====================
const enabledChannelCount = computed(() => channels.value.filter((c) => c.enabled).length);

// ==================== 初始化 ====================
onMounted(async () => {
  try {
    // 尝试从 sessionStorage 恢复凭证（不再保存密码）
    const savedEmail = sessionStorage.getItem('push_hub_email');
    const savedToken = sessionStorage.getItem('push_hub_token');
    const savedRefreshToken = sessionStorage.getItem('push_hub_refresh_token');
    const savedExpiresAt = sessionStorage.getItem('push_hub_expires_at');

    if (savedEmail && savedToken && savedRefreshToken && savedExpiresAt) {
      email.value = savedEmail;
      accessToken.value = savedToken;
      refreshTokenValue.value = savedRefreshToken;
      tokenExpiresAt.value = parseInt(savedExpiresAt, 10);

      // 检查 token 是否过期
      if (tokenExpiresAt.value > Date.now()) {
        try {
          await loadChannels();
          await loadHistory();
          pageState.value = 'dashboard';
          return;
        } catch {
          // token 可能过期，尝试刷新
        }
      }

      // 尝试刷新 token
      try {
        const tokenData = await refreshToken(refreshTokenValue.value);
        accessToken.value = tokenData.token;
        refreshTokenValue.value = tokenData.refreshToken;
        tokenExpiresAt.value = tokenData.expiresAt;
        sessionStorage.setItem('push_hub_token', tokenData.token);
        sessionStorage.setItem('push_hub_refresh_token', tokenData.refreshToken);
        sessionStorage.setItem('push_hub_expires_at', tokenData.expiresAt.toString());
        await loadChannels();
        await loadHistory();
        pageState.value = 'dashboard';
        return;
      } catch {
        // 刷新失败，清除凭证
        sessionStorage.removeItem('push_hub_email');
        sessionStorage.removeItem('push_hub_token');
        sessionStorage.removeItem('push_hub_refresh_token');
        sessionStorage.removeItem('push_hub_expires_at');
      }
    }
    pageState.value = 'auth';
  } catch {
    pageState.value = 'auth';
  }
});

// ==================== Tab 切换软刷新 ====================
watch(activeTab, (newTab) => {
  // 只在数据为空时加载，避免重复请求
  if (newTab === 'push' && channels.value.length === 0) {
    loadChannels();
  }
  if (newTab === 'history' && pushHistory.value.length === 0) {
    loadHistory();
  }
});

// ==================== 认证函数 ====================
async function doLogin(authEmail: string, authPassword: string) {
  isAuthing.value = true;
  authError.value = '';

  try {
    // 登录验证
    const res = await login(authEmail, authPassword);
    email.value = res.email || authEmail;
    password.value = authPassword; // 仅在内存中保存密码用于登录流程

    // 获取 Token
    const tokenData = await getToken(authEmail, authPassword);
    accessToken.value = tokenData.token;
    refreshTokenValue.value = tokenData.refreshToken;
    tokenExpiresAt.value = tokenData.expiresAt;

    // 保存凭证到 sessionStorage（不保存密码）
    sessionStorage.setItem('push_hub_email', email.value);
    sessionStorage.setItem('push_hub_token', tokenData.token);
    sessionStorage.setItem('push_hub_refresh_token', tokenData.refreshToken);
    sessionStorage.setItem('push_hub_expires_at', tokenData.expiresAt.toString());

    await loadChannels();
    await loadHistory();
    pageState.value = 'dashboard';
  } catch (err: any) {
    authError.value = err.message || '登录失败';
  }

  isAuthing.value = false;
}

async function doRegister(authEmail: string, authPassword: string) {
  isAuthing.value = true;
  authError.value = '';

  try {
    await register(authEmail, authPassword);
    // 注册成功，自动登录
    await doLogin(authEmail, authPassword);
  } catch (err: any) {
    authError.value = err.message || '注册失败';
    isAuthing.value = false;
  }
}

function logout() {
  sessionStorage.removeItem('push_hub_email');
  sessionStorage.removeItem('push_hub_token');
  sessionStorage.removeItem('push_hub_refresh_token');
  sessionStorage.removeItem('push_hub_expires_at');
  email.value = '';
  password.value = '';
  accessToken.value = '';
  refreshTokenValue.value = '';
  tokenExpiresAt.value = 0;
  authError.value = '';
  pageState.value = 'auth';
}

// ==================== 数据加载 ====================
async function loadChannels() {
  const data = await getChannelsWithToken(accessToken.value);
  channels.value = data.channels;
  channelSettings.value = data.settings;
  channelDefinitions.value = data.definitions;
  restoreChannelSelection();
  await loadApiKey();
}

// ==================== 渠道选择 ====================
function restoreChannelSelection() {
  const saved = sessionStorage.getItem('push_selected_channels');
  if (saved) {
    try {
      const selectedIds: string[] = JSON.parse(saved);
      selectedChannels.value = new Set(selectedIds as PushChannel[]);
    } catch {
      selectedChannels.value = new Set();
    }
  }
}

// ==================== 渠道设置 ====================
async function handleSaveChannel(channelId: string, fields: Record<string, string>) {
  try {
    const result = await saveChannelWithToken(accessToken.value, channelId, fields);
    channels.value = result.channels;
    // 重新加载设置以确保同步
    const data = await getChannelsWithToken(accessToken.value);
    channelSettings.value = data.settings;
    channelDefinitions.value = data.definitions;
    channelSettingsRef.value?.handleSaveSuccess(channelId, result.message || '保存成功');
  } catch (err: any) {
    channelSettingsRef.value?.handleSaveError(channelId, err.message || '保存失败');
  }
}

async function handleTestChannel(channelId: string, fields: Record<string, string>) {
  try {
    const result = await sendPushWithToken(accessToken.value, {
      title: '测试消息',
      body: '这是一条来自蜂群的测试消息',
      channels: [channelId as any],
    });

    const channelResult = result.results?.find((r) => r.channel === channelId);
    channelSettingsRef.value?.handleTestResult(
      channelId,
      channelResult?.success || false,
      channelResult?.message || result.message || '测试完成'
    );
  } catch (err: any) {
    channelSettingsRef.value?.handleTestResult(channelId, false, err.message || '测试失败');
  }
}

async function handleToggleChannelEnabled(channelId: string) {
  const key = `channel:${channelId}:enabled`;
  const current = channelSettings.value[key];
  const currentStr = String(current);
  const newValue = currentStr === 'false' ? 'true' : 'false';

  try {
    await saveChannelWithToken(accessToken.value, channelId, { enabled: newValue });
    // 重新加载 channels 和 settings 以确保数据同步
    const data = await getChannelsWithToken(accessToken.value);
    channels.value = data.channels;
    channelSettings.value = data.settings;
    channelDefinitions.value = data.definitions;
  } catch (err) {
    console.error('保存渠道启用状态失败:', err);
  } finally {
    channelSettingsRef.value?.handleToggleComplete();
  }
}

// ==================== 推送相关 ====================
async function handlePush(title: string, body: string, url: string, pushChannels: PushChannel[]) {
  if (isPushing.value) return;
  isPushing.value = true;

  try {
    const payload: any = { title, body, url };
    if (pushChannels.length > 0) {
      payload.channels = pushChannels;
    }

    const result = await sendPushWithToken(accessToken.value, payload);
    pushResults.value = result.results;
    lastPushTime.value = new Date().toLocaleTimeString('zh-CN');

    // 刷新历史记录
    await loadHistory();
  } catch (err: any) {
    pushResults.value = [{ channel: 'webpush', success: false, message: err.message }];
  }

  isPushing.value = false;
}

// ==================== 备份端管理 ====================
async function handleLoadEndpoints() {
  try {
    const data = await getBackupEndpoints(accessToken.value);
    backupManagerRef.value?.setEndpoints(data.endpoints || []);
  } catch (err: any) {
    console.error('加载备份端列表失败:', err);
    backupManagerRef.value?.handleError(err.message || '加载备份端列表失败', 'save');
  }
}

async function handleAddEndpoint(endpoint: Omit<BackupEndpoint, 'id'>) {
  try {
    const result = await addBackupEndpoint(accessToken.value, endpoint);
    if (result.success) {
      // 创建成功后重新从 API 加载列表，验证数据是否真的保存了
      await handleLoadEndpoints();
      // 选中新创建的备份端
      backupManagerRef.value?.selectEndpoint(result.endpoint.id);
      // 加载备份列表
      const data = await listBackupsFromEndpoint(accessToken.value, result.endpoint.id);
      backupManagerRef.value?.setBackups(data.backups || []);
      backupManagerRef.value?.handleTestResult(true, '备份端创建成功');
    }
  } catch (err: any) {
    backupManagerRef.value?.handleError(err.message || '创建失败', 'save');
  }
}

async function handleUpdateEndpoint(id: string, endpoint: Omit<BackupEndpoint, 'id'>) {
  try {
    const result = await updateBackupEndpoint(accessToken.value, id, endpoint);
    if (result.success) {
      backupManagerRef.value?.handleUpdateResult(result.endpoint, '备份端更新成功');
    }
  } catch (err: any) {
    backupManagerRef.value?.handleError(err.message || '更新失败', 'save');
  }
}

async function handleDeleteEndpoint(id: string) {
  try {
    await deleteBackupEndpoint(accessToken.value, id);
    backupManagerRef.value?.handleDeleteResult('备份端已删除');
  } catch (err: any) {
    backupManagerRef.value?.handleError(err.message || '删除失败', 'delete');
  }
}

async function handleTestEndpoint(id: string | null, endpoint: Partial<BackupEndpoint>) {
  try {
    const result = await testBackupEndpoint(accessToken.value, id || 'new', endpoint);
    backupManagerRef.value?.handleTestResult(result.success, result.message);
  } catch (err: any) {
    backupManagerRef.value?.handleError(err.message || '测试失败', 'test');
  }
}

async function handleListBackups(id: string) {
  try {
    const data = await listBackupsFromEndpoint(accessToken.value, id);
    backupManagerRef.value?.setBackups(data.backups || []);
  } catch (err: any) {
    console.error('加载备份列表失败:', err);
    backupManagerRef.value?.setBackups([]);
  }
}

async function handleRestoreBackup(id: string, key: string) {
  try {
    const result = await restoreBackupFromEndpoint(accessToken.value, id, key);
    backupManagerRef.value?.handleTestResult(result.success, result.message);
    if (result.success) {
      await loadChannels();
      await loadHistory();
      await handleLoadEndpoints(); // 重新加载备份端列表
    }
  } catch (err: any) {
    backupManagerRef.value?.handleError(err.message || '恢复失败', 'save');
  }
}

async function handleDeleteBackup(id: string, key: string) {
  try {
    await deleteBackupFromEndpoint(accessToken.value, id, key);
    // 刷新备份列表
    const data = await listBackupsFromEndpoint(accessToken.value, id);
    backupManagerRef.value?.setBackups(data.backups || []);
    backupManagerRef.value?.handleTestResult(true, '备份已删除');
  } catch (err: any) {
    backupManagerRef.value?.handleError(err.message || '删除失败', 'delete');
  }
}

async function handleBackupAll() {
  try {
    const result = await backupAll(accessToken.value);
    const successCount = result.results.filter(r => r.success).length;
    const totalCount = result.results.length;
    
    if (successCount === totalCount) {
      backupManagerRef.value?.handleBackupAllResult(`备份完成: 全部 ${totalCount} 个端点成功`, 'success');
    } else {
      const failed = result.results.filter(r => !r.success);
      const details = failed.map(r => `${r.endpointName || '未知'}: ${r.message}`).join('; ');
      backupManagerRef.value?.handleBackupAllResult(`备份完成: ${successCount}/${totalCount} 成功 — ${details}`, 'error');
    }
    
    // 刷新备份列表和备份端状态
    await handleLoadEndpoints();
  } catch (err: any) {
    backupManagerRef.value?.handleError(err.message || '备份失败', 'backup');
  }
}

async function handleBackupSingle(id: string) {
  try {
    const result = await backupSingleEndpoint(accessToken.value, id);
    backupManagerRef.value?.handleBackupSingleResult(
      result.success ? `${result.endpointName || '备份端'} 备份成功` : `${result.endpointName || '备份端'} 备份失败: ${result.message}`,
      result.success ? 'success' : 'error'
    );
    // 刷新备份列表和备份端状态
    await handleLoadEndpoints();
    const data = await listBackupsFromEndpoint(accessToken.value, id);
    backupManagerRef.value?.setBackups(data.backups || []);
  } catch (err: any) {
    backupManagerRef.value?.handleError(err.message || '备份失败', 'backup');
  }
}

// ==================== 备份设置变化时自动加载 ====================
watch(showSettings, (val, oldVal) => {
  // 只在打开设置面板时加载，关闭时不加载
  if (val && oldVal === false) {
    backupManagerRef.value?.onShow();
  }
});
</script>

<template>
  <!-- 加载中 -->
  <div v-if="pageState === 'loading'" class="loading-overlay" :class="{ dark: isDark }">
    <div class="loading-spinner"></div>
    <p>{{ t('label.loading') }}</p>
  </div>

  <!-- 登录/注册 -->
  <AuthForm
    v-else-if="pageState === 'auth'"
    :is-authing="isAuthing"
    :auth-error="authError"
    @login="doLogin"
    @register="doRegister"
  />

  <!-- 主界面 -->
  <div v-else class="page" :class="{ dark: isDark }">
    <header class="header" :class="{ dark: isDark }">
      <div class="header-left">
        <h1>{{ t('app.title') }}</h1>
        <span class="header-email">{{ email }}</span>
      </div>
      <div class="header-right">
        <button class="btn btn-sm btn-icon-btn" :class="{ dark: isDark }" @click="themeStore.toggleTheme">
          {{ isDark ? '☀️' : '🌙' }}
        </button>
        <button class="btn btn-sm btn-secondary" :class="{ dark: isDark }" @click="toggleLocale">
          {{ currentLocale.value === 'zh' ? 'English' : '中文' }}
        </button>
        <button class="btn btn-sm btn-secondary" :class="{ dark: isDark }" @click="goToApiDocs">{{ t('button.api_docs') }}</button>
        <button class="btn btn-sm btn-secondary" :class="{ dark: isDark }" @click="showSettings = !showSettings">
          {{ showSettings ? t('button.hide_settings') : t('button.settings') }}
        </button>
        <span class="logout" @click="logout">{{ t('button.logout') }}</span>
      </div>
    </header>

    <div class="container">
      <!-- 设置面板 -->
      <div v-if="showSettings" class="tab-content">
        <!-- API Key 面板 -->
        <div class="panel" :class="{ dark: isDark }">
          <div class="api-key-panel" :class="{ dark: isDark }">
            <h3>{{ t('label.api_key') }}</h3>
            <p class="hint">{{ t('hint.api_key') }}</p>
            <div v-if="apiKey" class="api-key-display">
              <code :class="{ dark: isDark }">{{ apiKey }}</code>
              <button class="btn btn-sm btn-warning" @click="loadApiKey(true)">{{ t('button.refresh') }}</button>
            </div>
            <div v-else>
              <button class="btn btn-secondary" :class="{ dark: isDark }" @click="loadApiKey()">{{ t('button.generate_api_key') }}</button>
            </div>
          </div>
        </div>

        <!-- 数据备份面板（多备份端） -->
        <div class="panel" :class="{ dark: isDark }">
          <BackupManager
            ref="backupManagerRef"
            :access-token="accessToken"
            @load-endpoints="handleLoadEndpoints"
            @add-endpoint="handleAddEndpoint"
            @update-endpoint="handleUpdateEndpoint"
            @delete-endpoint="handleDeleteEndpoint"
            @test-endpoint="handleTestEndpoint"
            @list-backups="handleListBackups"
            @restore-backup="handleRestoreBackup"
            @delete-backup="handleDeleteBackup"
            @backup-all="handleBackupAll"
            @backup-single="handleBackupSingle"
          />
        </div>

        <!-- 渠道设置 -->
        <ChannelSettingsPanel
          ref="channelSettingsRef"
          :channels="channels"
          :channel-definitions="channelDefinitions"
          :channel-settings="channelSettings"
          :access-token="accessToken"
          @save="handleSaveChannel"
          @test="handleTestChannel"
          @toggle-enabled="handleToggleChannelEnabled"
        />
      </div>

      <!-- 推送/历史 Tab（当设置面板关闭时显示） -->
      <template v-else>
        <!-- Tab 导航 -->
        <div class="tab-nav" :class="{ dark: isDark }">
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'push', dark: isDark }"
            @click="activeTab = 'push'"
          >
            📤 {{ t('tab.push') }}
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'history', dark: isDark }"
            @click="activeTab = 'history'"
          >
            {{ t('tab.history') }}
          </button>
        </div>

        <!-- ==================== 推送 Tab ==================== -->
        <PushForm
          v-if="activeTab === 'push'"
          :channels="channels"
          v-model:selected-channels="selectedChannels"
          :is-pushing="isPushing"
          :push-results="pushResults"
          :last-push-time="lastPushTime"
          @push="handlePush"
          @refresh="loadChannels"
        />

        <!-- ==================== 历史记录 Tab ==================== -->
        <PushHistory
          v-if="activeTab === 'history'"
          :history="pushHistory"
          :loading="isLoadingHistory"
          :channels="channels"
        />
      </template>

    </div>
  </div>
</template>

<style scoped>
/* ==================== 加载中 ==================== */

.loading-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg-primary, #f0f2f5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-secondary, #666);
  transition: background 0.3s, color 0.3s;
}

.loading-overlay.dark {
  background: var(--bg-primary, #1e1e1e);
  color: var(--text-secondary, #999);
}

.loading-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--border-color, #e0e0e0);
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ==================== 主页面 ==================== */

html, body {
  overflow-y: scroll;
  overflow-x: hidden;
}

html::-webkit-scrollbar,
body::-webkit-scrollbar {
  width: 8px;
}

html::-webkit-scrollbar-track,
body::-webkit-scrollbar-track {
  background: transparent;
}

html::-webkit-scrollbar-thumb,
body::-webkit-scrollbar-thumb {
  background: var(--border-color, #ccc);
  border-radius: 4px;
}

html::-webkit-scrollbar-thumb:hover,
body::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary, #999);
}

.page {
  min-height: 100vh;
  background: var(--bg-primary, #f0f2f5);
  transition: background 0.3s;
}

.page.dark {
  background: var(--bg-primary, #1e1e1e);
}

.header {
  background: var(--bg-panel, white);
  padding: 0 24px;
  height: 64px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: background 0.3s;
}

.header.dark {
  background: var(--bg-panel, #2d2d2d);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  min-width: 220px;
}

.header-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  gap: 8px;
  min-width: 480px;
}

.header-right .btn {
  flex-shrink: 0;
  box-sizing: border-box;
}

.header-right .btn-icon-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-size: 18px;
  flex-shrink: 0;
}

.header-right .btn-secondary {
  width: 110px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  white-space: nowrap;
  flex-shrink: 0;
  box-sizing: border-box;
  padding: 6px 12px;
}

.header-right .logout {
  flex-shrink: 0;
  width: 60px;
  height: 36px;
  line-height: 36px;
  text-align: center;
  white-space: nowrap;
  font-size: 14px;
}

.header h1 {
  font-size: 20px;
  color: var(--text-primary, #1a1a2e);
  transition: color 0.3s;
  white-space: nowrap;
  flex-shrink: 0;
  width: 130px;
  height: 40px;
  line-height: 40px;
}

.header.dark h1 {
  color: var(--text-primary, #e0e0e0);
}

.header-email {
  font-size: 13px;
  color: var(--text-secondary, #999);
  background: var(--bg-secondary, #f5f5f5);
  padding: 4px 12px;
  border-radius: 20px;
  transition: color 0.3s, background 0.3s;
}

.header.dark .header-email {
  color: var(--text-secondary, #999);
  background: var(--bg-secondary, #3c3c3c);
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
  background: var(--bg-panel, white);
  border-radius: 12px;
  padding: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: background 0.3s;
}

.tab-nav.dark {
  background: var(--bg-panel, #2d2d2d);
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
  color: var(--text-secondary, #666);
  transition: all 0.2s;
}

.tab-btn.dark {
  color: var(--text-secondary, #999);
}

.tab-btn:hover {
  background: var(--bg-secondary, #f5f5f5);
  color: var(--text-primary, #333);
}

.tab-btn.dark:hover {
  background: var(--bg-secondary, #3c3c3c);
  color: var(--text-primary, #e0e0e0);
}

.tab-btn.active {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.tab-btn.active.dark {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}

.tab-content {
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ==================== 面板 ==================== */

.panel {
  background: var(--bg-panel, white);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  margin-bottom: 24px;
  transition: background 0.3s;
}

.panel.dark {
  background: var(--bg-panel, #2d2d2d);
}

.panel h2 {
  font-size: 18px;
  color: var(--text-primary, #1a1a2e);
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
  transition: color 0.3s, border-bottom-color 0.3s;
}

.panel.dark h2 {
  color: var(--text-primary, #e0e0e0);
  border-bottom-color: var(--border-color, #3c3c3c);
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

.btn-sm {
  padding: 8px 18px;
  font-size: 13px;
}

.btn-icon-btn {
  padding: 8px 12px;
  background: transparent;
  border: none;
  font-size: 20px;
  cursor: pointer;
  border-radius: 4px;
}

.btn-icon-btn:hover {
  background: var(--bg-secondary, #f0f0f0);
}

.dark .btn-icon-btn:hover {
  background: var(--bg-secondary, #3c3c3c);
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
  background: var(--bg-secondary, #f0f0f0);
  color: var(--text-primary, #333);
  margin-left: 8px;
}

.btn-secondary:hover {
  background: var(--border-color, #e0e0e0);
}

.btn-secondary.dark {
  background: var(--bg-secondary, #3c3c3c);
  color: var(--text-primary, #e0e0e0);
}

.btn-secondary.dark:hover {
  background: var(--border-color, #4c4c4c);
}

.btn-warning {
  background-color: #f59e0b;
  color: white;
}

.btn-warning:hover {
  background-color: #d97706;
}

/* ==================== API Key ==================== */

.api-key-panel {
  background: var(--bg-secondary, #f8f9fa);
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 0;
  transition: background 0.3s;
}

.api-key-panel.dark {
  background: var(--bg-secondary, #3c3c3c);
}

.api-key-panel h3 {
  font-size: 16px;
  color: var(--text-primary, #1a1a2e);
  margin-bottom: 8px;
  padding-bottom: 0;
  border-bottom: none;
  transition: color 0.3s;
}

.api-key-panel.dark h3 {
  color: var(--text-primary, #e0e0e0);
}

.api-key-display {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-top: 12px;
}

.api-key-display code {
  background: var(--bg-panel, #e9ecef);
  padding: 8px 12px;
  border-radius: 4px;
  font-family: monospace;
  word-break: break-all;
  flex: 1;
  font-size: 13px;
  color: var(--text-primary, #1a1a2e);
  transition: background 0.3s, color 0.3s;
}

.api-key-display code.dark {
  background: var(--bg-panel, #2d2d2d);
  color: var(--text-primary, #e0e0e0);
}

.hint {
  font-size: 12px;
  color: var(--text-secondary, #999);
  margin-top: 4px;
  transition: color 0.3s;
}

.dark .hint {
  color: var(--text-secondary, #888);
}
</style>
