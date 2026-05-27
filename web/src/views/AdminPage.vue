<script setup lang="ts">
// ============================================
// 管理后台 - 多渠道推送管理（邮箱+密码认证）
// ============================================
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { register, login, getToken, refreshToken, getChannelsWithToken, saveChannelWithToken, sendPushWithToken, getHistoryWithToken, getApiKeyWithToken, createBackup, listBackups, restoreBackup, deleteBackup, saveS3Config, getS3Config, testS3Config, getBackupEndpoints, addBackupEndpoint, updateBackupEndpoint, deleteBackupEndpoint, testBackupEndpoint, listBackupsFromEndpoint, restoreBackupFromEndpoint, deleteBackupFromEndpoint, backupAll } from '@/api';
import type { BackupEndpoint } from '@/api';
import type { ChannelConfig, ChannelDefinition, ChannelSettings, PushChannel, PushResult, PushSubscription } from '@/types';

// ==================== 页面状态 ====================
const pageState = ref<'loading' | 'auth' | 'dashboard'>('loading');
const authMode = ref<'login' | 'register'>('login');

// ==================== 认证相关 ====================
const authEmail = ref('');
const authPassword = ref('');
const authConfirmPassword = ref('');
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

// ==================== 编辑状态（未保存的值） ====================
const editingValues = ref<ChannelSettings>({});

// ==================== 设置面板 ====================
const expandedChannels = ref<Set<string>>(new Set());
const savingChannels = reactive<Record<string, boolean>>({});
const channelMessages = reactive<Record<string, { text: string; type: 'success' | 'error' }>>({});



// ==================== 推送表单 ====================
const pushTitle = ref('');
const pushBody = ref('');
const pushUrl = ref('');
const isPushing = ref(false);
const pushResults = ref<PushResult[]>([]);

// ==================== 历史记录 ====================
const pushHistory = ref<any[]>([]);
const isLoadingHistory = ref(false);

// ==================== API Key ====================
const apiKey = ref('');

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
const lastPushTime = ref('-');
const enabledChannelCount = computed(() => channels.value.filter((c) => c.enabled).length);

// 设置 Tab 中显示的渠道定义（排除 webpush）
const settingsDefinitions = computed(() =>
  channelDefinitions.value.filter((d) => d.id !== 'webpush')
);

// ==================== 初始化 ====================
onMounted(async () => {
  try {
    // 尝试从 sessionStorage 恢复凭证
    const savedEmail = sessionStorage.getItem('push_hub_email');
    const savedPassword = sessionStorage.getItem('push_hub_password');
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
        sessionStorage.removeItem('push_hub_password');
        sessionStorage.removeItem('push_hub_token');
        sessionStorage.removeItem('push_hub_refresh_token');
        sessionStorage.removeItem('push_hub_expires_at');
      }
    } else if (savedEmail && savedPassword) {
      // 旧版本只有 email/password，尝试获取新 token
      email.value = savedEmail;
      password.value = savedPassword;
      try {
        const tokenData = await getToken(savedEmail, savedPassword);
        accessToken.value = tokenData.token;
        refreshTokenValue.value = tokenData.refreshToken;
        tokenExpiresAt.value = tokenData.expiresAt;
        sessionStorage.setItem('push_hub_email', savedEmail);
        sessionStorage.setItem('push_hub_password', savedPassword);
        sessionStorage.setItem('push_hub_token', tokenData.token);
        sessionStorage.setItem('push_hub_refresh_token', tokenData.refreshToken);
        sessionStorage.setItem('push_hub_expires_at', tokenData.expiresAt.toString());
        await loadChannels();
        pageState.value = 'dashboard';
        return;
      } catch {
        // 获取 token 失败，清除凭证
        sessionStorage.removeItem('push_hub_email');
        sessionStorage.removeItem('push_hub_password');
      }
    }
    pageState.value = 'auth';
  } catch {
    pageState.value = 'auth';
  }
});

// ==================== Tab 切换软刷新 ====================
watch(activeTab, (newTab) => {
  if (newTab === 'push') {
    loadChannels();
  }
  if (newTab === 'history') {
    loadHistory();
  }
});

// ==================== 认证函数 ====================
async function doLogin() {
  if (!authEmail.value.trim() || !authPassword.value) {
    authError.value = '请输入邮箱和密码';
    return;
  }
  isAuthing.value = true;
  authError.value = '';

  try {
    // 登录验证
    const res = await login(authEmail.value.trim(), authPassword.value);
    email.value = res.email || authEmail.value.trim();
    password.value = authPassword.value;

    // 获取 Token
    const tokenData = await getToken(authEmail.value.trim(), authPassword.value);
    accessToken.value = tokenData.token;
    refreshTokenValue.value = tokenData.refreshToken;
    tokenExpiresAt.value = tokenData.expiresAt;

    // 保存凭证到 sessionStorage
    sessionStorage.setItem('push_hub_email', email.value);
    sessionStorage.setItem('push_hub_password', password.value);
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

async function doRegister() {
  if (!authEmail.value.trim() || !authPassword.value) {
    authError.value = '请输入邮箱和密码';
    return;
  }
  if (authPassword.value.length < 4) {
    authError.value = '密码长度至少 4 位';
    return;
  }
  if (authPassword.value !== authConfirmPassword.value) {
    authError.value = '两次输入的密码不一致';
    return;
  }

  isAuthing.value = true;
  authError.value = '';

  try {
    await register(authEmail.value.trim(), authPassword.value);
    // 注册成功，自动登录
    await doLogin();
  } catch (err: any) {
    authError.value = err.message || '注册失败';
    isAuthing.value = false;
  }
}

function logout() {
  sessionStorage.removeItem('push_hub_email');
  sessionStorage.removeItem('push_hub_password');
  sessionStorage.removeItem('push_hub_token');
  sessionStorage.removeItem('push_hub_refresh_token');
  sessionStorage.removeItem('push_hub_expires_at');
  email.value = '';
  password.value = '';
  accessToken.value = '';
  refreshTokenValue.value = '';
  tokenExpiresAt.value = 0;
  authEmail.value = '';
  authPassword.value = '';
  authConfirmPassword.value = '';
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



// ==================== 设置相关 ====================
function isChannelConfigured(def: ChannelDefinition): boolean {
  // 只检查已保存的配置（channelSettings），不包含编辑中的值
  return def.fields.some((f) => {
    const key = `channel:${def.id}:${f.key}`;
    return channelSettings.value[key] && channelSettings.value[key].trim() !== '';
  });
}

function isChannelEnabled(channelId: string): boolean {
  const key = `channel:${channelId}:enabled`;
  const value = channelSettings.value[key];
  // 转换为字符串比较
  return String(value) !== 'false'; // 未设置或为 true 都视为启用
}

function canToggleChannel(def: ChannelDefinition): boolean {
  // 只要有任何配置（包括 enabled 字段）或已配置过，就能切换启用状态
  const prefix = `channel:${def.id}:`;
  for (const key of Object.keys(channelSettings.value)) {
    if (key.startsWith(prefix)) {
      return true;
    }
  }
  return isChannelConfigured(def);
}

const togglingChannel = ref<string | null>(null);

async function toggleChannelEnabled(channelId: string) {
  if (togglingChannel.value) return; // 防止重复点击
  togglingChannel.value = channelId;

  const key = `channel:${channelId}:enabled`;
  const current = channelSettings.value[key];
  // 转换为字符串比较
  const currentStr = String(current);
  const newValue = currentStr === 'false' ? 'true' : 'false';

  console.log('Toggle:', channelId, 'current:', current, 'new:', newValue, 'key:', key);

  try {
    const saveResult = await saveChannelWithToken(accessToken.value, channelId, { enabled: newValue });
    console.log('Save result:', saveResult);
    // 重新加载 channels 和 settings 以确保数据同步
    const data = await getChannelsWithToken(accessToken.value);
    const settingsKey = `channel:${channelId}:enabled`;
    console.log('Reloaded settings key:', settingsKey, 'value:', data.settings[settingsKey]);
    console.log('All settings:', JSON.stringify(data.settings));
    channels.value = data.channels;
    channelSettings.value = data.settings;
    channelDefinitions.value = data.definitions;
  } catch (err) {
    console.error('保存渠道启用状态失败:', err);
  } finally {
    togglingChannel.value = null;
  }
}

function getSettingValue(channelId: string, fieldKey: string): string {
  const key = `channel:${channelId}:${fieldKey}`;
  // 优先从编辑中的值读取，没有则从已保存的配置读取
  return editingValues.value[key] ?? channelSettings.value[key] ?? '';
}

function setSettingValue(channelId: string, fieldKey: string, value: string) {
  // 只修改编辑中的值，不影响已保存的配置状态
  editingValues.value[`channel:${channelId}:${fieldKey}`] = value;
}

function isFieldEdited(channelId: string, fieldKey: string): boolean {
  const key = `channel:${channelId}:${fieldKey}`;
  const edited = editingValues.value[key];
  const saved = channelSettings.value[key];
  // 有编辑值且与保存值不同
  return edited !== undefined && edited !== saved;
}

function hasUnsavedChanges(channelId: string): boolean {
  const prefix = `channel:${channelId}:`;
  for (const [key, edited] of Object.entries(editingValues.value)) {
    if (key.startsWith(prefix)) {
      const saved = channelSettings.value[key];
      if (edited !== saved) return true;
    }
  }
  return false;
}

function toggleChannelExpand(channelId: string) {
  if (expandedChannels.value.has(channelId)) {
    expandedChannels.value.delete(channelId);
  } else {
    // 清空并只展开当前
    expandedChannels.value.clear();
    expandedChannels.value.add(channelId);
  }
}

async function doSaveChannel(channelId: string) {
  if (savingChannels[channelId]) return;
  savingChannels[channelId] = true;
  delete channelMessages[channelId];

  try {
    const def = channelDefinitions.value.find((d) => d.id === channelId);
    if (!def) throw new Error('渠道不存在');

    // 收集该渠道的字段值（从 editingValues 或 channelSettings）
    const fields: Record<string, string> = {};
    for (const field of def.fields) {
      fields[field.key] = getSettingValue(channelId, field.key);
    }

    const result = await saveChannelWithToken(accessToken.value, channelId, fields);
    channels.value = result.channels;
    // 重新加载设置以确保同步
    const data = await getChannelsWithToken(accessToken.value);
    channelSettings.value = data.settings;
    channelDefinitions.value = data.definitions;
    // 保存成功后，清空该渠道的编辑值
    for (const field of def.fields) {
      const key = `channel:${channelId}:${field.key}`;
      delete editingValues.value[key];
    }
    channelMessages[channelId] = { text: result.message || '保存成功', type: 'success' };
  } catch (err: any) {
    channelMessages[channelId] = { text: err.message || '保存失败', type: 'error' };
  }

  savingChannels[channelId] = false;
}

async function doTestChannel(channelId: string) {
  const def = channelDefinitions.value.find((d) => d.id === channelId);
  if (!def) return;

  // 优先使用编辑中的值，没有则用已保存的值
  const fields: Record<string, string> = {};
  for (const field of def.fields) {
    const editKey = `channel:${channelId}:${field.key}`;
    fields[field.key] = editingValues.value[editKey] ?? channelSettings.value[editKey] ?? '';
  }

  // 检查是否已配置
  const isConfigured = def.fields.filter(f => f.required).every(f => !!fields[f.key]);
  if (!isConfigured) {
    channelMessages[channelId] = { text: '请先配置必填项', type: 'error' };
    return;
  }

  // 调用 sendPush 发送测试
  try {
    const result = await sendPushWithToken(accessToken.value, {
      title: '测试消息',
      body: '这是一条来自蜂群的测试消息',
      channels: [channelId as any],
    });

    const channelResult = result.results?.find((r) => r.channel === channelId);
    channelMessages[channelId] = {
      text: channelResult?.message || result.message || '测试完成',
      type: channelResult?.success ? 'success' : 'error'
    };
  } catch (err: any) {
    channelMessages[channelId] = { text: err.message || '测试失败', type: 'error' };
  }
}

// ==================== 推送相关 ====================
function toggleChannel(ch: ChannelConfig) {
  if (!ch.enabled) return;
  if (selectedChannels.value.has(ch.id)) {
    selectedChannels.value.delete(ch.id);
  } else {
    selectedChannels.value.add(ch.id);
  }
  saveChannelSelection();
}

// 保存渠道选择到 sessionStorage
function saveChannelSelection() {
  const selected = channels.value.filter(c => c.selected).map(c => c.id);
  sessionStorage.setItem('push_selected_channels', JSON.stringify(selected));
}

// 从 sessionStorage 恢复渠道选择
function restoreChannelSelection() {
  const saved = sessionStorage.getItem('push_selected_channels');
  if (saved) {
    const selectedIds = JSON.parse(saved);
    channels.value.forEach(c => {
      c.selected = selectedIds.includes(c.id);
    });
  }
}

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

    const result = await sendPushWithToken(accessToken.value, payload);
    pushResults.value = result.results;
    lastPushTime.value = new Date().toLocaleTimeString('zh-CN');

    if (result.success) {
      pushTitle.value = '';
      pushBody.value = '';
      pushUrl.value = '';
    }
    // 刷新历史记录
    await loadHistory();
  } catch (err: any) {
    pushResults.value = [{ channel: 'webpush', success: false, message: err.message }];
  }

  isPushing.value = false;
}

// 检查是否是"未选择推送渠道"的错误
function isNoChannelSelectedError(results: PushResult[]): boolean {
  if (results.length === 0) return false;
  return results.every(r => !r.success && r.message === '未选择推送渠道');
}

// ==================== 多备份端配置 ====================
const backupEndpoints = ref<BackupEndpoint[]>([]);
const selectedEndpointId = ref<string | null>(null);
const isLoadingEndpoints = ref(false);
const isSavingEndpoint = ref(false);
const isTestingEndpoint = ref(false);
const isDeletingEndpoint = ref(false);
const isBackingUpAll = ref(false);
const endpointMessage = ref<{ text: string; type: 'success' | 'error' } | null>(null);

// 当前选中备份端的备份列表
const endpointBackups = ref<Array<{ key: string; size: number; lastModified: string }>>([]);
const isLoadingEndpointBackups = ref(false);

// 编辑中的备份端数据
const editingEndpoint = reactive<Partial<BackupEndpoint>>({
  name: '',
  type: 's3',
  enabled: true,
  config: {},
  schedule: {
    enabled: false,
    interval: 24,
    startTime: '02:00'
  },
  retention: 30
});

const isCreatingNew = ref(false);

// 计算选中的备份端
const selectedEndpoint = computed(() => {
  if (isCreatingNew.value) return null;
  return backupEndpoints.value.find(e => e.id === selectedEndpointId.value) || null;
});

// 清理后的 endpoint（去除反引号和空格）
const cleanEndpointUrl = computed(() => {
  const url = editingEndpoint.config?.endpoint || editingEndpoint.config?.url || '';
  return url.replace(/[`\s]/g, '');
});

// 加载备份端列表
async function loadBackupEndpoints() {
  isLoadingEndpoints.value = true;
  try {
    const data = await getBackupEndpoints(accessToken.value);
    backupEndpoints.value = data.endpoints || [];
    // 如果当前选中的不存在了，重置选择
    if (selectedEndpointId.value && !backupEndpoints.value.find(e => e.id === selectedEndpointId.value)) {
      selectedEndpointId.value = backupEndpoints.value.length > 0 ? backupEndpoints.value[0].id : null;
    }
    // 默认选中第一个
    if (!selectedEndpointId.value && backupEndpoints.value.length > 0) {
      selectedEndpointId.value = backupEndpoints.value[0].id;
    }
  } catch (err: any) {
    console.error('加载备份端列表失败:', err);
    endpointMessage.value = { text: err.message || '加载备份端列表失败', type: 'error' };
  } finally {
    isLoadingEndpoints.value = false;
  }
}

// 选择备份端
function selectEndpoint(id: string) {
  selectedEndpointId.value = id;
  isCreatingNew.value = false;
  endpointMessage.value = null;
  loadEndpointBackups();
  // 复制数据到编辑状态
  const endpoint = backupEndpoints.value.find(e => e.id === id);
  if (endpoint) {
    copyEndpointToEditing(endpoint);
  }
}

// 复制备份端数据到编辑状态
function copyEndpointToEditing(endpoint: BackupEndpoint) {
  editingEndpoint.name = endpoint.name;
  editingEndpoint.type = endpoint.type;
  editingEndpoint.enabled = endpoint.enabled;
  editingEndpoint.config = { ...endpoint.config };
  // 不复制敏感信息
  if (editingEndpoint.config) {
    delete editingEndpoint.config.secretAccessKey;
    delete editingEndpoint.config.password;
  }
  editingEndpoint.schedule = { ...endpoint.schedule };
  editingEndpoint.retention = endpoint.retention;
}

// 开始创建新备份端
function startCreateEndpoint() {
  isCreatingNew.value = true;
  selectedEndpointId.value = null;
  endpointMessage.value = null;
  endpointBackups.value = [];
  // 重置编辑数据
  editingEndpoint.name = '';
  editingEndpoint.type = 's3';
  editingEndpoint.enabled = true;
  editingEndpoint.config = {};
  editingEndpoint.schedule = {
    enabled: false,
    interval: 24,
    startTime: '02:00'
  };
  editingEndpoint.retention = 30;
}

// 取消创建
function cancelCreateEndpoint() {
  isCreatingNew.value = false;
  endpointMessage.value = null;
  if (backupEndpoints.value.length > 0) {
    selectedEndpointId.value = backupEndpoints.value[0].id;
    copyEndpointToEditing(backupEndpoints.value[0]);
  }
}

// 保存备份端（创建或更新）
async function saveEndpoint() {
  if (!editingEndpoint.name?.trim()) {
    endpointMessage.value = { text: '请输入备份端名称', type: 'error' };
    return;
  }

  isSavingEndpoint.value = true;
  endpointMessage.value = null;

  try {
    const endpointData: Omit<BackupEndpoint, 'id'> = {
      name: editingEndpoint.name.trim(),
      type: editingEndpoint.type || 's3',
      enabled: editingEndpoint.enabled ?? true,
      config: { ...editingEndpoint.config },
      schedule: { ...editingEndpoint.schedule },
      retention: editingEndpoint.retention || 30
    };

    // 清理 endpoint URL
    if (endpointData.config) {
      if (endpointData.config.endpoint) {
        endpointData.config.endpoint = endpointData.config.endpoint.replace(/[`\s]/g, '');
      }
      if (endpointData.config.url) {
        endpointData.config.url = endpointData.config.url.replace(/[`\s]/g, '');
      }
    }

    if (isCreatingNew.value) {
      // 创建新备份端
      const result = await addBackupEndpoint(accessToken.value, endpointData);
      if (result.success) {
        backupEndpoints.value.push(result.endpoint);
        selectedEndpointId.value = result.endpoint.id;
        isCreatingNew.value = false;
        endpointMessage.value = { text: '备份端创建成功', type: 'success' };
        copyEndpointToEditing(result.endpoint);
      }
    } else if (selectedEndpointId.value) {
      // 更新现有备份端
      const result = await updateBackupEndpoint(accessToken.value, selectedEndpointId.value, endpointData);
      if (result.success) {
        const index = backupEndpoints.value.findIndex(e => e.id === selectedEndpointId.value);
        if (index !== -1) {
          backupEndpoints.value[index] = result.endpoint;
        }
        endpointMessage.value = { text: '备份端更新成功', type: 'success' };
        copyEndpointToEditing(result.endpoint);
      }
    }
  } catch (err: any) {
    endpointMessage.value = { text: err.message || '保存失败', type: 'error' };
  } finally {
    isSavingEndpoint.value = false;
  }
}

// 删除备份端
async function deleteEndpoint() {
  if (!selectedEndpointId.value) return;
  if (!confirm('确定要删除此备份端吗？相关的备份数据不会被删除。')) return;

  isDeletingEndpoint.value = true;
  try {
    await deleteBackupEndpoint(accessToken.value, selectedEndpointId.value);
    backupEndpoints.value = backupEndpoints.value.filter(e => e.id !== selectedEndpointId.value);
    selectedEndpointId.value = backupEndpoints.value.length > 0 ? backupEndpoints.value[0].id : null;
    if (selectedEndpointId.value) {
      const endpoint = backupEndpoints.value.find(e => e.id === selectedEndpointId.value);
      if (endpoint) copyEndpointToEditing(endpoint);
    }
    endpointMessage.value = { text: '备份端已删除', type: 'success' };
  } catch (err: any) {
    endpointMessage.value = { text: err.message || '删除失败', type: 'error' };
  } finally {
    isDeletingEndpoint.value = false;
  }
}

// 测试备份端连接
async function testEndpoint() {
  if (!selectedEndpointId.value && !isCreatingNew.value) return;

  isTestingEndpoint.value = true;
  endpointMessage.value = null;

  try {
    const configToTest = { ...editingEndpoint.config };
    if (configToTest.endpoint) {
      configToTest.endpoint = configToTest.endpoint.replace(/[`\s]/g, '');
    }
    if (configToTest.url) {
      configToTest.url = configToTest.url.replace(/[`\s]/g, '');
    }

    let result;
    if (isCreatingNew.value) {
      // 新备份端，直接测试配置
      result = await testBackupEndpoint(accessToken.value, 'new', configToTest);
    } else {
      result = await testBackupEndpoint(accessToken.value, selectedEndpointId.value!, configToTest);
    }

    endpointMessage.value = {
      text: result.message,
      type: result.success ? 'success' : 'error'
    };
  } catch (err: any) {
    endpointMessage.value = { text: err.message || '测试失败', type: 'error' };
  } finally {
    isTestingEndpoint.value = false;
  }
}

// 加载选中备份端的备份列表
async function loadEndpointBackups() {
  if (!selectedEndpointId.value) return;
  isLoadingEndpointBackups.value = true;
  try {
    const data = await listBackupsFromEndpoint(accessToken.value, selectedEndpointId.value);
    endpointBackups.value = data.backups || [];
  } catch (err: any) {
    console.error('加载备份列表失败:', err);
    endpointBackups.value = [];
  } finally {
    isLoadingEndpointBackups.value = false;
  }
}

// 从备份端恢复
async function restoreFromEndpoint(key: string) {
  if (!selectedEndpointId.value) return;
  if (!confirm('确定要从此备份恢复吗？这将覆盖当前所有数据！')) return;

  try {
    const result = await restoreBackupFromEndpoint(accessToken.value, selectedEndpointId.value, key);
    endpointMessage.value = { text: result.message, type: result.success ? 'success' : 'error' };
    if (result.success) {
      await loadChannels();
      await loadHistory();
    }
  } catch (err: any) {
    endpointMessage.value = { text: err.message || '恢复失败', type: 'error' };
  }
}

// 删除备份端上的备份
async function deleteEndpointBackup(key: string) {
  if (!selectedEndpointId.value) return;
  if (!confirm('确定要删除此备份吗？')) return;

  try {
    await deleteBackupFromEndpoint(accessToken.value, selectedEndpointId.value, key);
    await loadEndpointBackups();
    endpointMessage.value = { text: '备份已删除', type: 'success' };
  } catch (err: any) {
    endpointMessage.value = { text: err.message || '删除失败', type: 'error' };
  }
}

// 手动触发所有备份
async function doBackupAll() {
  isBackingUpAll.value = true;
  try {
    const result = await backupAll(accessToken.value);
    const successCount = result.results.filter(r => r.success).length;
    const totalCount = result.results.length;
    endpointMessage.value = {
      text: `备份完成: ${successCount}/${totalCount} 成功`,
      type: successCount === totalCount ? 'success' : 'error'
    };
    // 刷新备份列表和备份端状态
    await loadBackupEndpoints();
    if (selectedEndpointId.value) {
      await loadEndpointBackups();
    }
  } catch (err: any) {
    endpointMessage.value = { text: err.message || '备份失败', type: 'error' };
  } finally {
    isBackingUpAll.value = false;
  }
}

// 格式化备份端状态
function getEndpointStatusText(endpoint: BackupEndpoint): string {
  if (!endpoint.enabled) return '已禁用';
  if (!endpoint.lastBackup) return '未备份';
  return endpoint.lastBackup.status === 'success' ? '正常' : '失败';
}

function getEndpointStatusClass(endpoint: BackupEndpoint): string {
  if (!endpoint.enabled) return 'status-disabled';
  if (!endpoint.lastBackup) return 'status-pending';
  return endpoint.lastBackup.status === 'success' ? 'status-success' : 'status-error';
}

// 格式化备份时间
function formatLastBackupTime(endpoint: BackupEndpoint): string {
  if (!endpoint.lastBackup?.time) return '从未';
  const date = new Date(endpoint.lastBackup.time);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString('zh-CN');
}

// ==================== 备份设置变化时自动保存 ====================
watch(showSettings, (val, oldVal) => {
  // 只在打开设置面板时加载，关闭时不加载
  if (val && oldVal === false) {
    loadBackupEndpoints();
  }
});

// ==================== 旧版备份兼容（保留用于过渡） ====================
const backups = ref<Array<{ key: string; size: number; lastModified: string }>>([]);
const isBackingUp = ref(false);
const backupsLoaded = ref(false);

async function loadBackups() {
  // 新版使用 loadEndpointBackups
  backupsLoaded.value = true;
}

function formatBackupName(key: string): string {
  const match = key.match(/backups\/(.+)\.json/);
  return match ? match[1].replace(/-/g, ' ') : key;
}

function formatBackupSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatBackupTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN');
}

// ==================== 工具函数 ====================
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

  <!-- 登录/注册 -->
  <div v-else-if="pageState === 'auth'" class="login-overlay">
    <div class="login-card">
      <h2>🐝 蜂群</h2>
      <p>多渠道推送管理系统</p>

      <!-- Tab 切换 -->
      <div class="auth-tabs">
        <button
          class="auth-tab-btn"
          :class="{ active: authMode === 'login' }"
          @click="authMode = 'login'; authError = ''"
        >
          登录
        </button>
        <button
          class="auth-tab-btn"
          :class="{ active: authMode === 'register' }"
          @click="authMode = 'register'; authError = ''"
        >
          注册
        </button>
      </div>

      <!-- 登录表单 -->
      <form v-if="authMode === 'login'" @submit.prevent="doLogin">
        <input
          v-model="authEmail"
          type="text"
          placeholder="邮箱"
          autocomplete="email"
        />
        <input
          v-model="authPassword"
          type="password"
          placeholder="密码"
          autocomplete="current-password"
          @keydown.enter="doLogin"
        />
        <div v-if="authError" class="login-error">{{ authError }}</div>
        <button class="btn btn-primary" type="submit" :disabled="isAuthing">
          {{ isAuthing ? '登录中...' : '登 录' }}
        </button>
      </form>

      <!-- 注册表单 -->
      <form v-else @submit.prevent="doRegister">
        <input
          v-model="authEmail"
          type="text"
          placeholder="邮箱"
          autocomplete="email"
        />
        <input
          v-model="authPassword"
          type="password"
          placeholder="密码（至少 4 位）"
          autocomplete="new-password"
        />
        <input
          v-model="authConfirmPassword"
          type="password"
          placeholder="确认密码"
          autocomplete="new-password"
          @keydown.enter="doRegister"
        />
        <div v-if="authError" class="login-error">{{ authError }}</div>
        <button class="btn btn-primary" type="submit" :disabled="isAuthing">
          {{ isAuthing ? '注册中...' : '注 册' }}
        </button>
      </form>
    </div>
  </div>

  <!-- 主界面 -->
  <div v-else class="page">
    <header class="header">
      <div class="header-left">
        <h1>🐝 蜂群</h1>
        <span class="header-email">{{ email }}</span>
      </div>
      <div class="header-right">
        <button class="btn btn-sm" @click="showSettings = !showSettings">
          {{ showSettings ? '收起设置' : '⚙️ 设置' }}
        </button>
        <span class="logout" @click="logout">退出</span>
      </div>
    </header>

    <div class="container">
      <!-- 设置面板 -->
      <div v-if="showSettings" class="tab-content">
        <!-- API Key 面板 -->
        <div class="panel">
          <div class="api-key-panel">
            <h3>🔑 API Key</h3>
            <p class="hint">使用 API Key 调用推送接口，无需暴露账号密码。刷新将生成新 Key，旧 Key 立即失效。</p>
            <div v-if="apiKey" class="api-key-display">
              <code>{{ apiKey }}</code>
              <button class="btn btn-sm btn-warning" @click="loadApiKey(true)">重新生成</button>
            </div>
            <div v-else>
              <button class="btn btn-secondary" @click="loadApiKey()">生成 API Key</button>
            </div>
          </div>
        </div>

        <!-- 数据备份面板（多备份端） -->
        <div class="panel">
          <div class="backup-panel">
            <div class="backup-header">
              <h3>💾 数据备份</h3>
              <button class="btn btn-sm btn-primary" @click="doBackupAll" :disabled="isBackingUpAll">
                {{ isBackingUpAll ? '备份中...' : '立即备份全部' }}
              </button>
            </div>
            <p class="hint">配置多个备份端，数据将同时备份到所有启用的地点</p>

            <!-- 多备份端布局 -->
            <div class="backup-endpoints-layout">
              <!-- 左侧：备份端列表 -->
              <div class="endpoints-sidebar">
                <div class="sidebar-header">
                  <span class="sidebar-title">备份地点</span>
                  <button class="btn-add-endpoint" @click="startCreateEndpoint" title="添加备份地点">
                    <span>+</span>
                  </button>
                </div>

                <div v-if="isLoadingEndpoints" class="endpoints-loading">
                  <div class="loading-spinner-small"></div>
                  <span>加载中...</span>
                </div>

                <div v-else-if="backupEndpoints.length === 0 && !isCreatingNew" class="endpoints-empty">
                  <p>暂无备份地点</p>
                  <button class="btn btn-secondary btn-sm" @click="startCreateEndpoint">添加第一个备份地点</button>
                </div>

                <div v-else class="endpoints-list">
                  <div
                    v-for="endpoint in backupEndpoints"
                    :key="endpoint.id"
                    class="endpoint-item"
                    :class="{ active: selectedEndpointId === endpoint.id && !isCreatingNew }"
                    @click="selectEndpoint(endpoint.id)"
                  >
                    <div class="endpoint-icon">
                      {{ endpoint.type === 's3' ? '🪣' : '📁' }}
                    </div>
                    <div class="endpoint-info">
                      <div class="endpoint-name">{{ endpoint.name }}</div>
                      <div class="endpoint-meta">
                        <span class="endpoint-type">{{ endpoint.type.toUpperCase() }}</span>
                        <span class="endpoint-time">{{ formatLastBackupTime(endpoint) }}</span>
                      </div>
                    </div>
                    <div class="endpoint-status">
                      <span class="status-dot" :class="getEndpointStatusClass(endpoint)"></span>
                    </div>
                  </div>

                  <!-- 新建项 -->
                  <div v-if="isCreatingNew" class="endpoint-item active creating">
                    <div class="endpoint-icon">➕</div>
                    <div class="endpoint-info">
                      <div class="endpoint-name">新备份地点</div>
                      <div class="endpoint-meta">
                        <span class="endpoint-type">配置中...</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 右侧：备份端详情 -->
              <div class="endpoints-content">
                <div v-if="!selectedEndpointId && !isCreatingNew" class="endpoint-empty-state">
                  <p>请从左侧选择一个备份地点，或添加新的备份地点</p>
                </div>

                <div v-else class="endpoint-form">
                  <!-- 基本信息 -->
                  <div class="form-section">
                    <h4>基本信息</h4>
                    <div class="form-row">
                      <div class="form-group">
                        <label>名称 *</label>
                        <input v-model="editingEndpoint.name" placeholder="如：阿里云OSS、坚果云" />
                      </div>
                      <div class="form-group">
                        <label>类型 *</label>
                        <select v-model="editingEndpoint.type">
                          <option value="s3">S3 兼容存储</option>
                          <option value="webdav">WebDAV</option>
                        </select>
                      </div>
                    </div>
                    <div class="form-row">
                      <div class="form-group checkbox-group">
                        <label class="checkbox-label">
                          <input type="checkbox" v-model="editingEndpoint.enabled" />
                          <span>启用自动备份</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <!-- S3 配置 -->
                  <div v-if="editingEndpoint.type === 's3'" class="form-section">
                    <h4>S3 配置</h4>
                    <div class="form-row">
                      <div class="form-group">
                        <label>Endpoint *</label>
                        <input v-model="editingEndpoint.config.endpoint" placeholder="https://s3.example.com" />
                      </div>
                      <div class="form-group">
                        <label>Region</label>
                        <input v-model="editingEndpoint.config.region" placeholder="auto" />
                      </div>
                    </div>
                    <div class="form-row">
                      <div class="form-group">
                        <label>Access Key ID *</label>
                        <input v-model="editingEndpoint.config.accessKeyId" placeholder="AKIA..." />
                      </div>
                      <div class="form-group">
                        <label>Secret Access Key {{ isCreatingNew ? '*' : '(留空保留原值)' }}</label>
                        <input v-model="editingEndpoint.config.secretAccessKey" type="password" :placeholder="isCreatingNew ? '请输入密钥' : '已配置（留空保留）'" />
                      </div>
                    </div>
                    <div class="form-row">
                      <div class="form-group">
                        <label>Bucket *</label>
                        <input v-model="editingEndpoint.config.bucket" placeholder="my-backup-bucket" />
                      </div>
                      <div class="form-group">
                        <label>根目录（可选）</label>
                        <input v-model="editingEndpoint.config.path" placeholder="默认: beeswarm" />
                      </div>
                    </div>
                    <div class="form-row">
                      <div class="form-group checkbox-group">
                        <label class="checkbox-label">
                          <input type="checkbox" v-model="editingEndpoint.config.pathStyle" />
                          <span>使用 Path-Style URL（部分 S3 服务商需要）</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <!-- WebDAV 配置 -->
                  <div v-else class="form-section">
                    <h4>WebDAV 配置</h4>
                    <div class="form-row">
                      <div class="form-group">
                        <label>URL *</label>
                        <input v-model="editingEndpoint.config.url" placeholder="https://dav.example.com/backup" />
                      </div>
                    </div>
                    <div class="form-row">
                      <div class="form-group">
                        <label>用户名 *</label>
                        <input v-model="editingEndpoint.config.username" placeholder="username" />
                      </div>
                      <div class="form-group">
                        <label>密码 {{ isCreatingNew ? '*' : '(留空保留原值)' }}</label>
                        <input v-model="editingEndpoint.config.password" type="password" :placeholder="isCreatingNew ? '请输入密码' : '已配置（留空保留）'" />
                      </div>
                    </div>
                  </div>

                  <!-- 调度设置 -->
                  <div class="form-section">
                    <h4>调度设置</h4>
                    <div class="form-row">
                      <div class="form-group">
                        <label>备份间隔（小时）</label>
                        <select v-model="editingEndpoint.schedule.interval">
                          <option :value="1">每小时</option>
                          <option :value="6">每6小时</option>
                          <option :value="12">每12小时</option>
                          <option :value="24">每天</option>
                          <option :value="168">每周</option>
                        </select>
                      </div>
                      <div class="form-group">
                        <label>开始时间</label>
                        <input v-model="editingEndpoint.schedule.startTime" type="time" />
                      </div>
                    </div>
                  </div>

                  <!-- 保留策略 -->
                  <div class="form-section">
                    <h4>保留策略</h4>
                    <div class="form-row">
                      <div class="form-group">
                        <label>保留份数</label>
                        <input v-model.number="editingEndpoint.retention" type="number" min="1" max="365" />
                        <span class="input-hint">最多保留 {{ editingEndpoint.retention }} 份备份，旧备份将自动删除</span>
                      </div>
                    </div>
                  </div>

                  <!-- 消息提示 -->
                  <div v-if="endpointMessage" class="endpoint-message" :class="endpointMessage.type">
                    {{ endpointMessage.text }}
                  </div>

                  <!-- 操作按钮 -->
                  <div class="endpoint-actions">
                    <button v-if="isCreatingNew" class="btn" @click="cancelCreateEndpoint">
                      取消
                    </button>
                    <button v-if="!isCreatingNew" class="btn btn-warning" @click="deleteEndpoint" :disabled="isDeletingEndpoint">
                      {{ isDeletingEndpoint ? '删除中...' : '删除' }}
                    </button>
                    <button class="btn" @click="testEndpoint" :disabled="isTestingEndpoint">
                      {{ isTestingEndpoint ? '测试中...' : '测试连接' }}
                    </button>
                    <button class="btn btn-primary" @click="saveEndpoint" :disabled="isSavingEndpoint">
                      {{ isSavingEndpoint ? '保存中...' : (isCreatingNew ? '创建' : '保存') }}
                    </button>
                  </div>

                  <!-- 当前备份端的备份列表 -->
                  <div v-if="!isCreatingNew && selectedEndpoint" class="endpoint-backups-section">
                    <hr />
                    <h4>备份列表</h4>
                    <div v-if="isLoadingEndpointBackups" class="backups-loading">
                      <div class="loading-spinner-small"></div>
                      <span>加载备份列表...</span>
                    </div>
                    <div v-else-if="endpointBackups.length === 0" class="backups-empty">
                      暂无备份
                    </div>
                    <div v-else class="backup-list">
                      <div v-for="b in endpointBackups" :key="b.key" class="backup-item">
                        <div class="backup-info">
                          <span class="backup-name">{{ formatBackupName(b.key) }}</span>
                          <span class="backup-meta">{{ formatBackupSize(b.size) }} · {{ formatBackupTime(b.lastModified) }}</span>
                        </div>
                        <div class="backup-actions-item">
                          <button class="btn btn-sm" @click="restoreFromEndpoint(b.key)">恢复</button>
                          <button class="btn btn-sm btn-warning" @click="deleteEndpointBackup(b.key)">删除</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="panel">
          <h2>⚙️ 渠道设置</h2>
          <p class="hint" style="margin-bottom: 20px;">配置各推送渠道的连接参数，每个渠道可独立保存。</p>

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
                  <span v-if="hasUnsavedChanges(def.id)" class="unsaved-hint">(未保存)</span>
                  <span v-if="!canToggleChannel(def)" class="status-tag status-unconfigured">
                    未配置
                  </span>
                  <span
                    v-else
                    class="status-tag"
                    :class="isChannelEnabled(def.id) ? 'status-enabled' : 'status-disabled'"
                    @click.stop="toggleChannelEnabled(def.id)"
                  >
                    {{ isChannelEnabled(def.id) ? '已启用' : '已禁用' }}
                  </span>
                </div>
                <span class="expand-arrow" :class="{ expanded: expandedChannels.has(def.id) }">
                  ▾
                </span>
              </div>

              <!-- 卡片内容（配置表单 + 独立保存按钮） -->
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

                <!-- 该渠道独立的保存按钮和提示 -->
                <div class="channel-save-area">
                  <div
                    v-if="channelMessages[def.id]"
                    class="channel-save-message"
                    :class="channelMessages[def.id].type"
                  >
                    {{ channelMessages[def.id].text }}
                  </div>
                  <button
                    class="btn btn-secondary btn-sm"
                    @click="doTestChannel(def.id)"
                  >
                    测试
                  </button>
                  <button
                    class="btn btn-primary btn-sm"
                    :disabled="savingChannels[def.id]"
                    @click="doSaveChannel(def.id)"
                  >
                    {{ savingChannels[def.id] ? '保存中...' : '💾 保存' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 推送/历史 Tab（当设置面板关闭时显示） -->
      <template v-else>
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
            :class="{ active: activeTab === 'history' }"
            @click="activeTab = 'history'"
          >
            推送历史
          </button>
        </div>

        <!-- ==================== 推送 Tab ==================== -->
        <div v-if="activeTab === 'push'" class="tab-content">
          <!-- 统计概览 -->
          <div class="stats">
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
                  v-for="ch in channels.filter(c => c.enabled)"
                  :key="ch.id"
                  class="channel-tag"
                  :class="{ active: selectedChannels.has(ch.id) }"
                  @click="toggleChannel(ch)"
                >
                  <span class="ch-icon">{{ ch.icon }}</span>
                  <span class="ch-name">{{ ch.name }}</span>
                </div>
              </div>
              <p class="hint">点击选择/取消。不选择则不推送。</p>
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

            <!-- 推送结果 -->
            <div v-if="pushResults.length" class="result-list">
              <template v-if="isNoChannelSelectedError(pushResults)">
                <div class="result-item error">
                  <span>⚠️ 未选择任何推送渠道，请先选择后再推送</span>
                </div>
              </template>
              <template v-else>
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
              </template>
            </div>
          </div>
        </div>

        <!-- ==================== 历史记录 Tab ==================== -->
        <div v-if="activeTab === 'history'" class="tab-content">
          <div class="panel">
            <h2>📜 推送历史</h2>

            <div v-if="isLoadingHistory" class="loading-placeholder">
              <div class="loading-spinner"></div>
              <p>加载中...</p>
            </div>

            <div v-else-if="pushHistory.length === 0" class="empty">
              <p>暂无推送记录</p>
            </div>

            <div v-else class="history-list">
              <div
                v-for="(record, index) in pushHistory"
                :key="index"
                class="history-item"
              >
                <div class="history-header">
                  <div class="history-title">{{ record.title }}</div>
                  <div class="history-time">{{ new Date(record.time).toLocaleString('zh-CN') }}</div>
                </div>
                <div v-if="record.body" class="history-body">{{ record.body }}</div>
                <div v-if="record.url" class="history-url">
                  <a :href="record.url" target="_blank" rel="noopener">{{ record.url }}</a>
                </div>
                <div class="history-results">
                  <div
                    v-for="result in record.results"
                    :key="result.channel"
                    class="history-result"
                    :class="result.success ? 'success' : 'error'"
                  >
                    <span class="result-status">{{ result.success ? '✓' : '✗' }}</span>
                    <span class="result-channel">{{ channels.find((c) => c.id === result.channel)?.icon || '' }} {{ result.channel }}</span>
                    <span class="result-message">{{ result.message }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

    </div>
  </div>
</template>

<style scoped>
/* ==================== 加载中 ==================== */

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

/* ==================== 登录/注册 ==================== */

.login-overlay {
  position: fixed;
  inset: 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.login-card {
  background: white;
  border-radius: 16px;
  padding: 40px;
  width: 380px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.login-card h2 {
  margin-bottom: 4px;
  color: #1a1a2e;
  font-size: 24px;
}

.login-card > p {
  color: #999;
  font-size: 13px;
  margin-bottom: 24px;
}

.login-card form {
  display: flex;
  flex-direction: column;
}

.login-card input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 15px;
  margin-bottom: 12px;
  box-sizing: border-box;
  transition: border-color 0.3s;
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

/* ==================== Auth Tabs ==================== */

.auth-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 24px;
  background: #f5f5f5;
  border-radius: 8px;
  padding: 4px;
}

.auth-tab-btn {
  flex: 1;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: transparent;
  color: #999;
  transition: all 0.2s;
}

.auth-tab-btn:hover {
  color: #666;
}

.auth-tab-btn.active {
  background: white;
  color: #667eea;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

/* ==================== 主页面 ==================== */

.page {
  min-height: 100vh;
  background: #f0f2f5;
}

.header {
  background: white;
  padding: 16px 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header h1 {
  font-size: 20px;
  color: #1a1a2e;
}

.header-email {
  font-size: 13px;
  color: #999;
  background: #f5f5f5;
  padding: 4px 12px;
  border-radius: 20px;
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

.unsaved-hint {
  color: #f59e0b;
  font-size: 13px;
  font-weight: 500;
  margin-left: 8px;
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
  padding: 8px 18px;
  font-size: 13px;
}

.btn-warning {
  background-color: #f59e0b;
  color: white;
  border-color: #f59e0b;
}

.btn-warning:hover {
  background-color: #d97706;
  border-color: #d97706;
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
}

.channel-card {
  background: white;
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
  background: #f8f8fc;
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
  cursor: pointer;
}

.status-tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  cursor: pointer;
}
.status-enabled {
  background: #d1fae5;
  color: #065f46;
}
.status-disabled {
  background: #e5e7eb;
  color: #6b7280;
}
.status-unconfigured {
  background: #f3f4f6;
  color: #9ca3af;
  cursor: not-allowed;
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
  border-top: 1px solid #f0f0f0;
  padding-top: 16px;
}

/* ==================== 渠道独立保存区域 ==================== */

.channel-save-area {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
}

.channel-save-message {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
}

.channel-save-message.success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.channel-save-message.error {
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

/* ==================== 历史记录 ==================== */

.loading-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  gap: 12px;
  color: #999;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 600px;
  overflow-y: auto;
}

.history-item {
  background: #f8f9fa;
  border-radius: 10px;
  padding: 16px;
  border: 1px solid #eee;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.history-title {
  font-weight: 600;
  font-size: 15px;
  color: #1a1a2e;
}

.history-time {
  font-size: 12px;
  color: #999;
}

.history-body {
  font-size: 13px;
  color: #666;
  margin-bottom: 8px;
  line-height: 1.5;
}

.history-url {
  font-size: 12px;
  margin-bottom: 8px;
}

.history-url a {
  color: #667eea;
  text-decoration: none;
}

.history-url a:hover {
  text-decoration: underline;
}

.history-results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.history-result {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 6px;
}

.history-result.success {
  background: #d4edda;
  color: #155724;
}

.history-result.error {
  background: #f8d7da;
  color: #721c24;
}

.result-status {
  font-weight: bold;
}

.result-channel {
  font-weight: 500;
  min-width: 80px;
}

.result-message {
  color: inherit;
  opacity: 0.9;
}

/* ==================== API Key ==================== */

.api-key-panel {
  background: #f8f9fa;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 0;
}

.api-key-panel h3 {
  font-size: 16px;
  color: #1a1a2e;
  margin-bottom: 8px;
  padding-bottom: 0;
  border-bottom: none;
}

.api-key-display {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-top: 12px;
}

.api-key-display code {
  background: #e9ecef;
  padding: 8px 12px;
  border-radius: 4px;
  font-family: monospace;
  word-break: break-all;
  flex: 1;
  font-size: 13px;
}

/* ==================== 数据备份 ==================== */

.backup-panel {
  background: #f8f9fa;
  padding: 16px;
  border-radius: 8px;
}

.backup-panel h3 {
  font-size: 16px;
  color: #1a1a2e;
  margin-bottom: 8px;
  padding-bottom: 0;
  border-bottom: none;
}

/* ==================== S3 配置表单 ==================== */

.s3-config-form {
  margin-top: 12px;
}

.s3-config-form .field-group {
  margin-bottom: 12px;
}

.s3-config-form .field-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.s3-config-form .field-group input {
  width: 100%;
  padding: 8px 12px;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  font-size: 13px;
  box-sizing: border-box;
  transition: border-color 0.3s;
}

.s3-config-form .field-group input:focus {
  outline: none;
  border-color: #667eea;
}

.field-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-top: 12px;
}

.backup-section {
  margin-top: 16px;
}

.backup-section h4 {
  font-size: 15px;
  color: #1a1a2e;
  margin-bottom: 12px;
}

.backup-section hr {
  border: none;
  border-top: 1px solid #e0e0e0;
  margin: 16px 0;
}

.backup-actions {
  display: flex;
  gap: 10px;
  margin: 12px 0;
}

.backup-list {
  margin-top: 12px;
}

.backup-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: white;
  border-radius: 8px;
  margin-bottom: 6px;
}

.backup-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.backup-name {
  font-weight: 500;
  font-size: 14px;
}

.backup-meta {
  font-size: 12px;
  color: #6b7280;
}

.backup-actions-item {
  display: flex;
  gap: 6px;
}

.empty-hint {
  text-align: center;
  color: #9ca3af;
  padding: 20px;
  font-size: 14px;
}

.backup-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toggle-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.toggle-switch input {
  display: none;
}

.toggle-slider {
  width: 40px;
  height: 22px;
  background: #d1d5db;
  border-radius: 11px;
  position: relative;
  transition: background 0.2s;
}

.toggle-slider::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
}

.toggle-switch input:checked + .toggle-slider {
  background: #667eea;
}

.toggle-switch input:checked + .toggle-slider::after {
  transform: translateX(18px);
}

.toggle-label {
  font-size: 13px;
  color: #6b7280;
}

.backup-cron-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 12px 0;
}

.backup-cron-row label {
  font-size: 14px;
  font-weight: 500;
  color: #374151;
}

.backup-cron-row select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  background: white;
  color: #374151;
  cursor: pointer;
}

.timezone-hint {
  font-size: 12px;
  color: #9ca3af;
}

/* ==================== 多备份端布局 ==================== */

.backup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.backup-header h3 {
  font-size: 16px;
  color: #1a1a2e;
  margin: 0;
  padding: 0;
  border: none;
}

.backup-endpoints-layout {
  display: flex;
  gap: 20px;
  margin-top: 16px;
  min-height: 400px;
}

/* 左侧边栏 */
.endpoints-sidebar {
  width: 240px;
  flex-shrink: 0;
  background: #f8f9fa;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e0e0e0;
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}

.btn-add-endpoint {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  background: #667eea;
  color: white;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-add-endpoint:hover {
  background: #5a6fd6;
  transform: scale(1.05);
}

.endpoints-loading,
.endpoints-empty {
  text-align: center;
  padding: 24px 12px;
  color: #9ca3af;
  font-size: 13px;
}

.endpoints-empty p {
  margin-bottom: 12px;
}

.endpoints-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  max-height: 400px;
}

.endpoint-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.endpoint-item:hover {
  background: white;
  border-color: #e0e0e0;
}

.endpoint-item.active {
  background: white;
  border-color: #667eea;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
}

.endpoint-item.creating {
  background: #f0f0ff;
  border-color: #667eea;
  border-style: dashed;
}

.endpoint-icon {
  font-size: 20px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border-radius: 8px;
  flex-shrink: 0;
}

.endpoint-info {
  flex: 1;
  min-width: 0;
}

.endpoint-name {
  font-size: 14px;
  font-weight: 500;
  color: #1a1a2e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.endpoint-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}

.endpoint-type {
  font-size: 11px;
  color: #667eea;
  background: #f0f0ff;
  padding: 1px 6px;
  border-radius: 4px;
}

.endpoint-time {
  font-size: 11px;
  color: #9ca3af;
}

.endpoint-status {
  flex-shrink: 0;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: block;
}

.status-dot.status-success {
  background: #10b981;
}

.status-dot.status-error {
  background: #ef4444;
}

.status-dot.status-disabled {
  background: #9ca3af;
}

.status-dot.status-pending {
  background: #f59e0b;
}

/* 右侧内容区 */
.endpoints-content {
  flex: 1;
  min-width: 0;
}

.endpoint-empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 300px;
  color: #9ca3af;
  font-size: 14px;
}

.endpoint-form {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
}

.form-section {
  margin-bottom: 20px;
}

.form-section h4 {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e0e0e0;
}

.form-row {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
}

.form-row .form-group {
  flex: 1;
  margin-bottom: 0;
}

.form-row .form-group.checkbox-group {
  flex: none;
  display: flex;
  align-items: center;
}

.endpoint-form .form-group label {
  font-size: 13px;
  font-weight: 500;
  color: #4b5563;
  margin-bottom: 6px;
}

.endpoint-form .form-group input,
.endpoint-form .form-group select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  background: white;
  box-sizing: border-box;
}

.endpoint-form .form-group input:focus,
.endpoint-form .form-group select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.input-hint {
  display: block;
  font-size: 12px;
  color: #9ca3af;
  margin-top: 4px;
}

.endpoint-message {
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 16px;
}

.endpoint-message.success {
  background: #d1fae5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}

.endpoint-message.error {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.endpoint-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid #e0e0e0;
}

.endpoint-backups-section {
  margin-top: 20px;
}

.endpoint-backups-section h4 {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 12px;
}

.backups-loading,
.backups-empty {
  text-align: center;
  padding: 20px;
  color: #9ca3af;
  font-size: 13px;
}

.loading-spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid #e0e0e0;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
  margin-right: 8px;
  vertical-align: middle;
}

/* 响应式布局 */
@media (max-width: 768px) {
  .backup-endpoints-layout {
    flex-direction: column;
  }

  .endpoints-sidebar {
    width: 100%;
    max-height: 200px;
  }

  .endpoints-list {
    max-height: 150px;
  }

  .form-row {
    flex-direction: column;
    gap: 12px;
  }
}
</style>
