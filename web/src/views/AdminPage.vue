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
  uploadAvatar,
  getUserSettings,
  saveCacheSettings,
  saveAISettings,
  getAITools,
  getSystemSettings,
  saveSystemSettings,
  getDatabaseStats,
  cleanupDatabase,
  archiveDatabase,
  getArchives,
  restoreArchive,
  getDatabaseTables,
  deleteDatabaseTable,
  cleanupOrphanTables,
  apiCache,
} from '@/api';
import type {
  BackupEndpoint,
  UserSettings,
  SystemSettings,
  DatabaseStats,
  ArchiveInfo,
  DatabaseTable,
} from '@/api';
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
const systemSettings = ref<SystemSettings>({
  turnstile_enabled: false,
  turnstile_site_key: '',
  turnstile_secret_key: '',
  cleanup_enabled: true,
  cleanup_push_history_days: 30,
  cleanup_audit_log_days: 90,
  cleanup_batch_size: 100,
  cors_allowed_origins: [],
});
const newCORSOrigin = ref('');
const isSavingSettings = ref(false);
const isSavingSystemSettings = ref(false);
const activeSettingsTab = ref<string>('theme');

// ==================== 数据库管理相关 ====================
const databaseStats = ref<DatabaseStats>({
  pushHistoryCount: 0,
  auditLogsCount: 0,
  usersCount: 0,
  estimatedSize: '0 KB',
});
const archives = ref<ArchiveInfo[]>([]);
const databaseTables = ref<DatabaseTable[]>([]);
const isLoadingStats = ref(false);
const isCleaningUp = ref(false);
const isArchiving = ref(false);
const isRestoring = ref(false);
const isLoadingTables = ref(false);
const isDeletingTable = ref(false);
const isCleaningTables = ref(false);

// ==================== 自定义 AI 提供商相关 ====================
const showAddProviderModal = ref(false);
const newProviderName = ref('');
const newProviderIcon = ref('🤖');
const showEditProviderModal = ref(false);
const editingProviderId = ref('');
const editingProviderName = ref('');
const editingProviderIcon = ref('🤖');
const availableIcons = ['🤖', '🧠', '⚡', '🔧', '🌟', '🎯', '🚀', '💡', '🔥', '✨'];

// 预定义的提供商列表
const predefinedProviders = [
  {
    id: 'workers-ai',
    name: 'Cloudflare Workers AI',
    icon: '☁️',
    desc: '使用 Cloudflare Workers AI，无需额外配置',
  },
  { id: 'openai', name: 'OpenAI', icon: '🧠', desc: '使用 OpenAI GPT 模型，需要 API Key' },
  {
    id: 'azure-openai',
    name: 'Azure OpenAI',
    icon: '🔷',
    desc: '使用 Azure OpenAI 服务，需要完整配置',
  },
  { id: 'anthropic', name: 'Anthropic Claude', icon: '🤖', desc: '使用 Claude 模型，需要 API Key' },
];

// ==================== AI 工具栏相关 ====================
const aiTools = ref<any[]>([]);
const showAddToolModal = ref(false);
const showEditToolModal = ref(false);
const newToolName = ref('');
const newToolDescription = ref('');
const editingToolId = ref('');
const editingTool = ref<any>(null);

async function loadAITools() {
  try {
    const result = await getAITools(accessToken.value);
    if (result.success) {
      aiTools.value = result.tools;
    }
  } catch (err) {
    console.error('加载 AI 工具失败:', err);
  }
}

// 生成工具提示词（与后端 buildToolSystemPrompt 保持一致）
function getToolPrompt(tool: any): string {
  const paramsStr =
    tool.parameters && tool.parameters.length > 0
      ? JSON.stringify(
          tool.parameters.map((p: any) => ({
            name: p.name,
            type: p.type,
            description: p.description,
            required: p.required,
          }))
        )
      : '[]';

  return `{"name":"${tool.name}","description":"${tool.description}","parameters":${paramsStr}}`;
}

function editTool(tool: any) {
  editingToolId.value = tool.id;
  editingTool.value = { ...tool };
  showEditToolModal.value = true;
}

function deleteTool(toolId: string) {
  aiTools.value = aiTools.value.filter((t) => t.id !== toolId);
  saveAITools();
}

async function handleToggleTool(_tool: any) {
  await saveAITools();
}

async function saveAITools() {
  try {
    const result = await saveAISettings(accessToken.value, {
      ai_tools: aiTools.value.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        parameters: t.parameters || [],
        enabled: t.enabled,
      })),
    });
    if (result.success) {
      showToast('AI 工具已保存', 'success');
    }
  } catch (err) {
    console.error('保存 AI 工具失败:', err);
    showToast('保存失败', 'error');
  }
}

function addTool() {
  if (!newToolName.value.trim()) {
    showToast('请输入工具名称', 'error');
    return;
  }

  const tool = {
    id: `custom_${Date.now()}`,
    name: newToolName.value.trim(),
    description: newToolDescription.value.trim(),
    parameters: [],
    enabled: true,
    isDefault: false,
  };

  aiTools.value.push(tool);
  newToolName.value = '';
  newToolDescription.value = '';
  showAddToolModal.value = false;

  saveAITools();
  showToast('工具添加成功', 'success');
}

function updateTool() {
  if (!editingTool.value) return;

  const index = aiTools.value.findIndex((t) => t.id === editingToolId.value);
  if (index !== -1) {
    aiTools.value[index] = { ...editingTool.value };
  }

  showEditToolModal.value = false;
  editingToolId.value = '';
  editingTool.value = null;

  saveAITools();
  showToast('工具更新成功', 'success');
}

const userAvatar = ref('');
const avatarInput = ref('');
const useAvatarAsPopup = ref(0);
const isSaving = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const showAvatarModal = ref(false);

function closeAvatarModal() {
  showAvatarModal.value = false;
}

function triggerFileUpload() {
  // 重置文件输入框，确保每次都触发文件选择都能生效
  if (fileInput.value) {
    fileInput.value.value = '';
  }
  fileInput.value?.click();
}

async function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    selectedFile.value = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      avatarInput.value = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }
}

async function handleSaveAvatar() {
  isSaving.value = true;
  try {
    let newAvatarUrl = userAvatar.value;

    // 如果有选择文件，先上传文件
    if (selectedFile.value) {
      const uploadResult = await uploadAvatar(accessToken.value, selectedFile.value);
      newAvatarUrl = uploadResult.avatar_url;
    } else if (avatarInput.value && avatarInput.value.startsWith('http')) {
      // 如果是 URL，直接使用
      newAvatarUrl = avatarInput.value;
    } else if (avatarInput.value) {
      // 如果是 data URL，直接使用
      newAvatarUrl = avatarInput.value;
    }

    // 更新头像设置
    const updateResult = await updateAvatar(accessToken.value, {
      avatar_url: newAvatarUrl,
      use_avatar_as_popup: useAvatarAsPopup.value,
    });

    userAvatar.value = updateResult.avatar_url;
    useAvatarAsPopup.value = updateResult.use_avatar_as_popup;
    selectedFile.value = null;

    showToast(t('message.avatar_saved'), 'success');
    closeAvatarModal();
  } catch (_error) {
    showToast(t('message.save_failed'), 'error');
  } finally {
    isSaving.value = false;
  }
}

async function deleteAvatar() {
  isSaving.value = true;
  try {
    await updateAvatar(accessToken.value, {
      avatar_url: '',
      use_avatar_as_popup: useAvatarAsPopup.value,
    });

    userAvatar.value = '';
    avatarInput.value = '';
    selectedFile.value = null;

    showToast(t('message.avatar_deleted'), 'success');
  } catch (_error) {
    showToast(t('message.save_failed'), 'error');
  } finally {
    isSaving.value = false;
  }
}

function handleAvatarError() {
  userAvatar.value = '';
}

const settingsMenu = [
  { id: 'theme', icon: '🎨', label: 'theme.settings' },
  { id: 'apiKey', icon: '🔑', label: 'label.api_key' },
  { id: 'cache', icon: '🗄️', label: 'label.cache_settings' },
  { id: 'ai', icon: '🤖', label: 'label.ai_settings' },
  { id: 'avatar', icon: '🖼️', label: 'label.avatar_settings' },
  { id: 'backup', icon: '💾', label: 'label.backup_settings' },
  { id: 'channels', icon: '📡', label: 'label.channel_settings' },
  { id: 'database', icon: '🗃️', label: 'label.database_management', permission: 'users:manage' },
  { id: 'system', icon: '⚙️', label: 'label.system_settings', permission: 'users:manage' },
  { id: 'users', icon: '👥', label: 'tab.users', permission: 'users:manage' },
  { id: 'audit', icon: '📋', label: 'tab.audit', permission: 'users:manage' },
];

async function loadUserSettings() {
  try {
    const result = await getUserSettings(accessToken.value);
    if (result.success) {
      userSettings.value = result.settings;

      // 确保 ai_provider_configs 存在
      if (!userSettings.value.ai_provider_configs) {
        userSettings.value.ai_provider_configs = {};
      }

      // 确保 custom_ai_providers 存在
      if (!userSettings.value.custom_ai_providers) {
        userSettings.value.custom_ai_providers = [];
      }

      console.log('加载的用户设置:', userSettings.value);
      console.log('自定义提供商:', userSettings.value.custom_ai_providers);

      // 如果当前提供商有配置，加载到临时字段用于绑定
      const currentProvider = userSettings.value.ai_provider || 'workers-ai';
      loadProviderConfig(currentProvider);

      updateCacheSettings();
    }
  } catch {
    // ignore
  }
}

async function loadSystemSettings() {
  if (!isAdmin.value) return;
  try {
    const result = await getSystemSettings(accessToken.value);
    if (result.success) {
      systemSettings.value = {
        turnstile_enabled: result.settings.turnstile_enabled ?? false,
        turnstile_site_key: result.settings.turnstile_site_key ?? '',
        turnstile_secret_key: result.settings.turnstile_secret_key ?? '',
        cleanup_enabled: result.settings.cleanup_enabled ?? true,
        cleanup_push_history_days: result.settings.cleanup_push_history_days ?? 30,
        cleanup_audit_log_days: result.settings.cleanup_audit_log_days ?? 90,
        cleanup_batch_size: result.settings.cleanup_batch_size ?? 100,
        cors_allowed_origins: result.settings.cors_allowed_origins ?? [],
      };
    }
  } catch {
    // ignore
  }
}

async function handleSaveSystemSettings() {
  if (isSavingSystemSettings.value) return;
  isSavingSystemSettings.value = true;
  try {
    await saveSystemSettings(accessToken.value, systemSettings.value);
    showToast(t('msg.system_settings_saved'), 'success');
  } catch (err) {
    showToast(getErrorMessage(err, t('msg.save_system_settings_failed')), 'error');
  } finally {
    isSavingSystemSettings.value = false;
  }
}

function addCORSOrigin() {
  const origin = newCORSOrigin.value.trim();
  if (!origin) {
    showToast(t('msg.invalid_origin'), 'error');
    return;
  }
  if (systemSettings.value.cors_allowed_origins.includes(origin)) {
    showToast(t('msg.origin_exists'), 'error');
    return;
  }
  systemSettings.value.cors_allowed_origins.push(origin);
  newCORSOrigin.value = '';
}

function removeCORSOrigin(index: number) {
  systemSettings.value.cors_allowed_origins.splice(index, 1);
}

async function loadDatabaseStats() {
  if (!isAdmin.value) return;
  isLoadingStats.value = true;
  try {
    const result = await getDatabaseStats(accessToken.value);
    if (result.success) {
      databaseStats.value = result.stats;
    }
  } catch (err) {
    console.error('加载数据库统计失败:', err);
  } finally {
    isLoadingStats.value = false;
  }
}

async function loadArchives() {
  if (!isAdmin.value) return;
  try {
    const result = await getArchives(accessToken.value);
    if (result.success) {
      archives.value = result.archives;
    }
  } catch (err) {
    console.error('加载归档列表失败:', err);
  }
}

async function handleCleanup() {
  if (isCleaningUp.value) return;
  const pushDays = systemSettings.value.cleanup_push_history_days || 30;
  const auditDays = systemSettings.value.cleanup_audit_log_days || 90;
  if (!confirm(t('confirm.cleanup_database', { pushDays: String(pushDays), auditDays: String(auditDays) }))) {
    return;
  }

  isCleaningUp.value = true;
  try {
    const result = await cleanupDatabase(accessToken.value, {
      pushHistoryRetentionDays: systemSettings.value.cleanup_push_history_days,
      auditLogRetentionDays: systemSettings.value.cleanup_audit_log_days,
    });
    if (result.success) {
      showToast(
        t('msg.cleanup_result', {
          pushDeleted: String(result.pushHistoryDeleted),
          auditDeleted: String(result.auditLogsDeleted),
        }),
        'success'
      );
      await loadDatabaseStats();
    }
  } catch (err) {
    showToast(getErrorMessage(err, t('msg.cleanup_failed')), 'error');
  } finally {
    isCleaningUp.value = false;
  }
}

async function handleArchive() {
  if (isArchiving.value) return;
  const archiveAfterDays = 30;
  if (!confirm(t('confirm.archive_database', { days: String(archiveAfterDays) }))) {
    return;
  }

  isArchiving.value = true;
  try {
    const result = await archiveDatabase(accessToken.value, { archiveAfterDays });
    if (result.success) {
      showToast(t('msg.archive_result', { count: String(result.archived) }), 'success');
      await loadDatabaseStats();
      await loadArchives();
    }
  } catch (err) {
    showToast(getErrorMessage(err, t('msg.archive_failed')), 'error');
  } finally {
    isArchiving.value = false;
  }
}

async function handleRestore(archiveKey: string) {
  if (isRestoring.value) return;
  if (!confirm(t('confirm.restore_archive'))) {
    return;
  }

  isRestoring.value = true;
  try {
    const result = await restoreArchive(accessToken.value, archiveKey);
    if (result.success) {
      showToast(t('msg.restore_result', { count: String(result.restored) }), 'success');
      await loadDatabaseStats();
    }
  } catch (err) {
    showToast(getErrorMessage(err, t('msg.restore_failed')), 'error');
  } finally {
    isRestoring.value = false;
  }
}

async function loadDatabaseTables() {
  if (!isAdmin.value) return;
  isLoadingTables.value = true;
  try {
    const result = await getDatabaseTables(accessToken.value);
    if (result.success) {
      databaseTables.value = result.tables;
    }
  } catch (err) {
    console.error('加载数据库表失败:', err);
  } finally {
    isLoadingTables.value = false;
  }
}

async function handleDeleteTable(tableName: string) {
  if (isDeletingTable.value) return;
  if (!confirm(t('confirm.delete_table', { table: tableName }))) {
    return;
  }

  isDeletingTable.value = true;
  try {
    const result = await deleteDatabaseTable(accessToken.value, tableName);
    if (result.success) {
      showToast(t('msg.table_deleted', { table: tableName }), 'success');
      await loadDatabaseTables();
    } else {
      showToast(result.error || t('msg.delete_failed'), 'error');
    }
  } catch (err) {
    showToast(getErrorMessage(err, t('msg.delete_failed')), 'error');
  } finally {
    isDeletingTable.value = false;
  }
}

async function handleCleanupTables() {
  if (isCleaningTables.value) return;
  if (!confirm(t('confirm.cleanup_tables'))) {
    return;
  }

  isCleaningTables.value = true;
  try {
    const result = await cleanupOrphanTables(accessToken.value);
    if (result.success) {
      if (result.deletedTables.length > 0) {
        showToast(t('msg.tables_deleted', { count: String(result.deletedTables.length) }), 'success');
      } else {
        showToast(t('msg.no_tables_to_delete'), 'success');
      }
      await loadDatabaseTables();
    }
  } catch (err) {
    showToast(getErrorMessage(err, t('msg.cleanup_failed')), 'error');
  } finally {
    isCleaningTables.value = false;
  }
}

// 保存当前提供商的配置
function saveProviderConfig(provider: string) {
  if (!userSettings.value.ai_provider_configs) {
    userSettings.value.ai_provider_configs = {};
  }

  userSettings.value.ai_provider_configs[
    provider as keyof typeof userSettings.value.ai_provider_configs
  ] = {
    api_key: userSettings.value.ai_api_key,
    api_url: userSettings.value.ai_api_url,
    model_name: userSettings.value.ai_model_name,
  };
}

// 加载提供商的配置
function loadProviderConfig(provider: string) {
  const config =
    userSettings.value.ai_provider_configs?.[
      provider as keyof typeof userSettings.value.ai_provider_configs
    ];

  if (config) {
    userSettings.value.ai_api_key = config.api_key || '';
    userSettings.value.ai_api_url = config.api_url || getDefaultApiUrlForProvider(provider);
    userSettings.value.ai_model_name =
      config.model_name || getDefaultModelNameForProvider(provider);
  } else {
    // 如果没有保存过该提供商的配置，使用默认值
    userSettings.value.ai_api_key = '';
    userSettings.value.ai_api_url = getDefaultApiUrlForProvider(provider);
    userSettings.value.ai_model_name = getDefaultModelNameForProvider(provider);
  }
}

function getDefaultApiUrlForProvider(provider: string) {
  switch (provider) {
    case 'openai':
      return 'https://api.openai.com/v1/chat/completions';
    case 'azure-openai':
      return 'https://{your-resource-name}.openai.azure.com/openai/deployments/{deployment-name}/chat/completions?api-version=2024-02-15-preview';
    case 'anthropic':
      return 'https://api.anthropic.com/v1/messages';
    case 'workers-ai':
      return '';
    case 'custom':
      return 'https://api.example.com/v1/chat/completions';
    default:
      // 对于自定义提供商，返回默认值
      return 'https://api.example.com/v1/chat/completions';
  }
}

function getDefaultModelNameForProvider(provider: string) {
  switch (provider) {
    case 'openai':
      return 'gpt-4';
    case 'azure-openai':
      return 'gpt-4';
    case 'anthropic':
      return 'claude-3-opus';
    case 'workers-ai':
      return '@cf/meta/llama-3-8b-instruct';
    case 'custom':
      return 'gpt-4';
    default:
      // 对于自定义提供商，返回默认值
      return 'gpt-4';
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

async function selectProvider(provider: string) {
  // 如果正在保存，等待完成
  if (isSavingSettings.value) return;

  const oldProvider = userSettings.value.ai_provider;

  // 先保存旧提供商的配置（内存中）
  if (oldProvider) {
    saveProviderConfig(oldProvider);
  }

  // 先加载新提供商的配置，确保发送正确的默认值
  const config =
    userSettings.value.ai_provider_configs?.[
      provider as keyof typeof userSettings.value.ai_provider_configs
    ];
  const apiKey = config?.api_key || '';

  // workers-ai 不需要 API URL（Cloudflare 内置服务）
  const isWorkersAI = provider === 'workers-ai';
  const apiUrl = isWorkersAI ? '' : config?.api_url || getDefaultApiUrlForProvider(provider);
  const modelName = config?.model_name || getDefaultModelNameForProvider(provider);

  // 只保存AI相关设置，不包含缓存设置
  const requestData = {
    ai_enabled: userSettings.value.ai_enabled,
    ai_provider: provider,
    ai_model: provider,
    ai_api_key: apiKey,
    ai_api_url: apiUrl,
    ai_model_name: modelName,
    ai_provider_configs: userSettings.value.ai_provider_configs,
    custom_ai_providers: userSettings.value.custom_ai_providers,
    ai_tools: aiTools.value.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      parameters: t.parameters || [],
      enabled: t.enabled,
    })),
  };

  // 先发送请求
  isSavingSettings.value = true;
  try {
    await saveAISettings(accessToken.value, requestData);

    // 请求成功后再更新本地状态
    userSettings.value.ai_provider = provider as any;
    loadProviderConfig(provider);
  } catch {
    // 失败时什么都不做，保持原样
    showToast('切换失败，请重试', 'error');
  } finally {
    isSavingSettings.value = false;
  }
}

function getProviderConfigTitle() {
  const provider = userSettings.value.ai_provider;
  // 检查是否是自定义提供商
  const customProvider = userSettings.value.custom_ai_providers?.find((p) => p.id === provider);
  if (customProvider) {
    return `${customProvider.name} 配置`;
  }
  switch (provider) {
    case 'openai':
      return 'OpenAI 配置';
    case 'azure-openai':
      return 'Azure OpenAI 配置';
    case 'anthropic':
      return 'Anthropic Claude 配置';
    case 'custom':
      return '自定义 API 配置';
    default:
      return '';
  }
}

// ==================== 自定义提供商管理函数 ====================
function isCustomProvider(providerId: string) {
  return !!userSettings.value.custom_ai_providers?.find((p) => p.id === providerId);
}

async function saveCustomProviders() {
  if (isSavingSettings.value) return;

  // 保存当前提供商的配置（如果有的话）
  if (userSettings.value.ai_provider) {
    saveProviderConfig(userSettings.value.ai_provider);
  }

  isSavingSettings.value = true;
  try {
    // 只保存自定义提供商相关设置，不做其他验证
    const result = await saveAISettings(accessToken.value, {
      ai_enabled: userSettings.value.ai_enabled,
      ai_provider: userSettings.value.ai_provider,
      ai_model: userSettings.value.ai_provider,
      ai_api_key: userSettings.value.ai_api_key,
      ai_api_url: userSettings.value.ai_api_url,
      ai_model_name: userSettings.value.ai_model_name,
      ai_provider_configs: userSettings.value.ai_provider_configs,
      custom_ai_providers: userSettings.value.custom_ai_providers,
      ai_tools: aiTools.value.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        parameters: t.parameters || [],
        enabled: t.enabled,
      })),
    });
    if (result.success) {
      showToast('设置已保存', 'success');
    }
  } catch (err: unknown) {
    showToast(getErrorMessage(err, '保存失败'), 'error');
  } finally {
    isSavingSettings.value = false;
  }
}

function addTestProvider() {
  const testProvider = {
    id: `test-${Date.now()}`,
    name: '测试提供商 ' + new Date().toLocaleTimeString(),
    icon: '🧪',
  };

  if (!userSettings.value.custom_ai_providers) {
    userSettings.value.custom_ai_providers = [];
  }

  userSettings.value.custom_ai_providers.push(testProvider);
  console.log('添加测试提供商:', testProvider);
  console.log('当前自定义提供商列表:', userSettings.value.custom_ai_providers);

  // 保存到后端
  saveCustomProviders();

  showToast('测试提供商添加成功!', 'success');
}

function addCustomProvider() {
  if (!newProviderName.value.trim()) {
    showToast('请输入提供商名称', 'error');
    return;
  }

  // 生成唯一 ID
  const providerId = `custom-${Date.now()}`;
  const newProvider = {
    id: providerId,
    name: newProviderName.value.trim(),
    icon: newProviderIcon.value,
  };

  if (!userSettings.value.custom_ai_providers) {
    userSettings.value.custom_ai_providers = [];
  }
  userSettings.value.custom_ai_providers.push(newProvider);

  console.log('添加自定义提供商:', newProvider);
  console.log('当前自定义提供商列表:', userSettings.value.custom_ai_providers);

  // 重置表单
  newProviderName.value = '';
  newProviderIcon.value = '🤖';
  showAddProviderModal.value = false;

  // 保存到后端
  saveCustomProviders();

  showToast('自定义提供商添加成功', 'success');
}

function startEditProvider(providerId: string, event: Event) {
  event.stopPropagation();

  const provider = userSettings.value.custom_ai_providers?.find((p) => p.id === providerId);
  if (provider) {
    editingProviderId.value = providerId;
    editingProviderName.value = provider.name;
    editingProviderIcon.value = provider.icon;
    showEditProviderModal.value = true;
  }
}

function saveEditProvider() {
  if (!editingProviderName.value.trim()) {
    showToast('请输入提供商名称', 'error');
    return;
  }

  const provider = userSettings.value.custom_ai_providers?.find(
    (p) => p.id === editingProviderId.value
  );
  if (provider) {
    provider.name = editingProviderName.value.trim();
    provider.icon = editingProviderIcon.value;
  }

  showEditProviderModal.value = false;
  editingProviderId.value = '';
  editingProviderName.value = '';
  editingProviderIcon.value = '🤖';

  // 保存到后端
  saveCustomProviders();

  showToast('提供商信息已更新', 'success');
}

function deleteCustomProvider(providerId: string, event: Event) {
  event.stopPropagation();

  // 检查是否是当前选中的提供商
  if (userSettings.value.ai_provider === providerId) {
    showToast('无法删除当前正在使用的提供商', 'error');
    return;
  }

  // 从列表中删除
  userSettings.value.custom_ai_providers =
    userSettings.value.custom_ai_providers?.filter((p) => p.id !== providerId) || [];

  // 删除相关配置
  if (userSettings.value.ai_provider_configs) {
    delete userSettings.value.ai_provider_configs[providerId];
  }

  // 保存到后端
  saveCustomProviders();

  showToast('自定义提供商删除成功', 'success');
}

async function handleSaveCacheSettings() {
  if (isSavingSettings.value) return;

  isSavingSettings.value = true;
  try {
    // 只保存缓存相关设置，不发送AI设置
    const result = await saveCacheSettings(accessToken.value, {
      cache_ttl_backup: userSettings.value.cache_ttl_backup,
      cache_ttl_channels: userSettings.value.cache_ttl_channels,
      cache_ttl_templates: userSettings.value.cache_ttl_templates,
      cache_ttl_groups: userSettings.value.cache_ttl_groups,
      cache_ttl_scheduled: userSettings.value.cache_ttl_scheduled,
    });
    if (result.success) {
      showToast('缓存设置已保存', 'success');
      await loadUserSettings(); // 重新从后端加载最新设置
      updateCacheSettings();
    }
  } catch (err: unknown) {
    showToast(getErrorMessage(err, t('msg.operation_failed')), 'error');
  } finally {
    isSavingSettings.value = false;
  }
}

async function handleSaveAISettings() {
  if (isSavingSettings.value) return;

  // AI 设置验证
  if (userSettings.value.ai_enabled) {
    if (!userSettings.value.ai_provider) {
      showToast('请选择 AI 提供商', 'error');
      return;
    }

    // 所有提供商都需要模型名称
    if (!userSettings.value.ai_model_name?.trim()) {
      showToast('请输入模型名称', 'error');
      return;
    }

    // 除了 workers-ai，其他提供商需要 API Key
    if (userSettings.value.ai_provider !== 'workers-ai') {
      if (!userSettings.value.ai_api_key?.trim()) {
        showToast('请输入 API Key', 'error');
        return;
      }
      // 对于 azure-openai 和所有自定义提供商，需要 API URL
      if (
        (userSettings.value.ai_provider === 'azure-openai' ||
          isCustomProvider(userSettings.value.ai_provider)) &&
        !userSettings.value.ai_api_url?.trim()
      ) {
        showToast('请输入 API URL', 'error');
        return;
      }
    }
  }

  // 保存当前提供商的配置到 ai_provider_configs
  if (userSettings.value.ai_provider) {
    saveProviderConfig(userSettings.value.ai_provider);
  }

  isSavingSettings.value = true;
  try {
    // 只保存AI相关设置，不发送缓存设置
    const result = await saveAISettings(accessToken.value, {
      ai_enabled: userSettings.value.ai_enabled,
      ai_provider: userSettings.value.ai_provider,
      ai_model: userSettings.value.ai_provider,
      ai_api_key: userSettings.value.ai_api_key,
      ai_api_url: userSettings.value.ai_api_url,
      ai_model_name: userSettings.value.ai_model_name,
      ai_provider_configs: userSettings.value.ai_provider_configs,
      custom_ai_providers: userSettings.value.custom_ai_providers,
      ai_tools: aiTools.value.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        parameters: t.parameters || [],
        enabled: t.enabled,
      })),
    });
    if (result.success) {
      showToast(result.message, 'success');
      await loadUserSettings(); // 重新从后端加载最新设置
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

async function loadUserAvatar() {
  try {
    const { getCurrentUser } = await import('@/api');
    const user = await getCurrentUser(accessToken.value);
    userAvatar.value = user.avatar_url || '';
    if (user.use_avatar_as_popup !== undefined) {
      useAvatarAsPopup.value = user.use_avatar_as_popup;
    }
  } catch {
    // ignore
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
          // 加载用户信息
          await loadCurrentUser(accessToken.value);
          await loadChannels();
          await loadHistory();
          await loadUserAvatar();
          await loadUserSettings();
          await loadAITools();
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
        await loadUserAvatar();
        await loadUserSettings();
        await loadAITools();
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

// ==================== 设置标签页切换 ====================
watch(activeSettingsTab, (newTab) => {
  // 当切换到头像设置时，初始化 avatarInput 为当前的 userAvatar
  if (newTab === 'avatar') {
    avatarInput.value = userAvatar.value;
    selectedFile.value = null;
    // 重置文件输入框
    if (fileInput.value) {
      fileInput.value.value = '';
    }
  }
  // 当切换到 AI 设置时，加载 AI 工具列表
  if (newTab === 'ai' && aiTools.value.length === 0) {
    loadAITools();
  }
});

// ==================== 认证函数 ====================
async function doLogin(authEmail: string, authPassword: string, turnstileToken?: string) {
  const success = await authStore.doLogin(authEmail, authPassword, turnstileToken);
  if (success) {
    await loadCurrentUser(accessToken.value);
    await loadChannels();
    await loadHistory();
    await loadUserAvatar();
    pageState.value = 'dashboard';
  }
}

async function doRegister(authEmail: string, authPassword: string, turnstileToken?: string) {
  const success = await authStore.doRegister(authEmail, authPassword, turnstileToken);
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
        .map((r) => {
          const endpointName = r.endpointName || t('common.unknown');
          const errorInfo = r.errorMessage ? ` (${r.errorMessage})` : '';
          return `${endpointName}: ${r.message}${errorInfo}`;
        })
        .join('; ');
      backupManagerRef.value?.handleBackupAllResult(
        t('msg.backup_partial', { success: successCount, total: totalCount }) + ' — ' + details,
        'error'
      );
    }

    await handleLoadEndpoints();
    
    // 刷新当前选中的备份端点的备份列表
    if (backupManagerRef.value?.selectedEndpointId) {
      const data = await listBackupsFromEndpoint(accessToken.value, backupManagerRef.value.selectedEndpointId);
      backupManagerRef.value?.setBackups(data.backups || []);
    }
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
              <button class="btn btn-primary" :disabled="isSaving" @click="handleSaveAvatar">
                {{ isSaving ? t('label.saving') : t('button.save') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 添加自定义 AI 提供商模态框 -->
    <Teleport to="body">
      <div
        v-if="showAddProviderModal"
        class="modal-overlay"
        @click.self="showAddProviderModal = false"
      >
        <div class="modal-content" :class="{ dark: isDark }">
          <div class="modal-header">
            <h3>添加自定义 AI 提供商</h3>
            <button class="modal-close" @click="showAddProviderModal = false">✕</button>
          </div>
          <div class="modal-body">
            <!-- 提供商名称输入 -->
            <div class="form-group">
              <label>提供商名称</label>
              <input
                v-model="newProviderName"
                type="text"
                class="form-input"
                :class="{ dark: isDark }"
                placeholder="例如：My AI Service"
                autofocus
              />
            </div>

            <!-- 图标选择 -->
            <div class="form-group">
              <label>选择图标</label>
              <div class="icon-selector">
                <button
                  v-for="icon in availableIcons"
                  :key="icon"
                  class="icon-option"
                  :class="{ active: newProviderIcon === icon, dark: isDark }"
                  @click="newProviderIcon = icon"
                >
                  {{ icon }}
                </button>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="modal-actions">
              <button
                class="btn btn-secondary"
                :class="{ dark: isDark }"
                @click="showAddProviderModal = false"
              >
                取消
              </button>
              <button class="btn btn-primary" @click="addCustomProvider">添加</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 编辑自定义 AI 提供商模态框 -->
    <Teleport to="body">
      <div
        v-if="showEditProviderModal"
        class="modal-overlay"
        @click.self="showEditProviderModal = false"
      >
        <div class="modal-content" :class="{ dark: isDark }">
          <div class="modal-header">
            <h3>编辑自定义 AI 提供商</h3>
            <button class="modal-close" @click="showEditProviderModal = false">✕</button>
          </div>
          <div class="modal-body">
            <!-- 提供商名称输入 -->
            <div class="form-group">
              <label>提供商名称</label>
              <input
                v-model="editingProviderName"
                type="text"
                class="form-input"
                :class="{ dark: isDark }"
                placeholder="例如：My AI Service"
                autofocus
              />
            </div>

            <!-- 图标选择 -->
            <div class="form-group">
              <label>选择图标</label>
              <div class="icon-selector">
                <button
                  v-for="icon in availableIcons"
                  :key="icon"
                  class="icon-option"
                  :class="{ active: editingProviderIcon === icon, dark: isDark }"
                  @click="editingProviderIcon = icon"
                >
                  {{ icon }}
                </button>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="modal-actions">
              <button
                class="btn btn-secondary"
                :class="{ dark: isDark }"
                @click="showEditProviderModal = false"
              >
                取消
              </button>
              <button class="btn btn-primary" @click="saveEditProvider">保存</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 添加自定义 AI 工具模态框 -->
    <Teleport to="body">
      <div v-if="showAddToolModal" class="modal-overlay" @click.self="showAddToolModal = false">
        <div class="modal-content" :class="{ dark: isDark }">
          <div class="modal-header">
            <h3>添加自定义 AI 工具</h3>
            <button class="modal-close" @click="showAddToolModal = false">✕</button>
          </div>
          <div class="modal-body">
            <!-- 工具名称 -->
            <div class="form-group">
              <label>工具名称</label>
              <input
                v-model="newToolName"
                type="text"
                class="form-input"
                :class="{ dark: isDark }"
                placeholder="例如：myCustomTool"
                autofocus
              />
            </div>

            <!-- 工具描述 -->
            <div class="form-group">
              <label>工具描述</label>
              <input
                v-model="newToolDescription"
                type="text"
                class="form-input"
                :class="{ dark: isDark }"
                placeholder="描述这个工具的功能"
              />
            </div>

            <!-- 操作按钮 -->
            <div class="modal-actions">
              <button
                class="btn btn-secondary"
                :class="{ dark: isDark }"
                @click="showAddToolModal = false"
              >
                取消
              </button>
              <button class="btn btn-primary" @click="addTool">添加</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 编辑自定义 AI 工具模态框 -->
    <Teleport to="body">
      <div v-if="showEditToolModal" class="modal-overlay" @click.self="showEditToolModal = false">
        <div class="modal-content" :class="{ dark: isDark }">
          <div class="modal-header">
            <h3>编辑 AI 工具</h3>
            <button class="modal-close" @click="showEditToolModal = false">✕</button>
          </div>
          <div class="modal-body" v-if="editingTool">
            <!-- 工具名称 -->
            <div class="form-group">
              <label>工具名称</label>
              <input
                v-model="editingTool.name"
                type="text"
                class="form-input"
                :class="{ dark: isDark }"
                placeholder="工具名称"
                autofocus
              />
            </div>

            <!-- 工具描述 -->
            <div class="form-group">
              <label>工具描述</label>
              <input
                v-model="editingTool.description"
                type="text"
                class="form-input"
                :class="{ dark: isDark }"
                placeholder="描述这个工具的功能"
              />
            </div>

            <!-- 操作按钮 -->
            <div class="modal-actions">
              <button
                class="btn btn-secondary"
                :class="{ dark: isDark }"
                @click="showEditToolModal = false"
              >
                取消
              </button>
              <button class="btn btn-primary" @click="updateTool">保存</button>
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
        <img v-if="userAvatar" :src="userAvatar" class="fab-avatar" @error="handleAvatarError" />
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
              @click="
                activeSettingsTab = item.id;
                if (item.id === 'system') {
                  loadSystemSettings();
                }
                if (item.id === 'database') {
                  loadDatabaseStats();
                  loadArchives();
                  loadDatabaseTables();
                }
              "
            >
              <span class="menu-icon">{{ item.icon }}</span>
              <span class="menu-label">{{ t(item.label) }}</span>
            </button>
          </div>
        </div>

        <!-- 右侧内容 -->
        <div class="settings-content" :class="{ dark: isDark }">
          <!-- 主题设置 -->
          <div v-if="activeSettingsTab === 'theme'" class="settings-panel">
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
                  @click="themeStore.setTheme(theme.value as any)"
                >
                  <span class="theme-icon">{{ theme.icon }}</span>
                  <span class="theme-label">{{ theme.label }}</span>
                  <span v-if="themeStore.currentTheme === theme.value" class="theme-check">✓</span>
                </button>
              </div>
            </div>
          </div>

          <!-- API Key 设置 -->
          <div v-else-if="activeSettingsTab === 'apiKey'" class="settings-panel">
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
          <div v-else-if="activeSettingsTab === 'cache'" class="settings-panel">
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
          <div v-else-if="activeSettingsTab === 'ai'" class="settings-panel">
            <h3>🤖 {{ t('label.ai_settings') }}</h3>
            <div class="settings-card">
              <div class="setting-item">
                <label>{{ t('label.ai_enabled') }}</label>
                <label class="toggle">
                  <input type="checkbox" v-model="userSettings.ai_enabled" />
                  <span class="slider"></span>
                </label>
              </div>
            </div>

            <!-- AI 提供商布局 -->
            <div class="ai-provider-layout">
              <!-- 左边：AI 提供商列表 -->
              <div class="ai-provider-sidebar" :class="{ dark: isDark }">
                <div class="sidebar-header">
                  <span class="sidebar-title">AI 提供商</span>
                  <div style="display: flex; gap: 8px">
                    <button
                      class="btn-add-provider"
                      @click="addTestProvider"
                      title="添加测试提供商"
                    >
                      <span>🧪</span>
                    </button>
                    <button
                      class="btn-add-provider"
                      @click="showAddProviderModal = true"
                      title="添加自定义提供商"
                    >
                      <span>+</span>
                    </button>
                  </div>
                </div>

                <div class="provider-list">
                  <!-- 预定义提供商 -->
                  <div
                    v-for="provider in predefinedProviders"
                    :key="provider.id"
                    class="provider-item"
                    :class="{ active: userSettings.ai_provider === provider.id, dark: isDark }"
                    @click="selectProvider(provider.id)"
                  >
                    <div class="provider-icon">{{ provider.icon }}</div>
                    <div class="provider-info">
                      <div class="provider-name">{{ provider.name }}</div>
                      <div class="provider-desc">{{ provider.desc }}</div>
                    </div>
                    <div class="provider-check">
                      <span v-if="userSettings.ai_provider === provider.id">✓</span>
                    </div>
                  </div>

                  <!-- 自定义提供商 -->
                  <div
                    v-for="provider in userSettings.custom_ai_providers"
                    :key="provider.id"
                    class="provider-item"
                    :class="{ active: userSettings.ai_provider === provider.id, dark: isDark }"
                    @click="selectProvider(provider.id)"
                  >
                    <div class="provider-icon">{{ provider.icon }}</div>
                    <div class="provider-info">
                      <div class="provider-name">{{ provider.name }}</div>
                      <div class="provider-desc">自定义 AI 提供商</div>
                    </div>
                    <div class="provider-actions">
                      <button
                        class="edit-provider-btn"
                        @click="startEditProvider(provider.id, $event)"
                        :class="{ dark: isDark }"
                        title="编辑提供商"
                      >
                        ✏️
                      </button>
                      <button
                        class="delete-provider-btn"
                        @click="deleteCustomProvider(provider.id, $event)"
                        :class="{ dark: isDark }"
                        title="删除提供商"
                      >
                        🗑️
                      </button>
                    </div>
                    <div class="provider-check">
                      <span v-if="userSettings.ai_provider === provider.id">✓</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 右边：提供商配置 -->
              <div class="ai-provider-content" :class="{ dark: isDark }">
                <div v-if="!userSettings.ai_provider" class="provider-empty-state">
                  <p>请选择一个 AI 提供商进行配置</p>
                </div>

                <div v-else class="provider-config-form">
                  <div class="config-header">
                    <h4>{{ getProviderConfigTitle() }}</h4>
                  </div>

                  <!-- API Key - 除了workers-ai都需要 -->
                  <div v-if="userSettings.ai_provider !== 'workers-ai'" class="form-group">
                    <label>{{ t('label.ai_api_key') }}</label>
                    <input
                      type="password"
                      v-model="userSettings.ai_api_key"
                      class="input-sm"
                      :class="{ dark: isDark }"
                      :placeholder="t('placeholder.ai_api_key')"
                    />
                  </div>

                  <!-- API URL - azure-openai和自定义提供商需要 -->
                  <div
                    v-if="
                      userSettings.ai_provider === 'azure-openai' ||
                      isCustomProvider(userSettings.ai_provider)
                    "
                    class="form-group"
                  >
                    <label>{{ t('label.ai_api_url') }}</label>
                    <input
                      type="url"
                      v-model="userSettings.ai_api_url"
                      class="input-sm"
                      :class="{ dark: isDark }"
                      :placeholder="
                        getDefaultApiUrlForProvider(userSettings.ai_provider || 'openai')
                      "
                    />
                  </div>

                  <!-- 模型名称 - 所有提供商都需要 -->
                  <div class="form-group">
                    <label>{{ t('label.ai_model_name') }}</label>
                    <input
                      type="text"
                      v-model="userSettings.ai_model_name"
                      class="input-sm"
                      :class="{ dark: isDark }"
                      :placeholder="
                        getDefaultModelNameForProvider(userSettings.ai_provider || 'openai')
                      "
                    />
                  </div>

                  <div class="form-actions">
                    <button
                      class="btn btn-primary btn-sm"
                      :class="{ dark: isDark, loading: isSavingSettings }"
                      @click="handleSaveAISettings"
                    >
                      {{ t('button.save_settings') }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- AI 工具栏设置 -->
            <div class="settings-card" style="margin-top: 20px">
              <div class="card-header">
                <h4>🔧 AI 工具栏</h4>
                <button class="btn btn-sm btn-primary" @click="showAddToolModal = true">
                  添加工具
                </button>
              </div>

              <div class="tools-list">
                <div v-for="tool in aiTools" :key="tool.id" class="tool-item">
                  <div class="tool-main" @click="tool.expanded = !tool.expanded">
                    <div class="tool-info">
                      <div class="tool-name">
                        <span class="expand-icon">{{ tool.expanded ? '▼' : '▶' }}</span>
                        {{ tool.name }}
                        <span v-if="tool.isDefault" class="tool-badge">默认</span>
                      </div>
                      <div class="tool-desc">{{ tool.description }}</div>
                    </div>
                    <div class="tool-actions" @click.stop>
                      <label class="toggle">
                        <input
                          type="checkbox"
                          v-model="tool.enabled"
                          @change="handleToggleTool(tool)"
                        />
                        <span class="slider"></span>
                      </label>
                      <button
                        v-if="!tool.isDefault"
                        class="btn-icon"
                        @click="editTool(tool)"
                        title="编辑"
                      >
                        ✏️
                      </button>
                      <button
                        v-if="!tool.isDefault"
                        class="btn-icon"
                        @click="deleteTool(tool.id)"
                        title="删除"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  <!-- 展开的详细信息 -->
                  <div v-if="tool.expanded" class="tool-details">
                    <div class="detail-section">
                      <div class="detail-title">提示词</div>
                      <div class="detail-content">
                        <code class="prompt-preview">{{ getToolPrompt(tool) }}</code>
                      </div>
                    </div>

                    <div
                      v-if="tool.parameters && tool.parameters.length > 0"
                      class="detail-section"
                    >
                      <div class="detail-title">参数列表</div>
                      <div class="detail-content">
                        <div v-for="param in tool.parameters" :key="param.name" class="param-item">
                          <span class="param-name">{{ param.name }}</span>
                          <span class="param-type">{{ param.type }}</span>
                          <span v-if="param.required" class="param-required">必填</span>
                          <span class="param-desc">{{ param.description }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div v-if="aiTools.length === 0" class="empty-state">暂无可用工具</div>
              </div>
            </div>
          </div>

          <!-- 头像设置 -->
          <div v-else-if="activeSettingsTab === 'avatar'" class="settings-panel">
            <h3>🖼️ {{ t('label.avatar_settings') }}</h3>
            <div class="settings-card">
              <!-- 当前头像预览 -->
              <div class="avatar-preview-section">
                <div class="avatar-preview">
                  <img v-if="avatarInput" :src="avatarInput" class="preview-image" />
                  <img
                    v-else-if="userAvatar"
                    :src="userAvatar"
                    class="preview-image"
                    @error="handleAvatarError"
                  />
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

              <!-- 操作按钮 - 重新创建 -->
              <div
                style="
                  display: flex;
                  flex-direction: row;
                  align-items: stretch;
                  justify-content: space-between;
                  gap: 12px;
                  margin-top: 24px;
                  width: 100%;
                "
              >
                <!-- 删除按钮 -->
                <button
                  v-if="userAvatar"
                  type="button"
                  :style="{
                    flex: '1',
                    height: '48px !important',
                    minHeight: '48px !important',
                    maxHeight: '48px !important',
                    padding: '0 24px !important',
                    fontSize: '15px !important',
                    fontWeight: '600 !important',
                    display: 'flex !important',
                    alignItems: 'center !important',
                    justifyContent: 'center !important',
                    borderRadius: '8px !important',
                    border: 'none !important',
                    cursor: 'pointer !important',
                    boxSizing: 'border-box !important',
                    lineHeight: '48px !important',
                    background: '#ef4444 !important',
                    color: 'white !important',
                  }"
                  :class="{ dark: isDark }"
                  @click="deleteAvatar"
                >
                  {{ t('button.delete_avatar') }}
                </button>
                <!-- 保存按钮 -->
                <button
                  type="button"
                  :disabled="isSaving"
                  :style="{
                    flex: '1',
                    height: '48px !important',
                    minHeight: '48px !important',
                    maxHeight: '48px !important',
                    padding: '0 24px !important',
                    fontSize: '15px !important',
                    fontWeight: '600 !important',
                    display: 'flex !important',
                    alignItems: 'center !important',
                    justifyContent: 'center !important',
                    borderRadius: '8px !important',
                    border: 'none !important',
                    cursor: isSaving ? 'not-allowed !important' : 'pointer !important',
                    boxSizing: 'border-box !important',
                    lineHeight: '48px !important',
                    background: isSaving ? '#94a3b8 !important' : '#3b82f6 !important',
                    color: 'white !important',
                    opacity: isSaving ? '0.6 !important' : '1 !important',
                  }"
                  :class="{ dark: isDark }"
                  @click="handleSaveAvatar"
                >
                  {{ isSaving ? t('label.saving') : t('button.save') }}
                </button>
              </div>
            </div>
          </div>

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

          <!-- 系统设置 -->
          <div
            v-else-if="activeSettingsTab === 'system' && hasPermission('users:manage')"
            class="settings-panel"
          >
            <h3>⚙️ {{ t('label.system_settings') }}</h3>

            <!-- Turnstile 人机验证设置 -->
            <div class="settings-card">
              <h4>{{ t('label.turnstile') }}</h4>
              <div class="setting-item">
                <label>{{ t('label.turnstile_enabled') }}</label>
                <label class="toggle">
                  <input type="checkbox" v-model="systemSettings.turnstile_enabled" />
                  <span class="slider"></span>
                </label>
              </div>
              <div class="setting-item" v-if="systemSettings.turnstile_enabled">
                <label>{{ t('label.turnstile_site_key') }}</label>
                <input
                  type="text"
                  v-model="systemSettings.turnstile_site_key"
                  :placeholder="t('placeholder.turnstile_site_key')"
                  class="input-sm"
                />
              </div>
              <div class="setting-item" v-if="systemSettings.turnstile_enabled">
                <label>{{ t('label.turnstile_secret_key') }}</label>
                <input
                  type="password"
                  v-model="systemSettings.turnstile_secret_key"
                  :placeholder="t('placeholder.turnstile_secret_key')"
                  class="input-sm"
                />
              </div>
              <div class="setting-hint" v-if="systemSettings.turnstile_enabled">
                {{ t('hint.turnstile') }}
              </div>
            </div>

            <!-- 自动清理设置 -->
            <div class="settings-card">
              <h4>🧹 {{ t('label.auto_cleanup') }}</h4>
              <div class="setting-item">
                <label>{{ t('label.cleanup_enabled') }}</label>
                <label class="toggle">
                  <input type="checkbox" v-model="systemSettings.cleanup_enabled" />
                  <span class="slider"></span>
                </label>
              </div>
              <div class="setting-item" v-if="systemSettings.cleanup_enabled">
                <label>{{ t('label.cleanup_push_history_days') }}</label>
                <input
                  type="number"
                  v-model.number="systemSettings.cleanup_push_history_days"
                  min="1"
                  max="365"
                  class="input-sm"
                />
              </div>
              <div class="setting-item" v-if="systemSettings.cleanup_enabled">
                <label>{{ t('label.cleanup_audit_log_days') }}</label>
                <input
                  type="number"
                  v-model.number="systemSettings.cleanup_audit_log_days"
                  min="1"
                  max="365"
                  class="input-sm"
                />
              </div>
              <div class="setting-hint" v-if="systemSettings.cleanup_enabled">
                {{ t('hint.auto_cleanup') }}
              </div>
            </div>

            <!-- CORS 配置 -->
            <div class="settings-card">
              <h4>🔒 {{ t('label.cors_settings') }}</h4>
              <div class="setting-item">
                <label>{{ t('label.cors_allowed_origins') }}</label>
                <div class="cors-list">
                  <div
                    v-for="(origin, index) in systemSettings.cors_allowed_origins"
                    :key="index"
                    class="cors-item"
                  >
                    <span>{{ origin }}</span>
                    <button class="btn btn-sm btn-danger" @click="removeCORSOrigin(index)">
                      ×
                    </button>
                  </div>
                  <div v-if="systemSettings.cors_allowed_origins.length === 0" class="empty-state">
                    {{ t('msg.no_cors_origins') }}
                  </div>
                </div>
              </div>
              <div class="setting-item">
                <label>{{ t('label.add_origin') }}</label>
                <div class="input-group">
                  <input
                    type="text"
                    v-model="newCORSOrigin"
                    placeholder="https://example.com"
                    @keyup.enter="addCORSOrigin"
                  />
                  <button class="btn btn-sm btn-primary" @click="addCORSOrigin">
                    {{ t('label.add') }}
                  </button>
                </div>
              </div>
              <div class="setting-hint">
                {{ t('hint.cors') }}
              </div>
            </div>

            <button
              class="btn btn-primary"
              @click="handleSaveSystemSettings"
              :disabled="isSavingSystemSettings"
            >
              {{ isSavingSystemSettings ? t('msg.saving_dots') : t('button.save_settings') }}
            </button>
          </div>

          <!-- 用户管理 -->
          <UserManagement
            v-else-if="activeSettingsTab === 'users' && hasPermission('users:manage')"
          />

          <!-- 数据库管理 -->
          <div
            v-else-if="activeSettingsTab === 'database' && hasPermission('users:manage')"
            class="settings-panel"
          >
            <h3>🗃️ {{ t('label.database_management') }}</h3>

            <!-- 数据库统计 -->
            <div class="settings-card">
              <h4>📊 {{ t('label.database_stats') }}</h4>
              <div class="stats-grid" v-if="!isLoadingStats">
                <div class="stat-item">
                  <span class="stat-value">{{
                    databaseStats.pushHistoryCount.toLocaleString()
                  }}</span>
                  <span class="stat-label">{{ t('label.push_history_count') }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-value">{{
                    databaseStats.auditLogsCount.toLocaleString()
                  }}</span>
                  <span class="stat-label">{{ t('label.audit_logs_count') }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-value">{{ databaseStats.usersCount.toLocaleString() }}</span>
                  <span class="stat-label">{{ t('label.users_count') }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-value">{{ databaseStats.estimatedSize }}</span>
                  <span class="stat-label">{{ t('label.estimated_size') }}</span>
                </div>
              </div>
              <div v-else class="loading">{{ t('msg.loading_dots') }}</div>
              <button
                class="btn btn-secondary"
                @click="loadDatabaseStats"
                :disabled="isLoadingStats"
              >
                🔄 {{ t('label.refresh_stats') }}
              </button>
            </div>

            <!-- 手动清理（使用系统设置中的配置） -->
            <div class="settings-card">
              <h4>🧹 {{ t('label.manual_cleanup') }}</h4>
              <div class="setting-hint">{{ t('hint.manual_cleanup') }}</div>
              <button class="btn btn-warning" @click="handleCleanup" :disabled="isCleaningUp">
                {{ isCleaningUp ? t('msg.cleaning_dots') : '🗑️ ' + t('button.cleanup_now') }}
              </button>
            </div>

            <!-- 数据归档 -->
            <div class="settings-card">
              <h4>📦 {{ t('label.data_archive') }}</h4>
              <div class="setting-hint">
                {{ t('hint.data_archive') }}
              </div>
              <button class="btn btn-primary" @click="handleArchive" :disabled="isArchiving">
                {{ isArchiving ? t('msg.archiving_dots') : '📦 ' + t('button.archive_to_r2') }}
              </button>
            </div>

            <!-- 归档列表 -->
            <div class="settings-card" v-if="archives.length > 0">
              <h4>📁 {{ t('label.archive_list') }}</h4>
              <div class="archive-list">
                <div v-for="archive in archives" :key="archive.key" class="archive-item">
                  <div class="archive-info">
                    <span class="archive-key">{{ archive.key }}</span>
                    <span class="archive-meta"
                      >{{ (archive.size / 1024).toFixed(1) }} KB | {{ archive.archivedAt }}</span
                    >
                  </div>
                  <button
                    class="btn btn-small"
                    @click="handleRestore(archive.key)"
                    :disabled="isRestoring"
                  >
                    {{ t('label.restore') }}
                  </button>
                </div>
              </div>
            </div>

            <!-- 数据库表管理 -->
            <div class="settings-card">
              <h4>📋 {{ t('label.table_management') }}</h4>
              <div class="setting-hint">
                {{ t('hint.table_management') }}
              </div>
              <div class="table-actions">
                <button
                  class="btn btn-secondary"
                  @click="loadDatabaseTables"
                  :disabled="isLoadingTables"
                >
                  {{ isLoadingTables ? t('msg.loading_dots') : '🔄 ' + t('button.refresh_tables') }}
                </button>
                <button
                  class="btn btn-warning"
                  @click="handleCleanupTables"
                  :disabled="isCleaningTables || isLoadingTables"
                >
                  {{ isCleaningTables ? t('msg.cleaning_dots') : '🧹 ' + t('button.cleanup_tables') }}
                </button>
              </div>
              <div class="table-list" v-if="!isLoadingTables">
                <div
                  v-for="table in databaseTables"
                  :key="table.name"
                  class="table-item"
                  :class="{ 'table-safe': table.isSafe, 'table-deletable': table.shouldDelete }"
                >
                  <div class="table-info">
                    <span class="table-name">{{ table.name }}</span>
                    <span class="table-meta">
                      <span v-if="table.rowCount !== undefined">{{ table.rowCount.toLocaleString() }} {{ t('label.rows') }}</span>
                      <span v-if="table.isSafe" class="badge badge-safe">{{ t('label.safe') }}</span>
                      <span v-if="table.shouldDelete" class="badge badge-deletable">{{ t('label.deletable') }}</span>
                    </span>
                  </div>
                  <button
                    v-if="!table.isSafe"
                    class="btn btn-small btn-danger"
                    @click="handleDeleteTable(table.name)"
                    :disabled="isDeletingTable"
                  >
                    {{ t('button.delete') }}
                  </button>
                </div>
              </div>
              <div v-else class="loading">{{ t('msg.loading_dots') }}</div>
            </div>
          </div>

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

/* 头像设置样式 */
.avatar-preview-section {
  margin-bottom: 20px;
}

.avatar-preview {
  width: 128px;
  height: 128px;
  border-radius: 50%;
  background: var(--bg-primary, #ffffff);
  border: 2px solid var(--border-color, #e0e0e0);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.avatar-preview.dark {
  background: var(--bg-dark-primary, #16162a);
  border-color: var(--border-dark-color, #333);
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-placeholder {
  font-size: 48px;
}

.upload-area {
  border: 2px dashed var(--border-color, #e0e0e0);
  border-radius: 8px;
  padding: 32px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--bg-primary, #ffffff);
}

.upload-area:hover {
  border-color: var(--primary-color, #6366f1);
  background: var(--bg-hover, #f0f0ff);
}

.upload-area.dark {
  background: var(--bg-dark-primary, #16162a);
  border-color: var(--border-dark-color, #333);
}

.upload-area.dark:hover {
  border-color: var(--primary-color, #6366f1);
  background: var(--bg-dark-hover, #2a2a3e);
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
  font-weight: 500;
  color: var(--text-primary, #1a1a2e);
  margin-bottom: 4px;
}

.upload-hint {
  display: block;
  font-size: 12px;
  color: var(--text-secondary, #666);
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #1a1a2e);
}

.form-group.dark label {
  color: var(--text-dark-primary, #ffffff);
}

.form-input {
  width: 100%;
  max-width: 400px;
  padding: 10px 12px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 14px;
  background: var(--bg-primary, #ffffff);
  color: var(--text-primary, #1a1a2e);
}

.form-input.dark {
  background: var(--bg-dark-primary, #16162a);
  border-color: var(--border-dark-color, #333);
  color: var(--text-dark-primary, #ffffff);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input[type='checkbox'] {
  width: 18px;
  height: 18px;
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
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
.settings-panel.dark .setting-item select {
  background: var(--bg-dark-primary, #16162a);
  border-color: var(--border-dark-color, #333);
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

/* ==================== AI 提供商卡片样式 ==================== */
.ai-provider-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 16px 0;
  max-height: 280px;
  overflow-y: auto;
  padding-right: 8px;
}

.ai-provider-list::-webkit-scrollbar {
  width: 6px;
}

.ai-provider-list::-webkit-scrollbar-track {
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 3px;
}

.ai-provider-list::-webkit-scrollbar-thumb {
  background: var(--border-color, #ccc);
  border-radius: 3px;
}

.ai-provider-list::-webkit-scrollbar-thumb:hover {
  background: #999;
}

.dark .ai-provider-list::-webkit-scrollbar-track {
  background: var(--bg-secondary, #3c3c3c);
}

.dark .ai-provider-list::-webkit-scrollbar-thumb {
  background: var(--border-color, #555);
}

.ai-provider-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: var(--bg-panel, white);
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.ai-provider-card:hover {
  border-color: #667eea;
  background: var(--bg-secondary, #f5f5f5);
}

.ai-provider-card.active {
  border-color: #667eea;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1));
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
}

.ai-provider-card.dark {
  background: var(--bg-panel, #2d2d2d);
  border-color: var(--border-color, #3c3c3c);
}

.ai-provider-card.dark:hover {
  border-color: #667eea;
  background: var(--bg-secondary, #3c3c3c);
}

.ai-provider-card.dark.active {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.15));
}

.provider-icon {
  font-size: 28px;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 10px;
  flex-shrink: 0;
}

.provider-info {
  flex: 1;
  min-width: 0;
}

.provider-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
  margin-bottom: 4px;
}

.ai-provider-card.dark .provider-name {
  color: var(--text-primary, #e0e0e0);
}

.provider-desc {
  font-size: 13px;
  color: var(--text-secondary, #666);
}

.ai-provider-card.dark .provider-desc {
  color: var(--text-secondary, #999);
}

.provider-check {
  font-size: 20px;
  color: #667eea;
  font-weight: bold;
  flex-shrink: 0;
}

.provider-config {
  margin-top: 16px;
  padding: 16px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 10px;
  border: 1px solid var(--border-color, #e0e0e0);
}

.provider-config.dark {
  background: var(--bg-secondary, #3c3c3c);
  border-color: var(--border-color, #4c4c4c);
}

.config-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.provider-config.dark .config-title {
  color: var(--text-primary, #e0e0e0);
  border-bottom-color: var(--border-color, #4c4c4c);
}

/* ==================== 自定义提供商添加按钮样式 ==================== */
.ai-provider-card.add-provider-btn {
  border: 2px dashed var(--border-color, #d0d0d0);
  background: transparent;
  cursor: pointer;
}

.ai-provider-card.add-provider-btn:hover {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.05);
}

.ai-provider-card.add-provider-btn.dark {
  border-color: var(--border-color, #4c4c4c);
}

.ai-provider-card.add-provider-btn.dark:hover {
  border-color: #8b5cf6;
  background: rgba(139, 92, 246, 0.1);
}

/* ==================== 删除提供商按钮样式 ==================== */
.provider-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.delete-provider-btn {
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  opacity: 0.6;
  transition: all 0.2s;
}

.delete-provider-btn:hover {
  opacity: 1;
  background: rgba(239, 68, 68, 0.1);
}

.delete-provider-btn.dark:hover {
  background: rgba(239, 68, 68, 0.2);
}

/* ==================== 图标选择器样式 ==================== */
.icon-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.icon-option {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 10px;
  background: var(--bg-primary, #fff);
  cursor: pointer;
  transition: all 0.2s;
}

.icon-option:hover {
  border-color: #667eea;
  transform: scale(1.1);
}

.icon-option.active {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.1);
}

.icon-option.dark {
  background: var(--bg-primary, #1e1e1e);
  border-color: var(--border-color, #3c3c3c);
}

.icon-option.dark:hover {
  border-color: #8b5cf6;
}

.icon-option.dark.active {
  border-color: #8b5cf6;
  background: rgba(139, 92, 246, 0.15);
}

/* ==================== AI 提供商左右布局样式 ==================== */
.ai-provider-layout {
  display: flex;
  gap: 16px;
  margin-top: 16px;
  min-height: 400px;
}

.ai-provider-sidebar {
  width: 320px;
  flex-shrink: 0;
  background: var(--bg-panel, white);
  border-radius: 12px;
  border: 1px solid var(--border-color, #e0e0e0);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ai-provider-sidebar.dark {
  background: var(--bg-panel, #2d2d2d);
  border-color: var(--border-color, #3c3c3c);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  background: var(--bg-secondary, #f8f9fa);
}

.dark .sidebar-header {
  background: var(--bg-secondary, #3c3c3c);
  border-bottom-color: var(--border-color, #4c4c4c);
}

.sidebar-title {
  font-weight: 600;
  font-size: 15px;
  color: var(--text-primary, #1a1a2e);
}

.dark .sidebar-title {
  color: var(--text-primary, #e0e0e0);
}

.btn-add-provider {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 2px solid var(--border-color, #e0e0e0);
  background: var(--bg-primary, white);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 20px;
  font-weight: bold;
  color: #667eea;
}

.btn-add-provider:hover {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.1);
}

.dark .btn-add-provider {
  background: var(--bg-primary, #1e1e1e);
  border-color: var(--border-color, #4c4c4c);
}

.dark .btn-add-provider:hover {
  border-color: #8b5cf6;
  background: rgba(139, 92, 246, 0.15);
}

.provider-list {
  padding: 12px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.provider-list::-webkit-scrollbar {
  width: 8px;
}

.provider-list::-webkit-scrollbar-track {
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 4px;
}

.provider-list::-webkit-scrollbar-thumb {
  background: var(--border-color, #ccc);
  border-radius: 4px;
}

.provider-list::-webkit-scrollbar-thumb:hover {
  background: #999;
}

.dark .provider-list::-webkit-scrollbar-track {
  background: var(--bg-secondary, #3c3c3c);
}

.dark .provider-list::-webkit-scrollbar-thumb {
  background: var(--border-color, #555);
}

.provider-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-panel, white);
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 8px;
}

.provider-item:hover {
  border-color: #667eea;
  background: var(--bg-secondary, #f5f5f5);
}

.provider-item.active {
  border-color: #667eea;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1));
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
}

.provider-item.dark {
  background: var(--bg-panel, #2d2d2d);
  border-color: var(--border-color, #3c3c3c);
}

.provider-item.dark:hover {
  border-color: #667eea;
  background: var(--bg-secondary, #3c3c3c);
}

.provider-item.dark.active {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.15));
}

.provider-item:last-child {
  margin-bottom: 0;
}

.edit-provider-btn,
.delete-provider-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 16px;
  opacity: 0.6;
}

.edit-provider-btn:hover,
.delete-provider-btn:hover {
  opacity: 1;
  background: var(--bg-secondary, #f0f0f0);
}

.dark .edit-provider-btn:hover,
.dark .delete-provider-btn:hover {
  background: var(--bg-secondary, #444);
}

/* AI 工具栏样式 */
.tools-list {
  max-height: 450px;
  overflow-y: auto;
}

.tool-item {
  background: var(--bg-primary, white);
  border-radius: 8px;
  margin-bottom: 8px;
  overflow: hidden;
  border: 1px solid var(--border-color, #e0e0e0);
  transition: all 0.2s ease;
}

.tool-item:hover {
  border-color: #e0e7ff;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.08);
}

.tool-item:last-child {
  margin-bottom: 0;
}

.tool-info {
  flex: 1;
  min-width: 0;
}

.tool-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 4px;
  font-weight: 500;
}

.tool-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.tool-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-icon {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 6px 10px;
  font-size: 16px;
  opacity: 0.5;
  transition: all 0.2s;
  border-radius: 6px;
}

.btn-icon:hover {
  opacity: 1;
  background: var(--bg-secondary, #f0f0f0);
}

/* 工具详情展开样式 */
.tool-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  min-width: 0;
}

.expand-icon {
  font-size: 10px;
  color: var(--text-secondary);
  margin-right: 8px;
  transition: transform 0.2s;
}

.tool-details {
  width: 100%;
  padding: 16px;
  background: linear-gradient(135deg, #f8f9ff 0%, #f0f4ff 100%);
  border-top: 2px solid #e0e7ff;
  margin-top: 8px;
  border-radius: 0 0 8px 8px;
}

.detail-section {
  margin-bottom: 16px;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.detail-title {
  font-size: 12px;
  font-weight: 700;
  color: #6366f1;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.detail-title::before {
  content: '▸';
  font-size: 10px;
}

.detail-content {
  font-size: 13px;
  line-height: 1.6;
}

.prompt-preview {
  display: block;
  background: var(--bg-primary, white);
  padding: 14px 16px;
  border-radius: 8px;
  border: 1px solid #e0e7ff;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-primary);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.05);
}

.param-item {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #e0e7ff;
}

.param-item:last-child {
  border-bottom: none;
}

.param-name {
  font-family: monospace;
  font-weight: 600;
  color: #6366f1;
  font-size: 13px;
}

.param-type {
  font-size: 11px;
  color: white;
  background: #64748b;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.param-required {
  font-size: 10px;
  color: #ef4444;
  background: #fef2f2;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 600;
}

.param-desc {
  font-size: 12px;
  color: var(--text-secondary);
  flex: 1;
  min-width: 100%;
  margin-top: 4px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
}

.card-header h4 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
}

.provider-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-primary, white);
  border: 2px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 8px;
}

.provider-item:last-child {
  margin-bottom: 0;
}

.provider-item:hover {
  background: var(--bg-secondary, #f5f5f5);
  border-color: var(--border-color, #e0e0e0);
}

.provider-item.active {
  border-color: #667eea;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.08), rgba(118, 75, 162, 0.08));
}

.provider-item.dark {
  background: var(--bg-primary, #1e1e1e);
}

.provider-item.dark:hover {
  background: var(--bg-secondary, #3c3c3c);
  border-color: var(--border-color, #4c4c4c);
}

.provider-item.dark.active {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.12), rgba(118, 75, 162, 0.12));
  border-color: #667eea;
}

.provider-item .provider-icon {
  font-size: 24px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 10px;
  flex-shrink: 0;
}

.provider-item .provider-info {
  flex: 1;
  min-width: 0;
}

.provider-item .provider-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
  margin-bottom: 2px;
}

.dark .provider-item .provider-name {
  color: var(--text-primary, #e0e0e0);
}

.provider-item .provider-desc {
  font-size: 12px;
  color: var(--text-secondary, #666);
}

.dark .provider-item .provider-desc {
  color: var(--text-secondary, #999);
}

.provider-item .provider-check {
  font-size: 18px;
  color: #667eea;
  font-weight: bold;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.provider-item .provider-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.provider-item .edit-provider-btn {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  opacity: 0.6;
  transition: all 0.2s;
}

.provider-item .edit-provider-btn:hover {
  opacity: 1;
  background: rgba(59, 130, 246, 0.1);
}

.provider-item .delete-provider-btn {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  opacity: 0.6;
  transition: all 0.2s;
}

.provider-item .delete-provider-btn:hover {
  opacity: 1;
  background: rgba(239, 68, 68, 0.1);
}

.ai-provider-content {
  flex: 1;
  background: var(--bg-panel, white);
  border-radius: 12px;
  border: 1px solid var(--border-color, #e0e0e0);
  padding: 24px;
  min-width: 0;
}

.ai-provider-content.dark {
  background: var(--bg-panel, #2d2d2d);
  border-color: var(--border-color, #3c3c3c);
}

.provider-empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 300px;
  color: var(--text-secondary, #888);
  font-size: 15px;
}

.provider-config-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-header {
  margin-bottom: 4px;
}

.config-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
}

.dark .config-header h4 {
  color: var(--text-primary, #e0e0e0);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #333);
}

.dark .form-group label {
  color: var(--text-primary, #ddd);
}

.form-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-start;
}

/* Form group input styles for AI provider config */
.form-group input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 14px;
  background: var(--bg-primary, #ffffff);
  color: var(--text-primary, #1a1a2e);
  transition: all 0.2s;
}

.form-group input:focus {
  outline: none;
  border-color: var(--primary-color, #6366f1);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.form-group input::placeholder {
  color: var(--text-secondary, #999);
}

.ai-provider-content.dark .form-group input {
  background: var(--bg-dark-primary, #16162a);
  border-color: var(--border-dark-color, #333);
  color: var(--text-dark-primary, #ffffff);
}

.ai-provider-content.dark .form-group input::placeholder {
  color: var(--text-dark-secondary, #666);
}

.ai-provider-content.dark .form-group input:focus {
  border-color: var(--primary-color, #6366f1);
}

/* ==================== 数据库管理样式 ==================== */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 10px;
  text-align: center;
}

.dark .stat-item {
  background: var(--bg-secondary, #2a2a3a);
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #667eea;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary, #666);
}

.dark .stat-label {
  color: var(--text-secondary, #999);
}

.settings-card .btn-secondary {
  margin-top: 12px;
  padding: 10px 20px;
  background: var(--bg-secondary, #f5f5f5);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.settings-card .btn-secondary:hover {
  background: var(--bg-secondary, #ebebeb);
}

.dark .settings-card .btn-secondary {
  background: var(--bg-secondary, #2a2a3a);
  border-color: var(--border-color, #4c4c4c);
  color: var(--text-primary, #e0e0e0);
}

.dark .settings-card .btn-secondary:hover {
  background: var(--bg-secondary, #3a3a4a);
}

.btn-warning {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
}

.btn-warning:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
}

.btn-small {
  padding: 6px 12px;
  font-size: 12px;
  background: var(--bg-secondary, #f5f5f5);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.dark .btn-small {
  background: var(--bg-secondary, #2a2a3a);
  border-color: var(--border-color, #4c4c4c);
  color: var(--text-primary, #e0e0e0);
}

.archive-list {
  max-height: 300px;
  overflow-y: auto;
}

.archive-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 8px;
  margin-bottom: 8px;
}

.dark .archive-item {
  background: var(--bg-secondary, #2a2a3a);
}

.archive-item:last-child {
  margin-bottom: 0;
}

.archive-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.archive-key {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #1a1a2e);
  word-break: break-all;
}

.dark .archive-key {
  color: var(--text-primary, #e0e0e0);
}

.archive-meta {
  font-size: 11px;
  color: var(--text-secondary, #666);
}

.dark .archive-meta {
  color: var(--text-secondary, #999);
}

.loading {
  text-align: center;
  padding: 20px;
  color: var(--text-secondary, #666);
}

/* ==================== CORS 配置样式 ==================== */
.cors-list {
  max-height: 160px;
  overflow-y: auto;
  padding: 8px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 8px;
  border: 1px solid var(--border-color, #e0e0e0);
}

.dark .cors-list {
  background: var(--bg-secondary, #3c3c3c);
  border-color: var(--border-color, #4c4c4c);
}

.cors-list::-webkit-scrollbar {
  width: 6px;
}

.cors-list::-webkit-scrollbar-track {
  background: transparent;
}

.cors-list::-webkit-scrollbar-thumb {
  background: var(--border-color, #ccc);
  border-radius: 3px;
}

.cors-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--bg-panel, white);
  border-radius: 6px;
  margin-bottom: 6px;
  border: 1px solid var(--border-color, #e0e0e0);
}

.dark .cors-item {
  background: var(--bg-panel, #2d2d2d);
  border-color: var(--border-color, #3c3c3c);
}

.cors-item:last-child {
  margin-bottom: 0;
}

.cors-item span {
  font-size: 13px;
  color: var(--text-primary, #1a1a2e);
  word-break: break-all;
  flex: 1;
}

.dark .cors-item span {
  color: var(--text-primary, #e0e0e0);
}

.cors-item .btn-danger {
  margin-left: 8px;
  padding: 4px 8px;
  font-size: 14px;
  line-height: 1;
}

.empty-state {
  text-align: center;
  padding: 16px;
  color: var(--text-secondary, #999);
  font-size: 13px;
}

.input-group {
  display: flex;
  gap: 8px;
}

.input-group input {
  flex: 1;
  padding: 10px 14px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  background: var(--bg-panel, white);
  color: var(--text-primary, #1a1a2e);
}

.dark .input-group input {
  background: var(--bg-panel, #2d2d2d);
  border-color: var(--border-color, #4c4c4c);
  color: var(--text-primary, #e0e0e0);
}

.input-group input:focus {
  border-color: #667eea;
}

.input-group .btn-sm {
  padding: 10px 16px;
  font-size: 14px;
}

/* ==================== 数据库表管理样式 ==================== */
.table-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.table-actions .btn-secondary {
  margin-top: 0;
  width: auto;
}

.table-list {
  max-height: 400px;
  overflow-y: auto;
}

.table-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-secondary, #f5f5f5);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  margin-bottom: 8px;
  transition: all 0.2s;
}

.table-item:hover {
  border-color: var(--border-color, #d0d0d0);
  background: var(--bg-tertiary, #e8e8e8);
}

.table-item.table-safe {
  border-left: 3px solid #10b981;
}

.table-item.table-deletable {
  border-left: 3px solid #f59e0b;
}

.dark .table-item {
  background: var(--bg-secondary, #2a2a3a);
  border-color: var(--border-color, #4c4c4c);
}

.dark .table-item:hover {
  background: var(--bg-tertiary, #3a3a4a);
  border-color: var(--border-color, #5c5c5c);
}

.table-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.table-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
  word-break: break-all;
}

.dark .table-name {
  color: var(--text-primary, #e0e0e0);
}

.table-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.badge {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.badge-safe {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.badge-deletable {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}
</style>
