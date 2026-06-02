<script setup lang="ts">
// ============================================
// 管理后台 - 多渠道推送管理（邮箱+密码认证）
// ============================================
import { ref, reactive, onMounted, computed, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { setLocale, currentLocale, useTranslation } from '@/i18n';
import { useGlobalToast } from '@/composables/useToast';
import { usePermission } from '@/composables/usePermission';

const t = useTranslation();
const { isAdmin, hasPermission, loadCurrentUser, currentRole } = usePermission();
import {
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
  updateAvatar,
  getAvatarStorageStatus,
} from '@/api';
import type { BackupEndpoint } from '@/api';
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
  'push' | 'history' | 'stats' | 'templates' | 'groups' | 'scheduled' | 'webhook' | 'health'
>('stats');

// ==================== 设置面板 ====================
const showSettings = ref(false);

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

// ==================== 头像设置 ====================
const userAvatar = ref('');
const useAvatarAsPopup = ref(0);
const showAvatarModal = ref(false);
const avatarInput = ref('');

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
  } catch (_err) {
    showToast(t('msg.copy_failed'), 'error');
  }
}

// ==================== 头像管理 ====================
const isUploading = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);

function triggerFileUpload() {
  fileInput.value?.click();
}

async function openAvatarModal() {
  avatarInput.value = userAvatar.value;
  selectedFile.value = null;
  showAvatarModal.value = true;
}

function closeAvatarModal() {
  showAvatarModal.value = false;
  avatarInput.value = '';
  selectedFile.value = null;
}

async function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  
  if (!file.type.startsWith('image/')) {
    showToast(t('msg.invalid_image_format'), 'error');
    return;
  }
  
  if (file.size > 2 * 1024 * 1024) {
    showToast(t('msg.image_too_large'), 'error');
    return;
  }
  
  selectedFile.value = file;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    avatarInput.value = e.target?.result as string;
  };
  reader.readAsDataURL(file);
  
  target.value = '';
}

async function handleSaveAvatar() {
  try {
    let avatarUrl = avatarInput.value;
    
    if (selectedFile.value) {
      const formData = new FormData();
      formData.append('avatar', selectedFile.value);
      
      const uploadResponse = await fetch(`${BASE}/admin/me/avatar/upload`, {
        method: 'POST',
        headers: { 'X-Token': accessToken.value },
        body: formData,
      });
      
      if (!uploadResponse.ok) {
        const error = await uploadResponse.json();
        throw new Error(error.message || t('msg.upload_failed'));
      }
      
      const uploadResult = await uploadResponse.json();
      if (uploadResult.success) {
        avatarUrl = uploadResult.avatar_url;
      }
    }
    
    const result = await updateAvatar(accessToken.value, {
      avatar_url: avatarUrl && !avatarUrl.startsWith('data:') ? avatarUrl : null,
      use_avatar_as_popup: useAvatarAsPopup.value,
    });
    if (result.success) {
      userAvatar.value = result.avatar_url;
      useAvatarAsPopup.value = result.use_avatar_as_popup;
      showToast(t('msg.avatar_updated'), 'success');
      closeAvatarModal();
    } else {
      showToast(result.message || t('msg.operation_failed'), 'error');
    }
  } catch (err: unknown) {
    showToast(getErrorMessage(err, t('msg.operation_failed')), 'error');
  }
}

function removeAvatar() {
  avatarInput.value = '';
  selectedFile.value = null;
  useAvatarAsPopup.value = 0;
}

async function deleteAvatar() {
  try {
    const result = await updateAvatar(accessToken.value, {
      avatar_url: null,
      use_avatar_as_popup: 0,
    });
    if (result.success) {
      userAvatar.value = '';
      avatarInput.value = '';
      selectedFile.value = null;
      useAvatarAsPopup.value = 0;
      showToast(t('msg.avatar_deleted'), 'success');
    }
  } catch (err: unknown) {
    showToast(getErrorMessage(err, t('msg.operation_failed')), 'error');
  }
}

async function loadUserAvatar() {
  try {
    const { getCurrentUser } = await import('@/api');
    const user = await getCurrentUser(accessToken.value);
    if (user.avatar_url) {
      userAvatar.value = user.avatar_url;
    }
    if (user.use_avatar_as_popup !== undefined) {
      useAvatarAsPopup.value = user.use_avatar_as_popup;
    }
  } catch (err) {
    console.error('加载用户头像失败:', err);
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
          // 加载用户信息
          await loadCurrentUser(accessToken.value);
          await loadChannels();
          await loadHistory();
          pageState.value = 'dashboard';
          return;
        } catch {
          // token 可能过期，尝试刷新
        }
      }

      // 尝试刷新 token
      const refreshSuccess = await authStore.doRefreshToken();
      if (refreshSuccess) {
        // 加载用户信息
        await loadCurrentUser(accessToken.value);
        await loadChannels();
        await loadHistory();
        pageState.value = 'dashboard';
        return;
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
  const success = await authStore.doLogin(authEmail, authPassword);
  if (success) {
    await loadCurrentUser(accessToken.value);
    await loadChannels();
    await loadHistory();
    await loadUserAvatar();
    pageState.value = 'dashboard';
  }
}

async function doRegister(authEmail: string, authPassword: string) {
  const success = await authStore.doRegister(authEmail, authPassword);
  if (success) {
    await loadCurrentUser(accessToken.value);
    await loadChannels();
    await loadHistory();
    await loadUserAvatar();
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
    // 重新加载设置以确保同步
    const data = await getChannelsWithToken(accessToken.value);
    channelSettings.value = data.settings;
    channelDefinitions.value = data.definitions;
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
};

async function handlePush(title: string, body: string, url: string, pushChannels: PushChannel[]) {
  if (isPushing.value) return;
  isPushing.value = true;

  try {
    const payload: PushPayload = { title, body, url };
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
      { channel: 'wework', success: false, message: getErrorMessage(err, t('msg.push_failed')) },
    ];
    showToast(getErrorMessage(err, t('msg.push_failed')), 'error');
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
      backupManagerRef.value?.handleAddResult(result.endpoint, t('msg.create_endpoint_success'));
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
    @register="doRegister"
  />

  <!-- 主界面 -->
  <div v-else class="page" :class="{ dark: isDark }">
    <!-- 头像设置弹窗 -->
    <Teleport to="body">
      <div v-if="showAvatarModal" class="modal-overlay" @click.self="closeAvatarModal">
        <div class="modal-content" :class="{ dark: isDark }">
          <div class="modal-header">
            <h3>{{ t('label.avatar_settings') }}</h3>
            <button class="modal-close" @click="closeAvatarModal">✕</button>
          </div>
          <div class="modal-body">
            <!-- 当前头像预览 -->
            <div class="avatar-preview-section">
              <div class="avatar-preview">
                <img v-if="avatarInput" :src="avatarInput" class="preview-image" />
                <span v-else class="preview-placeholder">{{ roleIcon }}</span>
              </div>
            </div>

            <!-- 文件上传 -->
            <div class="form-group">
              <label>{{ t('label.upload_avatar') }}</label>
              <div class="upload-area" :class="{ dark: isDark }" @click="triggerFileUpload">
                <input
                  ref="fileInput"
                  type="file"
                  accept="image/*"
                  class="file-input"
                  @change="handleFileUpload"
                />
                <span class="upload-icon">📤</span>
                <span class="upload-text">{{ t('label.click_to_upload') }}</span>
                <span class="upload-hint">{{ t('hint.avatar_format') }}</span>
              </div>
            </div>

            <!-- 头像URL输入 -->
            <div class="form-group">
              <label>{{ t('label.avatar_url') }}</label>
              <input
                v-model="avatarInput"
                type="url"
                class="form-input"
                :class="{ dark: isDark }"
                :placeholder="t('placeholder.avatar_url')"
              />
            </div>

            <!-- 悬浮窗设置 -->
            <div class="form-group">
              <label class="checkbox-label">
                <input
                  v-model="useAvatarAsPopup"
                  type="checkbox"
                  :true-value="1"
                  :false-value="0"
                />
                <span>{{ t('label.use_avatar_as_popup') }}</span>
              </label>
            </div>

            <!-- 操作按钮 -->
            <div class="modal-actions">
              <button
                v-if="userAvatar"
                class="btn btn-danger"
                :class="{ dark: isDark }"
                @click="deleteAvatar"
              >
                {{ t('button.delete_avatar') }}
              </button>
              <button class="btn btn-secondary" :class="{ dark: isDark }" @click="closeAvatarModal">
                {{ t('button.cancel') }}
              </button>
              <button 
                class="btn btn-primary" 
                @click="handleSaveAvatar"
              >
                {{ t('button.save') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
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
          <img v-if="userAvatar" :src="userAvatar" class="fab-avatar" />
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
          class="fab-item"
          @click="
            openAvatarModal();
            showFabMenu = false;
          "
        >
          <span class="fab-icon">🖼️</span>
          <span class="fab-label">{{ t('button.avatar_settings') }}</span>
        </button>
        <button
          v-if="hasPermission('users:manage')"
          class="fab-item"
          @click="
            activeTab = 'users';
            showSettings = false;
            showFabMenu = false;
          "
        >
          <span class="fab-icon">👥</span>
          <span class="fab-label">{{ t('tab.users') }}</span>
        </button>
        <button
          v-if="hasPermission('users:manage')"
          class="fab-item"
          @click="
            activeTab = 'audit';
            showSettings = false;
            showFabMenu = false;
          "
        >
          <span class="fab-icon">📋</span>
          <span class="fab-label">{{ t('tab.audit') }}</span>
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
        <!-- 主题选择面板 -->
        <div class="panel" :class="{ dark: isDark }">
          <h3>{{ t('theme.settings') }}</h3>
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
              @click="themeStore.setTheme(theme.value as any)"
            >
              <span class="theme-icon">{{ theme.icon }}</span>
              <span class="theme-label">{{ theme.label }}</span>
              <span v-if="themeStore.currentTheme === theme.value" class="theme-check">✓</span>
            </button>
          </div>
        </div>

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
            💚 {{ t('tab.health') }}
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
  width: 32px;
  height: 32px;
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

.checkbox-label input[type="checkbox"] {
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

/* ==================== 头像预览样式 ==================== */
.avatar-preview-section {
  text-align: center;
  margin-bottom: 24px;
}

.avatar-preview {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: var(--bg-secondary, #f5f5f5);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.modal-content.dark .avatar-preview {
  background: var(--bg-secondary, #3c3c3c);
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-placeholder {
  font-size: 40px;
}

/* ==================== 文件上传区域样式 ==================== */
.upload-area {
  position: relative;
  border: 2px dashed var(--border-color, #e0e0e0);
  border-radius: 8px;
  padding: 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--bg-secondary, #fafafa);
}

.upload-area:hover {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.05);
}

.upload-area.dark {
  background: var(--bg-secondary, #3c3c3c);
  border-color: var(--border-color, #4c4c4c);
}

.upload-area.dark:hover {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.1);
}

.file-input {
  display: none;
}

.upload-icon {
  font-size: 32px;
  display: block;
  margin-bottom: 8px;
}

.upload-text {
  display: block;
  font-size: 14px;
  color: var(--text-primary, #333);
  margin-bottom: 4px;
}

.upload-area.dark .upload-text {
  color: var(--text-primary, #e0e0e0);
}

.upload-hint {
  display: block;
  font-size: 12px;
  color: var(--text-secondary, #999);
}

.upload-area.dark .upload-hint {
  color: var(--text-secondary, #888);
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
</style>
