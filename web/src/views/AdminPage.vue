<script setup lang="ts">
// ============================================
// 管理后台 - 多渠道推送管理（邮箱+密码认证）
// ============================================
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { register, login, getToken, refreshToken, getChannelsWithToken, saveChannelWithToken, sendPushWithToken, getHistoryWithToken, getApiKeyWithToken, createBackup, listBackups, restoreBackup, deleteBackup, saveS3Config, getS3Config, testS3Config } from '@/api';
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

// ==================== 备份设置变化时自动保存 ====================
let isLoadingConfig = false;

// ==================== 设置面板打开时加载 S3 配置和备份 ====================
watch(showSettings, (val) => {
  if (val) {
    loadS3Config();
    loadBackups();
  }
});

watch(backupEnabled, (newVal, oldVal) => {
  console.log('[Backup] backupEnabled changed:', { newVal, oldVal, isLoadingConfig });
  // 只在用户手动切换时保存，加载配置时不保存
  if (!isLoadingConfig && oldVal !== undefined) {
    console.log('[Backup] Saving backup settings...');
    doSaveBackupSettings();
  }
});
watch(backupHour, (newVal, oldVal) => {
  console.log('[Backup] backupHour changed:', { newVal, oldVal, isLoadingConfig });
  if (!isLoadingConfig && oldVal !== undefined) {
    console.log('[Backup] Saving backup settings...');
    doSaveBackupSettings();
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

// ==================== S3 配置 ====================
const s3Config = reactive({
  endpoint: '',
  accessKeyId: '',
  secretAccessKey: '',
  bucket: '',
  region: 'auto',
  path: '',
});
const s3Configured = ref(false);
const backupEnabled = ref(false);
const backupHour = ref(2); // 默认凌晨2点（北京时间）
const backupCron = computed(() => {
  // 北京时间转 UTC
  const utcHour = (backupHour.value + 24 - 8) % 24;
  return `0 ${utcHour} * * *`;
});
const isSavingS3Config = ref(false);
const isTestingS3Config = ref(false);

async function loadS3Config() {
  isLoadingConfig = true;
  try {
    const data = await getS3Config(accessToken.value);
    s3Configured.value = data.configured;
    if (data.config) {
      s3Config.endpoint = data.config.endpoint || '';
      s3Config.accessKeyId = data.config.accessKeyId || '';
      s3Config.secretAccessKey = ''; // 不回显密钥
      s3Config.bucket = data.config.bucket || '';
      s3Config.region = data.config.region || 'auto';
      s3Config.path = data.config.path || '';
      backupEnabled.value = data.config.enabled !== false; // 默认启用
      // 从 cron 解析小时（UTC 转北京时间）
      const cronMatch = (data.config.cron || '0 2 * * *').match(/0 (\d+) \* \* \*/);
      if (cronMatch) {
        const utcHour = parseInt(cronMatch[1], 10);
        backupHour.value = (utcHour + 8) % 24;
      }
    }
  } catch (err: any) {
    console.error('加载 S3 配置失败:', err);
  } finally {
    // 延迟重置标志，确保 watch 不会触发
    setTimeout(() => { isLoadingConfig = false; }, 100);
  }
}

async function doSaveS3Config() {
  isSavingS3Config.value = true;
  try {
    // 如果密钥为空，不传（后端会保留原值）
    const configToSave: any = { ...s3Config, enabled: backupEnabled.value, cron: backupCron.value, hour: backupHour.value };
    if (!configToSave.secretAccessKey) {
      delete configToSave.secretAccessKey;
    }
    await saveS3Config(accessToken.value, configToSave);
    s3Configured.value = true;
    channelMessages['s3'] = { text: 'S3 配置已保存', type: 'success' };
  } catch (err: any) {
    channelMessages['s3'] = { text: err.message || '保存失败', type: 'error' };
  }
  isSavingS3Config.value = false;
}

// 仅保存备份设置（开关、时间），不修改 S3 连接配置
async function doSaveBackupSettings() {
  console.log('[Backup] doSaveBackupSettings called, s3Configured:', s3Configured.value);
  if (!s3Configured.value) return; // 未配置 S3 时不保存
  isSavingS3Config.value = true;
  try {
    // 只传备份相关设置，让后端保留原 S3 配置
    const configToSave: any = {
      enabled: backupEnabled.value,
      cron: backupCron.value,
      hour: backupHour.value,
    };
    console.log('[Backup] Saving:', configToSave);
    await saveS3Config(accessToken.value, configToSave);
    channelMessages['s3'] = { text: '备份设置已保存', type: 'success' };
  } catch (err: any) {
    channelMessages['s3'] = { text: err.message || '保存失败', type: 'error' };
  }
  isSavingS3Config.value = false;
}

async function doTestS3Config() {
  isTestingS3Config.value = true;
  try {
    // 如果密钥为空，从后端获取原密钥用于测试
    const configToTest: any = { ...s3Config };
    if (!configToTest.secretAccessKey) {
      const data = await getS3Config(accessToken.value);
      if (data.config?.secretAccessKey === '***') {
        // 有配置但前端没密钥，提示用户先保存
        channelMessages['s3'] = { text: '请先填写 Secret Access Key 或保存配置后再测试', type: 'error' };
        isTestingS3Config.value = false;
        return;
      }
    }
    const result = await testS3Config(accessToken.value, configToTest);
    channelMessages['s3'] = { text: result.message, type: result.success ? 'success' : 'error' };
  } catch (err: any) {
    channelMessages['s3'] = { text: err.message || '测试失败', type: 'error' };
  }
  isTestingS3Config.value = false;
}

// ==================== 备份 ====================
const backups = ref<Array<{ key: string; size: number; lastModified: string }>>([]);
const isBackingUp = ref(false);
const backupsLoaded = ref(false);

async function doBackup() {
  isBackingUp.value = true;
  try {
    const result = await createBackup(accessToken.value);
    channelMessages['backup'] = { text: result.message, type: result.success ? 'success' : 'error' };
    if (result.success) await loadBackups();
  } catch (err: any) {
    channelMessages['backup'] = { text: err.message, type: 'error' };
  }
  isBackingUp.value = false;
}

async function loadBackups() {
  try {
    const data = await listBackups(accessToken.value);
    backups.value = data.backups || [];
    backupsLoaded.value = true;
  } catch (err: any) {
    console.error('加载备份列表失败:', err);
  }
}

async function doRestore(key: string) {
  if (!confirm('确定要从此备份恢复吗？这将覆盖当前所有数据！')) return;
  try {
    const result = await restoreBackup(accessToken.value, key);
    channelMessages['backup'] = { text: result.message, type: result.success ? 'success' : 'error' };
    if (result.success) {
      await loadChannels();
      await loadHistory();
    }
  } catch (err: any) {
    channelMessages['backup'] = { text: err.message, type: 'error' };
  }
}

async function doDeleteBackup(key: string) {
  if (!confirm('确定要删除此备份吗？')) return;
  try {
    await deleteBackup(accessToken.value, key);
    await loadBackups();
  } catch (err: any) {
    channelMessages['backup'] = { text: err.message, type: 'error' };
  }
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

        <!-- 数据备份面板 -->
        <div class="panel">
          <div class="backup-panel">
            <div class="backup-toggle">
              <h3>💾 数据备份</h3>
              <label class="toggle-switch">
                <input type="checkbox" v-model="backupEnabled" />
                <span class="toggle-slider"></span>
                <span class="toggle-label">{{ backupEnabled ? '已开启' : '已关闭' }}</span>
              </label>
            </div>
            <p class="hint">配置 S3 兼容存储后，可自动备份和恢复数据</p>

            <template v-if="backupEnabled">
            <div class="backup-cron-row">
              <label>备份频率</label>
              <select v-model="backupCron">
                <option value="0 */6 * * *">每6小时</option>
                <option value="0 */12 * * *">每12小时</option>
                <option value="0 2 * * *">每天一次</option>
                <option value="0 2 * * 1">每周一次（周一）</option>
                <option value="0 2 1 * *">每月一次（1号）</option>
              </select>
            </div>
            <div class="backup-cron-row">
              <label>备份时间</label>
              <select v-model="backupHour">
                <option v-for="h in 24" :key="h" :value="h - 1">{{ (h - 1).toString().padStart(2, '0') }}:00</option>
              </select>
              <span class="timezone-hint">北京时间 (UTC+8)</span>
            </div>

            <!-- S3 配置表单 -->
            <div class="s3-config-form">
              <div class="field-group">
                <label>Endpoint *</label>
                <input v-model="s3Config.endpoint" placeholder="https://s3.example.com" />
              </div>
              <div class="field-group">
                <label>Access Key ID *</label>
                <input v-model="s3Config.accessKeyId" placeholder="AKIA..." />
              </div>
              <div class="field-group">
                <label>Secret Access Key *</label>
                <input v-model="s3Config.secretAccessKey" type="password" placeholder="请输入密钥" />
              </div>
              <div class="field-group">
                <label>Bucket *</label>
                <input v-model="s3Config.bucket" placeholder="my-backup-bucket" />
              </div>
              <div class="field-group">
                <label>Region</label>
                <input v-model="s3Config.region" placeholder="auto" />
              </div>
              <div class="field-group">
                <label>备份路径</label>
                <input v-model="s3Config.path" placeholder="myapp/backups（留空默认 backups/用户名）" />
              </div>
              <div v-if="channelMessages['s3']" class="channel-save-message" :class="channelMessages['s3'].type">
                {{ channelMessages['s3'].text }}
              </div>
              <div class="field-actions">
                <button class="btn btn-secondary" @click="doSaveS3Config" :disabled="isSavingS3Config">
                  {{ isSavingS3Config ? '保存中...' : '保存配置' }}
                </button>
                <button class="btn btn-sm" @click="doTestS3Config" :disabled="isTestingS3Config">
                  {{ isTestingS3Config ? '测试中...' : '测试连接' }}
                </button>
              </div>
            </div>

            <!-- 备份管理（仅配置后显示） -->
            <div v-if="s3Configured" class="backup-section">
              <hr />
              <h4>备份管理</h4>

              <div v-if="channelMessages['backup']" class="channel-save-message" :class="channelMessages['backup'].type">
                {{ channelMessages['backup'].text }}
              </div>

              <div class="backup-actions">
                <button class="btn btn-secondary" @click="doBackup" :disabled="isBackingUp">
                  {{ isBackingUp ? '备份中...' : '立即备份' }}
                </button>
                <button class="btn btn-secondary" @click="loadBackups">
                  刷新列表
                </button>
              </div>

              <!-- 备份列表 -->
              <div v-if="backups.length" class="backup-list">
                <div v-for="b in backups" :key="b.key" class="backup-item">
                  <div class="backup-info">
                    <span class="backup-name">{{ formatBackupName(b.key) }}</span>
                    <span class="backup-meta">{{ formatBackupSize(b.size) }} · {{ formatBackupTime(b.lastModified) }}</span>
                  </div>
                  <div class="backup-actions-item">
                    <button class="btn btn-sm" @click="doRestore(b.key)">恢复</button>
                    <button class="btn btn-sm btn-warning" @click="doDeleteBackup(b.key)">删除</button>
                  </div>
                </div>
              </div>
              <div v-else-if="backupsLoaded" class="empty-hint">
                暂无备份
              </div>
            </div>
            </template>
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
</style>
