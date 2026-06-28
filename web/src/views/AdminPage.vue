<script setup lang="ts">
// ============================================
// 管理后台 - 多渠道推送管理（邮箱+密码认证）
// ============================================
import { ref, reactive, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { setLocale, currentLocale, useTranslation } from '@/i18n';
import { useGlobalToast } from '@/composables/useToast';
import { usePermission } from '@/composables/usePermission';
import { useBackupHandlers } from '@/composables/useBackupHandlers';

const t = useTranslation();
const { isAdmin, hasPermission, loadCurrentUser, currentRole } = usePermission();
import {
  getChannelsWithToken,
  saveChannelWithToken,
  sendPushWithToken,
  getHistoryWithToken,
  getApiKeyWithToken,
  getUserSettings,
  saveCacheSettings,
  apiCache,
} from '@/api';
import type { UserSettings } from '@/api';
import type {
  ChannelConfig,
  ChannelDefinition,
  ChannelSettings,
  PushChannel,
  PushResult,
  PushTemplate,
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
import UserManagement from '@/components/admin/UserManagement.vue';
import AuditLogs from '@/components/admin/AuditLogs.vue';
import AIHelper from '@/components/admin/AIHelper.vue';
import AISettingsPanel from '@/components/admin/AISettingsPanel.vue';
import AvatarSettings from '@/components/admin/AvatarSettings.vue';
import SystemSettingsPanel from '@/components/admin/SystemSettingsPanel.vue';
import DatabaseManager from '@/components/admin/DatabaseManager.vue';
import TwoFactorSettings from '@/components/admin/TwoFactorSettings.vue';
import AllowedIPsPanel from '@/components/admin/AllowedIPsPanel.vue';
import SystemHealthPanel from '@/components/admin/SystemHealthPanel.vue';
import DataExportPanel from '@/components/admin/DataExportPanel.vue';

const router = useRouter();
const themeStore = useThemeStore();
const authStore = useAuthStore();

const isDark = computed(() => themeStore.isDark);

const roleIcon = computed(() => {
  switch (currentRole.value) {
    case 'admin':
      return '👑';
    case 'user':
      return '👤';
    case 'viewer':
      return '👁️';
    default:
      return '👤';
  }
});

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
// 使用 auth store 的状态
const isAuthing = computed(() => authStore.isAuthenticating);
const authError = computed(() => authStore.authError);
const email = computed(() => authStore.email);
const accessToken = computed(() => authStore.accessToken);

// ==================== Dashboard Tab ====================
const activeTab = ref<
  | 'push'
  | 'history'
  | 'stats'
  | 'templates'
  | 'groups'
  | 'scheduled'
  | 'webhook'
  | 'health'
>('stats');

// ==================== 设置面板 ====================
const showSettings = ref(false);

// ==================== 用户配置 ====================
const userSettings = ref<UserSettings>({
  cache_ttl_backup: 5 * 60 * 1000,
  cache_ttl_channels: 5 * 60 * 1000,
  cache_ttl_templates: 5 * 60 * 1000,
  cache_ttl_groups: 5 * 60 * 1000,
  cache_ttl_scheduled: 5 * 60 * 1000,
  ai_model: 'workers-ai',
  ai_enabled: true,
  ai_provider: 'workers-ai',
  ai_api_key: '',
  ai_api_url: '',
  ai_model_name: '',
  custom_ai_providers: [],
  ai_provider_configs: {},
});
const isSavingSettings = ref(false);
const activeSettingsTab = ref<string>('theme');
const systemCleanupSettings = ref<{
  cleanup_push_history_days?: number;
  cleanup_audit_log_days?: number;
}>({});
const systemSettingsPanelRef = ref<InstanceType<typeof SystemSettingsPanel> | null>(null);

const userAvatar = ref('');

async function loadUserAvatar() {
  try {
    const { getCurrentUser } = await import('@/api');
    const user = await getCurrentUser(accessToken.value);
    userAvatar.value = user.avatar_url || '';
  } catch {
    // ignore
  }
}

const settingsMenu = [
  { id: 'theme', icon: '🎨', label: 'theme.settings' },
  { id: 'apiKey', icon: '🔑', label: 'label.api_key' },
  { id: 'cache', icon: '🗄️', label: 'label.cache_settings' },
  { id: 'ai', icon: '🤖', label: 'label.ai_settings' },
  { id: 'avatar', icon: '🖼️', label: 'label.avatar_settings' },
  { id: 'backup', icon: '💾', label: 'label.backup_settings' },
  { id: 'export', icon: '📥', label: 'label.dataExport' },
  { id: 'channels', icon: '📡', label: 'label.channel_settings' },
  { id: '2fa', icon: '🔐', label: 'label.2fa_settings' },
  { id: 'ipWhitelist', icon: '🌐', label: 'label.ip_whitelist' },
  { id: 'database', icon: '🗃️', label: 'label.database_management', permission: 'users:manage' },
  { id: 'system', icon: '⚙️', label: 'label.system_settings', permission: 'users:manage' },
  { id: 'health', icon: '🩺', label: 'label.system_health', permission: 'users:manage' },
  { id: 'users', icon: '👥', label: 'tab.users', permission: 'users:manage' },
  { id: 'audit', icon: '📋', label: 'tab.audit', permission: 'users:manage' },
];

async function loadUserSettings() {
  try {
    const result = await getUserSettings(accessToken.value);
    if (result.success) {
      // 合并设置，确保缓存 TTL 有默认值
      userSettings.value = {
        cache_ttl_backup: result.settings.cache_ttl_backup ?? 5 * 60 * 1000,
        cache_ttl_channels: result.settings.cache_ttl_channels ?? 5 * 60 * 1000,
        cache_ttl_templates: result.settings.cache_ttl_templates ?? 5 * 60 * 1000,
        cache_ttl_groups: result.settings.cache_ttl_groups ?? 5 * 60 * 1000,
        cache_ttl_scheduled: result.settings.cache_ttl_scheduled ?? 5 * 60 * 1000,
        ai_model: result.settings.ai_model ?? 'workers-ai',
        ai_enabled: result.settings.ai_enabled ?? false,
        ai_provider: result.settings.ai_provider ?? 'workers-ai',
        ai_api_key: result.settings.ai_api_key ?? '',
        ai_api_url: result.settings.ai_api_url ?? '',
        ai_model_name: result.settings.ai_model_name ?? '',
        custom_ai_providers: result.settings.custom_ai_providers ?? [],
        ai_provider_configs: result.settings.ai_provider_configs ?? {},
      };

      // 确保 custom_ai_providers 存在
      if (!userSettings.value.custom_ai_providers) {
        userSettings.value.custom_ai_providers = [];
      }

      updateCacheSettings();
    }
  } catch {
    // ignore
  }
}

function updateCacheSettings() {
  apiCache.setCustomTtl({
    cache_ttl_backup: userSettings.value.cache_ttl_backup,
    cache_ttl_channels: userSettings.value.cache_ttl_channels,
    cache_ttl_templates: userSettings.value.cache_ttl_templates,
    cache_ttl_groups: userSettings.value.cache_ttl_groups,
    cache_ttl_scheduled: userSettings.value.cache_ttl_scheduled,
  });
}

async function handleSaveCacheSettings() {
  if (isSavingSettings.value) return;

  isSavingSettings.value = true;
  try {
    // 先清除所有缓存
    apiCache.clear();
    
    // 只保存缓存相关设置，不发送AI设置
    const result = await saveCacheSettings(accessToken.value, {
      cache_ttl_backup: userSettings.value.cache_ttl_backup,
      cache_ttl_channels: userSettings.value.cache_ttl_channels,
      cache_ttl_templates: userSettings.value.cache_ttl_templates,
      cache_ttl_groups: userSettings.value.cache_ttl_groups,
      cache_ttl_scheduled: userSettings.value.cache_ttl_scheduled,
    });
    if (result.success) {
      showToast(t('toast.cache_saved'), 'success');
      await loadUserSettings(); // 重新从后端加载最新设置
      updateCacheSettings();
      // 再次清除缓存确保生效
      apiCache.clear();
    }
  } catch (err: unknown) {
    showToast(getErrorMessage(err, t('msg.operation_failed')), 'error');
  } finally {
    isSavingSettings.value = false;
  }
}

function handleClearCache() {
  apiCache.clear();
  showToast(t('msg.cache_cleared'), 'success');
}

// ==================== 移动端悬浮菜单 ====================
const showFabMenu = ref(false);

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
const pushHistory = ref<PushHistoryRecord[]>([]);
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
const aiSettingsPanelRef = ref<InstanceType<typeof AISettingsPanel> | null>(null);

const {
  handleLoadEndpoints,
  handleAddEndpoint,
  handleUpdateEndpoint,
  handleDeleteEndpoint,
  handleTestEndpoint,
  handleListBackups,
  handleRestoreBackup,
  handleDeleteBackup,
  handleDownloadBackup,
  handleBatchDeleteBackups,
  handleBackupAll,
  handleBackupSingle,
} = useBackupHandlers({
  accessToken,
  backupManagerRef,
  loadChannels,
  loadHistory,
});

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
  } catch (_err) {
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
    if (pushHistory.value.length > 0 && pushHistory.value[0].createdAt) {
      const date = new Date(pushHistory.value[0].createdAt);
      lastPushTime.value = isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN');
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
    showToast(t('message.push_history_cleared'), 'success');
    await loadHistory(1);
  } catch (_err: unknown) {
    showToast(t('message.clear_failed'), 'error');
  }
}

// ==================== 统计 ====================
// const enabledChannelCount = computed(() => channels.value.filter((c) => c.enabled).length);

// ==================== 初始化 ====================
onMounted(async () => {
  try {
    // 尝试从 store 恢复凭证
    const hasAuth = authStore.initAuth();

    if (hasAuth) {
      // 检查 token 是否过期
      if (authStore.isAuthenticated) {
        try {
          // 并行加载独立数据（无依赖关系）
          await Promise.all([
            loadCurrentUser(accessToken.value),
            loadUserSettings(),
            loadUserAvatar(),
          ]);
          // 需要 token 的请求（可能依赖用户信息）
          await loadChannels();
          pageState.value = 'dashboard';
          return;
        } catch {
          // token 可能过期，尝试刷新
        }
      }

      // 尝试刷新 token
      const refreshSuccess = await authStore.doRefreshToken();
      if (refreshSuccess) {
      // 并行加载独立数据
      await Promise.all([loadCurrentUser(accessToken.value), loadUserSettings()]);
      await loadChannels();
        pageState.value = 'dashboard';
        return;
      }
    }
    pageState.value = 'auth';
  } catch {
    pageState.value = 'auth';
  }
});

// ==================== 页面焦点检测 ====================
// 当用户从其他标签/应用返回时，检查 token 是否仍然有效
onMounted(() => {
  const handleVisibilityChange = async () => {
    if (document.visibilityState === 'visible' && pageState.value === 'dashboard') {
      // 仅在 token 已过期时才尝试刷新，不要每次都刷新
      if (authStore.tokenExpiresAt <= Date.now()) {
        try {
          const { refreshToken: rt } = await import('@/api');
          await rt(authStore.refreshTokenValue);
        } catch {
          authStore.logout();
          pageState.value = 'auth';
        }
      }
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  onUnmounted(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });
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
async function doLogin(authEmail: string, authPassword: string, turnstileToken?: string) {
  const result = await authStore.doLogin(authEmail, authPassword, turnstileToken);
  if (result && typeof result === 'object' && result.need2FA) {
    // 需要 2FA，切换到验证模式
    return;
  }
  if (result) {
    try {
      // 并行加载独立数据
      await Promise.all([loadCurrentUser(accessToken.value)]);
      await loadChannels();
    } catch {
      // 数据加载失败不影响登录
    }
    pageState.value = 'dashboard';
  }
}

async function doLogin2FA(authEmail: string, authPassword: string, code: string) {
  const success = await authStore.doLogin2FA(authEmail, authPassword, code);
  if (success) {
    try {
      await Promise.all([loadCurrentUser(accessToken.value)]);
      await loadChannels();
    } catch {
      // 数据加载失败不影响登录
    }
    pageState.value = 'dashboard';
  }
}

async function doRegister(authEmail: string, authPassword: string, turnstileToken?: string) {
  const result = await authStore.doRegister(authEmail, authPassword, turnstileToken);
  if (result.needVerification) {
    // 需要邮箱验证，显示验证表单
    authStore.setAuthError(null);
    // 通过 AuthForm 显示验证界面
    return;
  }
  if (result.success) {
    try {
      // 并行加载独立数据
      await Promise.all([loadCurrentUser(accessToken.value)]);
      await loadChannels();
    } catch {
      // 数据加载失败不影响注册
    }
    pageState.value = 'dashboard';
  }
}

function logout() {
  authStore.logout();
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
  const saved = sessionStorage.getItem('bee_swarm_selected_channels');
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

    // 重新加载设置以确保同步 - 强制刷新获取最新数据
    try {
      const data = await getChannelsWithToken(accessToken.value, true);
      channelSettings.value = data.settings;
      channelDefinitions.value = data.definitions;
    } catch (refreshErr) {
      console.error('[Channel] Failed to refresh settings:', refreshErr);
      // 不显示错误，因为保存本身成功了
    }

    channelSettingsRef.value?.handleSaveSuccess(channelId, result.message || t('msg.save_success'));
  } catch (err: unknown) {
    channelSettingsRef.value?.handleSaveError(
      channelId,
      getErrorMessage(err, t('message.save_failed'))
    );
  }
}

async function handleTestChannel(channelId: string, _fields: Record<string, string>) {
  try {
    const result = await sendPushWithToken(accessToken.value, {
      title: t('message.test_message'),
      body: t('message.test_message_body'),
      channels: [channelId as PushChannel],
    });

    const channelResult = result.results?.find((r) => r.channel === channelId);
    channelSettingsRef.value?.handleTestResult(
      channelId,
      channelResult?.success || false,
      channelResult?.message || result.message || t('message.test_complete')
    );
  } catch (err: unknown) {
    channelSettingsRef.value?.handleTestResult(
      channelId,
      false,
      getErrorMessage(err, t('message.test_complete'))
    );
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
type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  channels?: PushChannel[];
  async?: boolean;
};

async function handlePush(
  title: string,
  body: string,
  url: string,
  pushChannels: PushChannel[],
  asyncPush: boolean = false
) {
  if (isPushing.value) return;
  isPushing.value = true;

  try {
    const payload: PushPayload = { title, body, url };
    if (pushChannels.length > 0) {
      payload.channels = pushChannels;
    }
    if (asyncPush) {
      payload.async = true;
    }

    const result = await sendPushWithToken(accessToken.value, payload);
    lastPushTime.value = new Date().toLocaleTimeString('zh-CN');

    if (result.async && result.requestId) {
      showToast(t('success.push'), 'success');
      pushResults.value = [];
      setTimeout(() => {
        loadHistory();
      }, 2000);
    } else {
      if (!result.success) {
        // 推送失败（如队列不可用）
        pushResults.value = [
          { channel: 'system', success: false, message: result.message || t('msg.push_failed') },
        ];
        showToast(result.message || t('msg.push_failed'), 'error');
      } else {
        pushResults.value = result.results || [];

        const successCount = result.results?.filter((r: PushResult) => r.success).length || 0;
        const totalCount = result.results?.length || 0;

        if (successCount === totalCount && totalCount > 0) {
          showToast(t('msg.push_success', { count: successCount }), 'success');
        } else if (successCount > 0) {
          showToast(t('msg.push_partial', { success: successCount, total: totalCount }), 'warning');
        } else if (totalCount > 0) {
          showToast(t('msg.push_failed'), 'error');
        } else {
          showToast(t('success.push'), 'success');
        }
      }

      await loadHistory();
    }
  } catch (err: unknown) {
    pushResults.value = [
      { channel: 'wework', success: false, message: getErrorMessage(err, t('msg.push_failed')) },
    ];
    showToast(getErrorMessage(err, t('msg.push_failed')), 'error');
  }

  isPushing.value = false;
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

function handleResend(record: PushHistoryRecord) {
  activeTab.value = 'push';
  nextTick(() => {
    // 构造一个类模板对象填充表单
    const templateLike: PushTemplate = {
      id: record.id,
      name: t('label.resend'),
      title: record.title,
      content: record.body || '',
      url: record.url || '',
      channels: record.channels as PushChannel[],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    pushFormRef.value?.fillFromTemplate(templateLike);
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
    @login-2fa="doLogin2FA"
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
        <span
          class="role-badge"
          :class="['role-badge-' + currentRole, { dark: isDark }]"
          :title="t('label.current_role')"
        >
          <span class="role-badge-icon">{{ roleIcon }}</span>
          <span class="role-badge-text">{{ t(`role.${currentRole}`) }}</span>
        </span>
      </div>

      <!-- 右上角头像悬浮按钮 -->
      <button
        class="fab-toggle"
        :class="{ dark: isDark, active: showFabMenu }"
        @click="showFabMenu = !showFabMenu"
      >
        <img v-if="userAvatar" :src="userAvatar" class="fab-avatar" @error="userAvatar = ''" />
        <span v-else>👤</span>
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
          <span class="fab-icon">{{
            themeStore.currentTheme === 'light'
              ? '☀️'
              : themeStore.currentTheme === 'dark'
                ? '🌙'
                : '🌓'
          }}</span>
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
      <!-- 设置面板 - 左右布局 -->
      <div v-if="showSettings" class="settings-layout">
        <!-- 左侧菜单 -->
        <div class="settings-sidebar" :class="{ dark: isDark }">
          <h3>⚙️ {{ t('label.settings') }}</h3>
          <div class="settings-menu">
            <button
              v-for="item in settingsMenu"
              :key="item.id"
              v-show="!item.permission || hasPermission(item.permission)"
              class="settings-menu-item"
              :class="{ active: activeSettingsTab === item.id, dark: isDark }"
              @click="activeSettingsTab = item.id"
            >
              <span class="menu-icon">{{ item.icon }}</span>
              <span class="menu-label">{{ t(item.label) }}</span>
            </button>
          </div>
        </div>

        <!-- 右侧内容 -->
        <div class="settings-content" :class="{ dark: isDark }">
          <!-- 主题设置 -->
          <div
            v-if="activeSettingsTab === 'theme'"
            class="settings-panel"
            :class="{ dark: isDark }"
          >
            <h3>🎨 {{ t('theme.settings') }}</h3>
            <div class="settings-card">
              <div class="theme-options">
                <button
                  v-for="theme in [
                    { value: 'light', label: t('theme.light'), icon: '☀️' },
                    { value: 'dark', label: t('theme.dark'), icon: '🌙' },
                    { value: 'auto', label: t('theme.auto'), icon: '🌓' },
                  ]"
                  :key="theme.value"
                  class="theme-option"
                  :class="{ active: themeStore.currentTheme === theme.value, dark: isDark }"
                  @click="themeStore.setTheme(theme.value as 'light' | 'dark' | 'auto')"
                >
                  <span class="theme-icon">{{ theme.icon }}</span>
                  <span class="theme-label">{{ theme.label }}</span>
                  <span v-if="themeStore.currentTheme === theme.value" class="theme-check">✓</span>
                </button>
              </div>
            </div>
          </div>

          <!-- API Key 设置 -->
          <div
            v-else-if="activeSettingsTab === 'apiKey'"
            class="settings-panel"
            :class="{ dark: isDark }"
          >
            <h3>🔑 {{ t('label.api_key') }}</h3>
            <div class="settings-card">
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

          <!-- 缓存设置 -->
          <div
            v-else-if="activeSettingsTab === 'cache'"
            class="settings-panel"
            :class="{ dark: isDark }"
          >
            <h3>🗄️ {{ t('label.cache_settings') }}</h3>
            <div class="settings-card">
              <div class="setting-item">
                <label>{{ t('label.cache_ttl_backup') }}</label>
                <input
                  type="number"
                  v-model.number="userSettings.cache_ttl_backup"
                  min="0"
                  step="60000"
                  class="input-sm"
                  :class="{ dark: isDark }"
                />
                <span class="unit">ms</span>
              </div>
              <div class="setting-item">
                <label>{{ t('label.cache_ttl_channels') }}</label>
                <input
                  type="number"
                  v-model.number="userSettings.cache_ttl_channels"
                  min="0"
                  step="60000"
                  class="input-sm"
                  :class="{ dark: isDark }"
                />
                <span class="unit">ms</span>
              </div>
              <div class="setting-item">
                <label>{{ t('label.cache_ttl_templates') }}</label>
                <input
                  type="number"
                  v-model.number="userSettings.cache_ttl_templates"
                  min="0"
                  step="60000"
                  class="input-sm"
                  :class="{ dark: isDark }"
                />
                <span class="unit">ms</span>
              </div>
              <div class="setting-item">
                <label>{{ t('label.cache_ttl_groups') }}</label>
                <input
                  type="number"
                  v-model.number="userSettings.cache_ttl_groups"
                  min="0"
                  step="60000"
                  class="input-sm"
                  :class="{ dark: isDark }"
                />
                <span class="unit">ms</span>
              </div>
              <div class="setting-item">
                <label>{{ t('label.cache_ttl_scheduled') }}</label>
                <input
                  type="number"
                  v-model.number="userSettings.cache_ttl_scheduled"
                  min="0"
                  step="60000"
                  class="input-sm"
                  :class="{ dark: isDark }"
                />
                <span class="unit">ms</span>
              </div>
              <button
                class="btn btn-sm btn-secondary"
                :class="{ dark: isDark }"
                @click="handleClearCache"
              >
                🗑️ {{ t('button.clear_cache') }}
              </button>
              <button
                class="btn btn-sm btn-primary"
                :class="{ dark: isDark, loading: isSavingSettings }"
                @click="handleSaveCacheSettings"
              >
                {{ t('button.save_settings') }}
              </button>
            </div>
          </div>

          <!-- AI 设置 -->
          <AISettingsPanel
            v-else-if="activeSettingsTab === 'ai'"
            ref="aiSettingsPanelRef"
            :access-token="accessToken"
            :user-settings="userSettings"
            :is-saving-settings="isSavingSettings"
          />

          <!-- 头像设置 -->
          <AvatarSettings
            v-else-if="activeSettingsTab === 'avatar'"
            :access-token="accessToken"
            @avatar-updated="userAvatar = $event"
          />

          <!-- 数据备份 -->
          <BackupManager
            v-else-if="activeSettingsTab === 'backup'"
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

          <!-- 数据导出 -->
          <DataExportPanel v-else-if="activeSettingsTab === 'export'" :access-token="accessToken" />

          <!-- 渠道设置 -->
          <ChannelSettingsPanel
            v-else-if="activeSettingsTab === 'channels'"
            ref="channelSettingsRef"
            :channels="channels"
            :channel-definitions="channelDefinitions"
            :channel-settings="channelSettings"
            :access-token="accessToken"
            @save="handleSaveChannel"
            @test="handleTestChannel"
            @toggle-enabled="handleToggleChannelEnabled"
          />

          <!-- 双因素认证 -->
          <TwoFactorSettings v-else-if="activeSettingsTab === '2fa'" :token="accessToken" />

          <!-- IP 白名单 -->
          <AllowedIPsPanel
            v-else-if="activeSettingsTab === 'ipWhitelist'"
            :access-token="accessToken"
          />

          <!-- 系统设置 -->
          <SystemSettingsPanel
            v-else-if="activeSettingsTab === 'system' && hasPermission('users:manage')"
            ref="systemSettingsPanelRef"
            :access-token="accessToken"
            @update="systemCleanupSettings = $event"
          />

          <!-- 系统健康监控 -->
          <SystemHealthPanel
            v-else-if="activeSettingsTab === 'health' && hasPermission('users:manage')"
            :access-token="accessToken"
          />

          <!-- 用户管理 -->
          <UserManagement
            v-else-if="activeSettingsTab === 'users' && hasPermission('users:manage')"
          />

          <!-- 数据库管理 -->
          <DatabaseManager
            v-else-if="activeSettingsTab === 'database' && hasPermission('users:manage')"
            :access-token="accessToken"
            :cleanup-push-history-days="systemCleanupSettings.cleanup_push_history_days"
            :cleanup-audit-log-days="systemCleanupSettings.cleanup_audit_log_days"
          />

          <!-- 审计日志 -->
          <AuditLogs v-else-if="activeSettingsTab === 'audit' && hasPermission('users:manage')" />
        </div>
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
            📊 {{ t('tab.stats') }}
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
            🔗 {{ t('tab.webhook') }}
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'health', dark: isDark }"
            @click="activeTab = 'health'"
          >
            🏥 {{ t('tab.health') }}
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
          :token="accessToken"
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
          @resend="handleResend"
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

        <!-- ==================== 用户管理 Tab（从悬浮菜单进入） ==================== -->
        <UserManagement v-if="activeTab === 'users' && hasPermission('users:manage')" />

        <!-- ==================== 审计日志 Tab（从悬浮菜单进入） ==================== -->
        <AuditLogs v-if="activeTab === 'audit' && hasPermission('users:manage')" />
      </template>
    </div>

    <!-- AI 助手 -->
    <AIHelper
      :access-token="accessToken"
      :ai-enabled="userSettings.ai_enabled"
      @refresh="loadHistory"
    />
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

.role-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  color: white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  transition: all 0.3s;
  cursor: default;
  user-select: none;
}

.role-badge-icon {
  font-size: 14px;
  line-height: 1;
}

.role-badge-text {
  letter-spacing: 0.3px;
}

.role-badge-admin {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.35);
}

.role-badge-user {
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
  box-shadow: 0 2px 8px rgba(17, 153, 142, 0.35);
}

.role-badge-viewer {
  background: linear-gradient(135deg, #fc4a1a 0%, #f7b733 100%);
  box-shadow: 0 2px 8px rgba(252, 74, 26, 0.35);
}

.role-badge:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.role-badge-admin:hover {
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.5);
}

.role-badge-user:hover {
  box-shadow: 0 4px 12px rgba(17, 153, 142, 0.5);
}

.role-badge-viewer:hover {
  box-shadow: 0 4px 12px rgba(252, 74, 26, 0.5);
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
  width: 100%;
  margin: 24px 0;
  padding: 0;
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
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  padding: 12px 16px;
  border-radius: 6px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  word-break: break-all;
  flex: 1;
  font-size: 14px;
  color: #e2e8f0;
  font-weight: 500;
  letter-spacing: 1px;
  border: 1px solid #334155;
}

.api-key-display code.dark {
  background: linear-gradient(135deg, #0f172a 0%, #1e1e2e 100%);
  color: #e0e0e0;
  border-color: #404040;
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

  .role-badge {
    padding: 3px 8px;
    font-size: 11px;
    gap: 4px;
  }

  .role-badge-icon {
    font-size: 12px;
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

.fab-avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

/* ==================== 弹窗样式 ==================== */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  animation: fadeIn 0.2s ease;
}

.modal-content {
  background: var(--bg-panel, white);
  border-radius: 16px;
  width: 90%;
  max-width: 400px;
  overflow: hidden;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.modal-content.dark {
  background: var(--bg-panel, #2d2d2d);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
}

.modal-header h3 {
  font-size: 18px;
  color: var(--text-primary, #1a1a2e);
  margin: 0;
}

.modal-content.dark .modal-header h3 {
  color: var(--text-primary, #e0e0e0);
}

.modal-close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--text-secondary, #999);
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.2s;
}

.modal-close:hover {
  background: var(--bg-secondary, #f0f0f0);
}

.modal-content.dark .modal-close:hover {
  background: var(--bg-secondary, #3c3c3c);
}

.modal-body {
  padding: 24px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #1a1a2e);
  margin-bottom: 8px;
}

.modal-content.dark .form-group label {
  color: var(--text-primary, #e0e0e0);
}

.form-input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 14px;
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #333);
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: #667eea;
}

.form-input.dark {
  background: var(--bg-primary, #1e1e1e);
  color: var(--text-primary, #e0e0e0);
  border-color: var(--border-color, #3c3c3c);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.checkbox-label input[type='checkbox'] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.checkbox-label span {
  font-size: 14px;
  color: var(--text-primary, #333);
}

.modal-content.dark .checkbox-label span {
  color: var(--text-primary, #e0e0e0);
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}

.flex-1 {
  flex: 1;
}

/* ==================== 危险按钮样式 ==================== */
.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-danger:hover {
  background: #dc2626;
}

.fab-menu.dark .fab-label {
  color: var(--text-primary, #e0e0e0);
}

/* ==================== 主题选择器样式 ==================== */
.theme-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.theme-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 10px;
  background: var(--bg-panel, white);
  cursor: pointer;
  transition: all 0.2s ease;
}

.theme-option:hover {
  border-color: #667eea;
  background: var(--bg-secondary, #f0f0f0);
}

.theme-option.active {
  border-color: #667eea;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1));
}

.theme-option.dark:hover {
  background: var(--bg-secondary, #3c3c3c);
}

.theme-option.dark.active {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.15));
}

.theme-icon {
  font-size: 24px;
}

.theme-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #1a1a2e);
  flex: 1;
}

.theme-check {
  color: #667eea;
  font-size: 20px;
  font-weight: bold;
}

/* ==================== 左右布局设置面板样式 ==================== */
.settings-layout {
  display: flex;
  gap: 20px;
  width: 100%;
  height: calc(100vh - 80px);
  padding: 0 16px;
}

.settings-sidebar {
  width: 180px;
  flex-shrink: 0;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 12px;
  padding: 16px;
  overflow-y: auto;
}

.settings-sidebar.dark {
  background: var(--bg-dark-secondary, #1e1e2e);
}

.settings-sidebar h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
}

.settings-sidebar.dark h3 {
  color: var(--text-dark-primary, #ffffff);
}

.settings-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary, #666);
  transition: all 0.2s;
  text-align: left;
}

.settings-menu-item:hover {
  background: var(--bg-hover, #e8e8e8);
  color: var(--text-primary, #1a1a2e);
}

.settings-menu-item.dark:hover {
  background: var(--bg-dark-hover, #2a2a3e);
  color: var(--text-dark-primary, #ffffff);
}

.settings-menu-item.active {
  background: var(--primary-color, #6366f1);
  color: #ffffff;
}

.settings-menu-item.active.dark {
  background: var(--primary-color, #6366f1);
}

.menu-icon {
  font-size: 18px;
}

.menu-label {
  flex: 1;
}

.settings-content {
  flex: 1;
  background: transparent;
  padding: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.settings-content.dark {
  background: var(--bg-dark-secondary, #1e1e2e);
}

.settings-panel {
  animation: fadeIn 0.2s ease;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 12px;
  padding: 16px;
  min-height: fit-content;
}

.settings-card {
  background: var(--bg-panel, #ffffff);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border-color, #e8e8e8);
}

.settings-panel.dark .settings-card {
  background: var(--bg-panel, #2d2d2d);
}

.settings-panel h3 {
  margin: 0 0 20px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
}

.settings-panel.dark h3 {
  color: var(--text-dark-primary, #ffffff);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ==================== 设置项样式 ==================== */

/* 设置项优化 */
.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0;
  border-bottom: 1px solid var(--border-color, #e8e8e8);
  gap: 20px;
}

.setting-item:last-of-type {
  border-bottom: none;
}

.setting-item label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #1a1a2e);
  flex-shrink: 0;
}

.setting-item .toggle {
  margin-left: auto;
}

.setting-item .input-sm,
.setting-item select {
  flex: 1;
  max-width: 320px;
  padding: 10px 14px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 14px;
  background: var(--bg-primary, #ffffff);
  color: var(--text-primary, #1a1a2e);
  transition: all 0.2s;
}

.setting-item .input-sm:focus,
.setting-item select:focus {
  outline: none;
  border-color: var(--primary-color, #6366f1);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.form-input.dark:focus {
  border-color: var(--primary-color, #818cf8) !important;
  outline: none;
}

.settings-panel.dark .form-input {
  background: var(--bg-primary, #1e1e1e);
  color: var(--text-primary, #e0e0e0);
  border-color: #444;
}

.settings-panel.dark .form-input::placeholder {
  color: #888;
}

.settings-panel.dark .input-sm {
  background: var(--bg-primary, #1e1e1e);
  color: var(--text-primary, #e0e0e0);
  border-color: #444;
}

.settings-panel.dark .btn-primary {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: white;
}

.setting-item .unit {
  font-size: 12px;
  color: var(--text-secondary, #666);
  margin-left: 8px;
  flex-shrink: 0;
}

.settings-panel.dark .setting-item label {
  color: var(--text-dark-primary, #ffffff);
}

.settings-panel.dark .setting-item .input-sm,
.settings-panel.dark .setting-item select,
.settings-panel.dark .setting-item input {
  background: var(--bg-dark-primary, #16162a);
  border-color: var(--border-dark-color, #333);
  color: var(--text-dark-primary, #ffffff);
}

.settings-panel.dark .setting-item input::placeholder {
  color: var(--text-dark-secondary, #666);
}

.settings-panel.dark .setting-hint {
  background: var(--bg-dark-secondary, #1e1e2e);
  color: var(--text-dark-secondary, #999);
}

.settings-panel.dark .settings-card h4 {
  color: var(--text-dark-primary, #ffffff);
}

.setting-hint {
  font-size: 12px;
  color: var(--text-secondary, #666);
  padding: 12px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 8px;
  margin-top: 12px;
}

.settings-card h4 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
  margin-bottom: 16px;
}

.settings-card .btn-primary {
  margin-top: 16px;
  width: 100%;
  padding: 12px 24px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 8px;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  border: none;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
}

.settings-card .btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
}

.settings-card .btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.settings-card .btn-secondary {
  margin-top: 16px;
  width: 100%;
  padding: 12px 24px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  background: transparent;
  border: 1px solid var(--border-color, #e0e0e0);
  color: var(--text-primary, #1a1a2e);
  cursor: pointer;
  transition: all 0.2s;
}

.settings-card .btn-secondary:hover {
  background: var(--bg-secondary, #f5f5f5);
}

/* ==================== 可折叠设置面板样式 ==================== */
.collapsible-section {
  margin-top: 16px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  overflow: hidden;
}

.collapsible-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-secondary, #f5f5f5);
  border: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
}

.collapsible-header:hover {
  background: var(--bg-tertiary, #e8e8e8);
}

.collapsible-header.dark {
  background: var(--bg-secondary, #3c3c3c);
}

.collapsible-header.dark:hover {
  background: var(--bg-tertiary, #4a4a4a);
}

.section-icon {
  margin-right: 8px;
  font-size: 16px;
}

.section-title {
  flex: 1;
  text-align: left;
  color: var(--text-primary, #1a1a2e);
}

.collapsible-header.dark .section-title {
  color: var(--text-primary, #e0e0e0);
}

.section-arrow {
  font-size: 12px;
  color: var(--text-secondary, #999);
  transition: transform 0.2s;
}

.collapsible-content {
  padding: 12px 16px;
  background: var(--bg-panel, white);
  border-top: 1px solid var(--border-color, #e0e0e0);
}

.collapsible-section:first-child {
  margin-top: 8px;
}

.setting-item {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.setting-item:last-child {
  margin-bottom: 0;
}

.setting-item label {
  width: 180px;
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #1a1a2e);
}

.dark .setting-item label {
  color: var(--text-primary, #e0e0e0);
}

.setting-item .unit {
  font-size: 13px;
  color: var(--text-secondary, #999);
  margin-left: 4px;
}

.dark .setting-item .unit {
  color: var(--text-secondary, #888);
}

.setting-item .toggle {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
}

.setting-item .toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.setting-item .toggle .slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: 0.3s;
  border-radius: 26px;
}

.setting-item .toggle .slider:before {
  position: absolute;
  content: '';
  height: 20px;
  width: 20px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
}

.setting-item .toggle input:checked + .slider {
  background: linear-gradient(135deg, #667eea, #764ba2);
}

.setting-item .toggle input:checked + .slider:before {
  transform: translateX(22px);
}

.api-key-content {
  padding-bottom: 8px;
}
</style>
