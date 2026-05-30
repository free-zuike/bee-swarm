<script setup lang="ts">
// ============================================
// 管理后台 - 多渠道推送管理（邮箱+密码认证）
// ============================================
import { ref, reactive, onMounted, computed, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { themeState, useThemeStore } from '@/stores/theme';
import { setLocale, t, currentLocale, useTranslation } from '@/i18n';
import { useGlobalToast } from '@/composables/useToast';
import {
  register,
  login,
  getToken,
  refreshToken,
  getChannelsWithToken,
  saveChannelWithToken,
  sendPushWithToken,
  getHistoryWithToken,
  getApiKeyWithToken,
  getBackupEndpoints,
  addBackupEndpoint,
  updateBackupEndpoint,
  deleteBackupEndpoint,
  testBackupEndpoint,
  listBackupsFromEndpoint,
  restoreBackupFromEndpoint,
  deleteBackupFromEndpoint,
  downloadBackupFromEndpoint,
  backupAll,
  backupSingleEndpoint,
} from '@/api';
import type { BackupEndpoint } from '@/api';
import type {
  ChannelConfig,
  ChannelDefinition,
  ChannelSettings,
  PushChannel,
  PushResult,
  PushHistoryRecord,
} from '@/types';

// 导入子组件
import AuthForm from '@/components/admin/AuthForm.vue';
import PushForm from '@/components/admin/PushForm.vue';
import ChannelSettingsPanel from '@/components/admin/ChannelSettings.vue';
import PushHistory from '@/components/admin/PushHistory.vue';
import BackupManager from '@/components/admin/BackupManager.vue';
import StatsDashboard from '@/components/StatsDashboard.vue';
import TemplateManager from '@/components/TemplateManager.vue';
import GroupManager from '@/components/GroupManager.vue';
import ScheduledPushManager from '@/components/ScheduledPushManager.vue';
import WebhookManager from '@/components/WebhookManager.vue';
import ChannelHealthCheck from '@/components/ChannelHealthCheck.vue';

const router = useRouter();
const themeStore = useThemeStore();

const isDark = computed(() => themeState.isDark);

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}

// 本地响应式变量来确保语言变化能正确更新
const localCurrentLocale = ref<'zh' | 'en'>(currentLocale.value);

function goToApiDocs() {
  router.push('/docs');
}

function toggleLocale() {
  // 先切换语言
  const newLocale: 'zh' | 'en' = localCurrentLocale.value === 'zh' ? 'en' : 'zh';
  setLocale(newLocale);
  localCurrentLocale.value = newLocale;

  // 关闭菜单
  showFabMenu.value = false;
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
const activeTab = ref<
  'push' | 'history' | 'stats' | 'templates' | 'groups' | 'scheduled' | 'webhook' | 'health'
>('stats');

// ==================== 设置面板 ====================
const showSettings = ref(false);

// ==================== 移动端悬浮菜单 ====================
const showFabMenu = ref(false);

// 确保菜单文本响应语言变化
const localeText = computed(() => {
  // 确保访问 currentLocale.value 以触发响应式更新
  const _ = currentLocale.value;
  return {
    toggleTheme: t('button.toggle_theme'),
    apiDocs: t('button.api_docs'),
    settings: t('button.settings'),
    hideSettings: t('button.hide_settings'),
    logout: t('button.logout'),
    toggleLocale: currentLocale.value === 'zh' ? 'English' : '中文',
    toggleLocaleIcon: currentLocale.value === 'zh' ? '🇬🇧' : '🇨🇳',
  };
});

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
const historyTotal = ref(0);
const historyPage = ref(1);
const historyPageSize = 20;

// ==================== API Key ====================
const apiKey = ref('');
const { toast, showToast } = useGlobalToast();

// ==================== 子组件引用 ====================
const channelSettingsRef = ref<InstanceType<typeof ChannelSettingsPanel> | null>(null);
const backupManagerRef = ref<InstanceType<typeof BackupManager> | null>(null);
const pushFormRef = ref<InstanceType<typeof PushForm> | null>(null);

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

// ==================== API Key 复制 ====================
async function copyApiKey() {
  if (!apiKey.value) return;
  try {
    await navigator.clipboard.writeText(apiKey.value);
    showToast(t('msg.copied_to_clipboard'), 'success');
  } catch (err) {
    showToast(t('msg.copy_failed'), 'error');
  }
}

// ==================== 历史记录加载 ====================
const historyFilters = reactive({
  channel: '' as string,
  status: '' as string,
  search: '',
});

async function loadHistory(page = 1) {
  isLoadingHistory.value = true;
  historyPage.value = page;
  try {
    const data = await getHistoryWithToken(accessToken.value, {
      page,
      pageSize: historyPageSize,
      channel: historyFilters.channel || undefined,
      status: historyFilters.status || undefined,
      keyword: historyFilters.search || undefined,
    });
    pushHistory.value = data.history || [];
    historyTotal.value = data.total || 0;
    if (pushHistory.value.length > 0) {
      lastPushTime.value = new Date(pushHistory.value[0].time).toLocaleString('zh-CN');
    }
  } catch (err: unknown) {
    console.error('加载历史记录失败:', err);
  }
  isLoadingHistory.value = false;
}

function handleFilterChange(filters: { channel?: string; status?: string; search?: string }) {
  historyFilters.channel = filters.channel || '';
  historyFilters.status = filters.status || '';
  historyFilters.search = filters.search || '';
  loadHistory(1);
}

async function handleClearHistory() {
  try {
    const { clearHistory } = await import('@/api');
    await clearHistory(accessToken.value);
    showToast('推送历史已清空', 'success');
    await loadHistory(1);
  } catch (err: unknown) {
    showToast('清空失败', 'error');
  }
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
watch(activeTab, (newTab, oldTab) => {
  // 离开推送 tab 时清空渠道选择（使用分组的选择是临时的）
  if (oldTab === 'push' && newTab !== 'push') {
    selectedChannels.value = new Set();
  }
  // 只在数据为空时加载，避免重复请求
  if (newTab === 'push' && channels.value.length === 0) {
    loadChannels();
  }
  if (newTab === 'history') {
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
  } catch (err: unknown) {
    authError.value = getErrorMessage(err, '登录失败');
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
  } catch (err: unknown) {
    authError.value = getErrorMessage(err, '注册失败');
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
  } catch (err: unknown) {
    channelSettingsRef.value?.handleSaveError(channelId, getErrorMessage(err, '保存失败'));
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
  } catch (err: unknown) {
    channelSettingsRef.value?.handleTestResult(channelId, false, getErrorMessage(err, '测试失败'));
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

    const successCount = result.results.filter((r: PushResult) => r.success).length;
    const totalCount = result.results.length;

    if (successCount === totalCount) {
      showToast(t('msg.push_success', { count: successCount }), 'success');
    } else if (successCount > 0) {
      showToast(t('msg.push_partial', { success: successCount, total: totalCount }), 'error');
    } else {
      showToast(t('msg.push_failed'), 'error');
    }

    await loadHistory();
  } catch (err: unknown) {
    pushResults.value = [
      { channel: 'wework', success: false, message: getErrorMessage(err, '推送失败') },
    ];
    showToast(getErrorMessage(err, '推送失败'), 'error');
  }

  isPushing.value = false;
}

// ==================== 备份端管理 ====================
async function handleLoadEndpoints() {
  try {
    const data = await getBackupEndpoints(accessToken.value);
    backupManagerRef.value?.setEndpoints(data.endpoints || []);
  } catch (err: unknown) {
    console.error(t('msg.list_backups_failed') + ':', err);
    backupManagerRef.value?.handleError(getErrorMessage(err, t('msg.list_backups_failed')), 'save');
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
      backupManagerRef.value?.handleTestResult(true, t('msg.create_endpoint_success'));
    }
  } catch (err: unknown) {
    backupManagerRef.value?.handleError(getErrorMessage(err, t('msg.operation_failed')), 'save');
  }
}

async function handleUpdateEndpoint(id: string, endpoint: Omit<BackupEndpoint, 'id'>) {
  try {
    const result = await updateBackupEndpoint(accessToken.value, id, endpoint);
    if (result.success) {
      backupManagerRef.value?.handleUpdateResult(result.endpoint, t('msg.update_endpoint_success'));
    }
  } catch (err: unknown) {
    backupManagerRef.value?.handleError(getErrorMessage(err, t('msg.operation_failed')), 'save');
  }
}

async function handleDeleteEndpoint(id: string) {
  try {
    await deleteBackupEndpoint(accessToken.value, id);
    backupManagerRef.value?.handleDeleteResult(t('msg.delete_endpoint_success'));
  } catch (err: unknown) {
    backupManagerRef.value?.handleError(
      getErrorMessage(err, t('msg.delete_failed', { message: '' })),
      'delete'
    );
  }
}

async function handleTestEndpoint(id: string | null, endpoint: Partial<BackupEndpoint>) {
  try {
    const result = await testBackupEndpoint(accessToken.value, id || 'new', endpoint);
    backupManagerRef.value?.handleTestResult(result.success, result);
  } catch (err: unknown) {
    backupManagerRef.value?.handleError(getErrorMessage(err, t('msg.test_failed')), 'test');
  }
}

async function handleListBackups(id: string) {
  try {
    const data = await listBackupsFromEndpoint(accessToken.value, id);
    backupManagerRef.value?.setBackups(data.backups || []);
  } catch (err: unknown) {
    console.error('加载备份列表失败:', err);
    backupManagerRef.value?.setBackups([]);
  }
}

async function handleRestoreBackup(id: string, key: string) {
  try {
    const result = await restoreBackupFromEndpoint(accessToken.value, id, key);
    backupManagerRef.value?.handleTestResult(result.success, result);
    if (result.success) {
      await loadChannels();
      await loadHistory();
      await handleLoadEndpoints();
    }
  } catch (err: unknown) {
    backupManagerRef.value?.handleError(getErrorMessage(err, 'msg.restore_failed', 'save'));
  }
}

async function handleDeleteBackup(id: string, key: string) {
  try {
    await deleteBackupFromEndpoint(accessToken.value, id, key);
    const data = await listBackupsFromEndpoint(accessToken.value, id);
    backupManagerRef.value?.setBackups(data.backups || []);
    backupManagerRef.value?.handleTestResult(true, { message: 'msg.delete_backup_success' });
  } catch (err: unknown) {
    backupManagerRef.value?.handleError(getErrorMessage(err, 'msg.delete_failed', 'delete'));
  }
}

async function handleDownloadBackup(id: string, key: string) {
  try {
    await downloadBackupFromEndpoint(accessToken.value, id, key);
  } catch (err: unknown) {
    backupManagerRef.value?.handleError(getErrorMessage(err, 'msg.download_failed', 'delete'));
  }
}

async function handleBatchDeleteBackups(items: Array<{ endpointId: string; key: string }>) {
  try {
    let successCount = 0;
    let failCount = 0;

    for (const item of items) {
      try {
        await deleteBackupFromEndpoint(accessToken.value, item.endpointId, item.key);
        successCount++;
      } catch {
        failCount++;
      }
    }

    backupManagerRef.value?.handleBatchDeleteComplete();

    if (failCount === 0) {
      backupManagerRef.value?.handleTestResult(true, {
        message: 'msg.batch_delete_success',
        count: successCount,
      });
    } else {
      backupManagerRef.value?.handleTestResult(successCount > 0, {
        message: 'msg.batch_delete_partial',
        success: successCount,
        failed: failCount,
      });
    }
  } catch (err: unknown) {
    backupManagerRef.value?.handleError(getErrorMessage(err, 'msg.batch_delete_failed', 'delete'));
  }
}

async function handleBackupAll() {
  try {
    const result = await backupAll(accessToken.value);
    const successCount = result.results.filter((r) => r.success).length;
    const totalCount = result.results.length;

    if (successCount === totalCount) {
      backupManagerRef.value?.handleBackupAllResult(
        t('msg.backup_completed', { count: totalCount }),
        'success'
      );
    } else {
      const failed = result.results.filter((r) => !r.success);
      const details = failed
        .map((r) => `${r.endpointName || t('common.unknown')}: ${r.message}`)
        .join('; ');
      backupManagerRef.value?.handleBackupAllResult(
        t('msg.backup_partial', { success: successCount, total: totalCount }) + ' — ' + details,
        'error'
      );
    }

    await handleLoadEndpoints();
  } catch (err: unknown) {
    backupManagerRef.value?.handleError(getErrorMessage(err, 'msg.operation_failed', 'backup'));
  }
}

async function handleBackupSingle(id: string) {
  try {
    const result = await backupSingleEndpoint(accessToken.value, id);
    if (result.success) {
      backupManagerRef.value?.handleBackupSingleResult(
        t('msg.backup_success', { endpointName: result.endpointName || t('common.unknown') }),
        'success'
      );
    } else {
      backupManagerRef.value?.handleBackupSingleResult(
        t('msg.backup_failed', {
          endpointName: result.endpointName || t('common.unknown'),
          message: result.message,
        }),
        'error'
      );
    }
    await handleLoadEndpoints();
    const data = await listBackupsFromEndpoint(accessToken.value, id);
    backupManagerRef.value?.setBackups(data.backups || []);
  } catch (err: unknown) {
    backupManagerRef.value?.handleError(getErrorMessage(err, 'msg.operation_failed', 'backup'));
  }
}

// ==================== 模板相关 ====================
function handleUseTemplate(template: PushTemplate) {
  activeTab.value = 'push';
  nextTick(() => {
    pushFormRef.value?.fillFromTemplate(template);
  });
}

function handleUseGroup(channels: PushChannel[]) {
  activeTab.value = 'push';
  nextTick(() => {
    selectedChannels.value = new Set(channels);
  });
}
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
    <!-- 轻提示 Toast -->
    <transition name="toast">
      <div v-if="toast" class="toast" :class="toast.type">
        {{ toast.text }}
      </div>
    </transition>
    <header class="header" :class="{ dark: isDark }">
      <div class="header-left">
        <h1>{{ t('app.title') }}</h1>
        <span class="header-email">{{ email }}</span>
      </div>

      <!-- 右上角头像悬浮按钮 -->
      <button
        class="fab-toggle"
        :class="{ dark: isDark, active: showFabMenu }"
        @click="showFabMenu = !showFabMenu"
      >
        👤
      </button>

      <!-- 悬浮菜单 -->
      <div
        v-if="showFabMenu"
        class="fab-menu"
        :class="{ dark: isDark }"
        :key="`${localCurrentLocale}-${isDark ? 'dark' : 'light'}`"
      >
        <button
          class="fab-item"
          @click="
            themeStore.toggleTheme();
            showFabMenu = false;
          "
        >
          <span class="fab-icon">{{ isDark ? '☀️' : '🌙' }}</span>
          <span class="fab-label">{{ t('button.toggle_theme') }}</span>
        </button>
        <button class="fab-item" @click="toggleLocale()">
          <span class="fab-icon">{{ localCurrentLocale === 'zh' ? '🇬🇧' : '🇨🇳' }}</span>
          <span class="fab-label">{{ localCurrentLocale === 'zh' ? 'English' : '中文' }}</span>
        </button>
        <button
          class="fab-item"
          @click="
            goToApiDocs();
            showFabMenu = false;
          "
        >
          <span class="fab-icon">📚</span>
          <span class="fab-label">{{ t('button.api_docs') }}</span>
        </button>
        <button
          class="fab-item"
          @click="
            showSettings = !showSettings;
            showFabMenu = false;
          "
        >
          <span class="fab-icon">⚙️</span>
          <span class="fab-label">{{
            showSettings ? t('button.hide_settings') : t('button.settings')
          }}</span>
        </button>
        <button
          class="fab-item fab-logout"
          @click="
            logout();
            showFabMenu = false;
          "
        >
          <span class="fab-icon">🚪</span>
          <span class="fab-label">{{ t('button.logout') }}</span>
        </button>
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
              <button
                class="btn btn-sm btn-icon"
                :class="{ dark: isDark }"
                @click="copyApiKey"
                :title="t('button.copy_api_key')"
              >
                📋
              </button>
              <button class="btn btn-sm btn-warning" @click="loadApiKey(true)">
                {{ t('button.refresh') }}
              </button>
            </div>
            <div v-else>
              <button class="btn btn-secondary" :class="{ dark: isDark }" @click="loadApiKey()">
                {{ t('button.generate_api_key') }}
              </button>
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
            @download-backup="handleDownloadBackup"
            @batch-delete-backups="handleBatchDeleteBackups"
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
            :class="{ active: activeTab === 'stats', dark: isDark }"
            @click="activeTab = 'stats'"
          >
            📊 {{ t('tab.stats') || '统计' }}
          </button>
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
            📜 {{ t('tab.history') }}
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'templates', dark: isDark }"
            @click="activeTab = 'templates'"
          >
            📝 {{ t('tab.templates') }}
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'groups', dark: isDark }"
            @click="activeTab = 'groups'"
          >
            📁 {{ t('tab.groups') }}
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'scheduled', dark: isDark }"
            @click="activeTab = 'scheduled'"
          >
            ⏰ {{ t('tab.scheduled') }}
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'webhook', dark: isDark }"
            @click="activeTab = 'webhook'"
          >
            🔗 Webhook
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'health', dark: isDark }"
            @click="activeTab = 'health'"
          >
            💚 健康检查
          </button>
        </div>

        <!-- ==================== 统计仪表盘 Tab ==================== -->
        <StatsDashboard v-if="activeTab === 'stats'" :access-token="accessToken" />

        <!-- ==================== 推送 Tab ==================== -->
        <PushForm
          v-if="activeTab === 'push'"
          ref="pushFormRef"
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
          :total="historyTotal"
          :access-token="accessToken"
          @load-page="loadHistory"
          @clear="handleClearHistory"
          @filter-change="handleFilterChange"
        />

        <!-- ==================== 模板管理 Tab ==================== -->
        <TemplateManager
          v-if="activeTab === 'templates'"
          :access-token="accessToken"
          :channels="channels"
          @use-template="handleUseTemplate"
        />

        <!-- ==================== 渠道分组 Tab ==================== -->
        <GroupManager
          v-if="activeTab === 'groups'"
          :access-token="accessToken"
          :channels="channels"
          @use-group="handleUseGroup"
        />

        <!-- ==================== 定时推送 Tab ==================== -->
        <ScheduledPushManager v-if="activeTab === 'scheduled'" :access-token="accessToken" />

        <!-- ==================== Webhook 触发推送 Tab ==================== -->
        <WebhookManager v-if="activeTab === 'webhook'" :access-token="accessToken" />

        <!-- ==================== 渠道健康检查 Tab ==================== -->
        <ChannelHealthCheck v-if="activeTab === 'health'" :access-token="accessToken" />
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
  transition:
    background 0.3s,
    color 0.3s;
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
  to {
    transform: rotate(360deg);
  }
}

/* ==================== 轻提示 Toast ==================== */

.toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  z-index: 9999;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.toast.success {
  background: #d1fae5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}

.toast.error {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.toast-enter-active {
  transition: all 0.3s ease;
}

.toast-leave-active {
  transition: all 0.2s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}

/* ==================== 主页面 ==================== */

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
  transition:
    color 0.3s,
    background 0.3s;
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
  height: 52px;
  box-sizing: border-box;
  flex-shrink: 0;
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
  height: 40px;
  line-height: 20px;
  box-sizing: border-box;
  white-space: nowrap;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
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
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
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
  transition:
    color 0.3s,
    border-bottom-color 0.3s;
  height: 32px;
  line-height: 32px;
  box-sizing: border-box;
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
  height: 44px;
  box-sizing: border-box;
  line-height: 20px;
}

.btn-sm {
  padding: 8px 18px;
  font-size: 13px;
  height: 36px;
  line-height: 20px;
  box-sizing: border-box;
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
  transition:
    background 0.3s,
    color 0.3s;
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

/* ==================== 移动端响应式 ==================== */
@media (max-width: 768px) {
  .header {
    padding: 0 12px;
    height: 56px;
  }

  .header-left {
    min-width: auto;
    gap: 8px;
  }

  .header h1 {
    font-size: 16px;
    width: auto;
  }

  .header-email {
    display: none;
  }

  .header-right {
    min-width: auto;
    gap: 4px;
  }

  .header-right .btn-secondary {
    width: auto;
    padding: 6px 8px;
    font-size: 12px;
  }

  .header-right .logout {
    width: auto;
    padding: 0 8px;
    font-size: 12px;
  }

  .container {
    padding: 0 12px;
    margin: 16px auto;
  }

  .tab-nav {
    gap: 4px;
    padding: 4px;
    height: auto;
    overflow-x: auto;
    flex-wrap: nowrap;
  }

  .tab-btn {
    padding: 8px 8px;
    font-size: 11px;
    height: auto;
    line-height: 1.3;
    white-space: nowrap;
    flex: 0 0 auto;
  }

  .stats {
    height: auto;
    gap: 8px;
    margin-bottom: 16px;
  }

  .stat-card {
    height: 72px;
    padding: 8px;
  }

  .stat-card .label {
    font-size: 11px;
    top: 12px;
  }

  .stat-card .value {
    font-size: 20px;
    top: 32px;
  }

  .panel {
    padding: 12px;
    margin-bottom: 16px;
  }

  .panel-header {
    height: auto;
  }

  .panel h2 {
    font-size: 16px;
    height: auto;
    line-height: 1.4;
    margin-bottom: 12px;
  }

  .panel h3 {
    font-size: 14px;
    height: auto;
  }

  .channel-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .channel-tag {
    height: 48px;
  }

  .channel-tag .ch-icon {
    font-size: 16px;
    margin-bottom: 1px;
  }

  .channel-tag .ch-name {
    font-size: 11px;
  }
}

@media (max-width: 480px) {
  .header-right .btn-secondary {
    padding: 4px 6px;
    font-size: 11px;
  }

  .header-right .logout {
    display: none;
  }

  .tab-btn {
    font-size: 12px;
    padding: 6px 8px;
  }

  .stat-card {
    height: 64px;
  }

  .stat-card .label {
    font-size: 10px;
  }

  .stat-card .value {
    font-size: 18px;
  }
}

/* ==================== 右上角悬浮菜单 ==================== */
.fab-toggle {
  display: block;
  position: fixed;
  top: 12px;
  right: 20px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border: none;
  color: white;
  font-size: 20px;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  cursor: pointer;
  z-index: 1000;
  transition: all 0.3s ease;
}

.fab-toggle:hover {
  transform: scale(1.1);
}

.fab-toggle.active {
  transform: rotate(90deg);
}

.fab-menu {
  position: fixed;
  top: 60px;
  right: 20px;
  background: var(--bg-panel, white);
  border-radius: 12px;
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
  padding: 8px;
  z-index: 999;
  min-width: 180px;
}

.fab-menu.dark {
  background: var(--bg-panel, #2d2d2d);
}

.fab-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 16px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
  text-align: left;
}

.fab-item:hover {
  background: var(--bg-secondary, #f0f0f0);
}

.fab-menu.dark .fab-item:hover {
  background: var(--bg-secondary, #3c3c3c);
}

.fab-item.fab-logout:hover {
  background: rgba(239, 68, 68, 0.1);
}

.fab-icon {
  font-size: 18px;
}

.fab-label {
  font-size: 14px;
  color: var(--text-primary, #333);
  flex: 1;
}

.fab-menu.dark .fab-label {
  color: var(--text-primary, #e0e0e0);
}
</style>
