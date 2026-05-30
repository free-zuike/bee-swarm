<template>
  <div class="group-manager">
    <div class="panel">
      <div class="panel-header">
        <h2>📁 {{ t('groups.title') }}</h2>
        <div class="header-actions">
          <button class="btn btn-sm btn-secondary" @click="showFilters = !showFilters">
            🔍 {{ showFilters ? '收起' : '筛选' }}
          </button>
          <button class="btn btn-sm btn-secondary" @click="toggleSort">
            {{ sortOrder === 'asc' ? '↑ 名称升序' : '↓ 名称降序' }}
          </button>
          <button class="btn btn-primary" @click="openCreateModal" :disabled="saving">
            + {{ t('groups.create') }}
          </button>
        </div>
      </div>

      <!-- 筛选面板 -->
      <div v-if="showFilters" class="filter-bar">
        <div class="filter-group">
          <label>搜索分组</label>
          <input v-model="searchQuery" type="text" placeholder="输入分组名称..." class="filter-input" />
        </div>
        <div class="filter-group">
          <label>包含渠道</label>
          <select v-model="filterChannel" class="filter-select">
            <option value="">全部渠道</option>
            <option v-for="ch in allChannels" :key="ch.id" :value="ch.id">
              {{ ch.icon }} {{ ch.name }}
            </option>
          </select>
        </div>
        <button class="btn btn-sm btn-secondary" @click="clearFilters">重置</button>
      </div>

      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <span>{{ t('common.loading') || '加载中...' }}</span>
      </div>

      <div v-else-if="displayGroups.length === 0" class="empty-state">
        <div class="empty-icon"></div>
        <p>{{ groups.length === 0 ? t('groups.empty') : '没有符合条件的分组' }}</p>
      </div>

      <div v-else class="group-list">
        <div v-for="group in displayGroups" :key="group.id" class="group-card">
          <div class="group-main">
            <div class="group-top">
              <div class="group-name-row">
                <h3 class="group-name">{{ group.name }}</h3>
                <div class="group-tags">
                  <span v-for="ch in group.channels" :key="ch" class="tag tag-channel">{{ getChannelName(ch) }}</span>
                </div>
              </div>
            </div>
            <div class="group-body">
              <div class="field-row">
                <span class="field-label">渠道</span>
                <span class="field-value">{{ group.channels.length }} 个渠道</span>
              </div>
              <div class="field-row">
                <span class="field-label">创建时间</span>
                <span class="field-value">{{ formatTime(group.createdAt) }}</span>
              </div>
            </div>
          </div>
          <div class="group-actions">
            <button class="action-btn action-use" @click="useGroup(group)">使用</button>
            <button class="action-btn action-test" @click="testGroup(group)" :disabled="testingGroup === group.id">
              {{ testingGroup === group.id ? '测试中...' : '测试' }}
            </button>
            <button class="action-btn action-edit" @click="editGroup(group)">编辑</button>
            <button class="action-btn action-delete" @click="confirmDelete(group)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ editingGroup ? t('groups.edit') : t('groups.create') }}</h3>
          <button class="btn-close" @click="closeModal">&times;</button>
        </div>
        <form @submit.prevent="saveGroup" class="modal-body">
          <div class="form-group">
            <label>{{ t('groups.name') }} *</label>
            <input v-model="form.name" type="text" :placeholder="t('groups.namePlaceholder')" required />
          </div>
          <div class="form-group">
            <label>{{ t('groups.channels') }}</label>
            <div class="channels-grid">
              <label v-for="ch in availableChannels" :key="ch.id" class="channel-checkbox" :class="{ 'channel-disabled': !ch.enabled }">
                <input type="checkbox" :value="ch.id" v-model="form.channels" :disabled="!ch.enabled" />
                <span class="channel-icon">{{ ch.icon }}</span>
                <span>{{ ch.name }}</span>
              </label>
            </div>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="closeModal">{{ t('common.cancel') }}</button>
            <button type="submit" class="btn btn-primary" :disabled="saving || form.channels.length === 0">
              {{ saving ? (t('common.saving') || '保存中...') : (t('common.save') || '保存') }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="showDeleteConfirm" class="modal-overlay" @click.self="showDeleteConfirm = false">
      <div class="modal modal-small">
        <div class="modal-header">
          <h3>{{ t('groups.confirmDelete') }}</h3>
          <button class="btn-close" @click="showDeleteConfirm = false">&times;</button>
        </div>
        <div class="modal-body">
          <p>{{ t('groups.deleteConfirm', { name: deletingGroup?.name }) }}</p>
          <div class="form-actions">
            <button class="btn btn-secondary" @click="showDeleteConfirm = false">{{ t('common.cancel') }}</button>
            <button class="btn btn-danger" @click="doDelete" :disabled="deleting">
              {{ deleting ? (t('common.deleting') || '删除中...') : t('common.delete') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 测试推送结果 -->
    <div v-if="testResult" class="modal-overlay" @click.self="testResult = null">
      <div class="modal modal-small">
        <div class="modal-header">
          <h3>分组推送测试</h3>
          <button class="btn-close" @click="testResult = null">&times;</button>
        </div>
        <div class="modal-body">
          <div class="test-result" :class="{ success: testResult.success }">
            <p class="test-status">{{ testResult.success ? '✅ 测试成功' : '❌ 测试失败' }}</p>
            <div v-for="r in testResult.results" :key="r.channel" class="test-channel-result" :class="{ success: r.success }">
              <span class="test-channel-icon">{{ getChannelIcon(r.channel) }}</span>
              <span class="test-channel-name">{{ getChannelName(r.channel) }}</span>
              <span class="test-channel-status">{{ r.success ? '成功' : '失败' }}</span>
            </div>
            <p class="test-message">{{ testResult.message }}</p>
          </div>
          <div class="form-actions">
            <button class="btn btn-secondary" @click="testResult = null">关闭</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { t } from '@/i18n';
import { useGlobalToast } from '@/composables/useToast';
import {
  getChannelGroups,
  createChannelGroup,
  deleteChannelGroup,
  updateChannelGroup,
  dispatchPush,
  type ChannelGroup,
  type PushChannel,
  type ChannelConfig,
} from '@/api';

const { showToast } = useGlobalToast();

const emit = defineEmits<{
  (e: 'use-group', channels: PushChannel[]): void;
}>();

const props = defineProps<{
  accessToken: string;
  channels?: ChannelConfig[];
}>();

const loading = ref(true);
const saving = ref(false);
const deleting = ref(false);
const showModal = ref(false);
const showDeleteConfirm = ref(false);
const showFilters = ref(false);
const editingGroup = ref<ChannelGroup | null>(null);
const deletingGroup = ref<ChannelGroup | null>(null);
const groups = ref<ChannelGroup[]>([]);
const searchQuery = ref('');
const filterChannel = ref('');
const sortOrder = ref<'asc' | 'desc'>('asc');
const testingGroup = ref<string | null>(null);

interface TestResult {
  success: boolean;
  message: string;
  results: Array<{ channel: string; success: boolean; message: string }>;
}

const testResult = ref<TestResult | null>(null);

const form = reactive({
  name: '',
  channels: [] as PushChannel[],
});

const allChannels = computed(() => {
  const channelNameMap: Record<string, string> = {
    wework: '企业微信',
    dingtalk: '钉钉',
    feishu: '飞书',
    telegram: 'Telegram',
    discord: 'Discord',
    slack: 'Slack',
    mail: '邮件',
    webhook: 'Webhook',
    bark: 'Bark',
    pushplus: 'PushPlus',
  };
  const channelIconMap: Record<string, string> = {
    wework: '💼',
    dingtalk: '🅰️',
    feishu: '🪶',
    telegram: '✈️',
    bark: '📱',
    ntfy: '📢',
    email: '📧',
    slack: '💬',
    discord: '🎮',
  };
  return (props.channels || []).filter((c) => c.enabled).map((c) => ({
    id: c.id,
    name: channelNameMap[c.id] || c.id,
    icon: channelIconMap[c.id] || '📡',
    enabled: true,
  }));
});

const availableChannels = computed(() => {
  const channelNameMap: Record<string, string> = {
    wework: '企业微信',
    dingtalk: '钉钉',
    feishu: '飞书',
    telegram: 'Telegram',
    discord: 'Discord',
    slack: 'Slack',
    mail: '邮件',
    webhook: 'Webhook',
    bark: 'Bark',
    pushplus: 'PushPlus',
  };
  return (props.channels || []).map((c) => ({
    id: c.id,
    name: channelNameMap[c.id] || c.id,
    icon: c.icon,
    enabled: c.enabled,
  }));
});

const displayGroups = computed(() => {
  let filtered = [...groups.value];

  // 搜索过滤
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    filtered = filtered.filter((g) => g.name.toLowerCase().includes(q));
  }

  // 渠道过滤
  if (filterChannel.value) {
    filtered = filtered.filter((g) => g.channels.includes(filterChannel.value as PushChannel));
  }

  // 排序
  filtered.sort((a, b) => {
    const compare = a.name.localeCompare(b.name, 'zh-CN');
    return sortOrder.value === 'asc' ? compare : -compare;
  });

  return filtered;
});

function getChannelIcon(ch: string): string {
  const iconMap: Record<string, string> = {
    wework: '💼',
    dingtalk: '🅰️',
    feishu: '🪶',
    telegram: '✈️',
    bark: '📱',
    ntfy: '📢',
    email: '📧',
    slack: '💬',
    discord: '🎮',
  };
  return iconMap[ch] || '📡';
}

function getChannelName(ch: string): string {
  const channelNameMap: Record<string, string> = {
    wework: '企业微信',
    dingtalk: '钉钉',
    feishu: '飞书',
    telegram: 'Telegram',
    discord: 'Discord',
    slack: 'Slack',
    mail: '邮件',
    webhook: 'Webhook',
    bark: 'Bark',
    pushplus: 'PushPlus',
  };
  return channelNameMap[ch] || ch;
}

function formatTime(timeStr: string): string {
  try {
    return new Date(timeStr).toLocaleString('zh-CN');
  } catch {
    return timeStr;
  }
}

function toggleSort() {
  sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
}

function clearFilters() {
  searchQuery.value = '';
  filterChannel.value = '';
}

function openCreateModal() {
  form.name = '';
  form.channels = [];
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
  editingGroup.value = null;
}

function useGroup(group: ChannelGroup) {
  emit('use-group', group.channels);
}

function editGroup(group: ChannelGroup) {
  editingGroup.value = group;
  form.name = group.name;
  form.channels = [...group.channels];
  showModal.value = true;
}

function confirmDelete(group: ChannelGroup) {
  deletingGroup.value = group;
  showDeleteConfirm.value = true;
}

async function doDelete() {
  if (!props.accessToken || !deletingGroup.value) return;
  deleting.value = true;
  try {
    await deleteChannelGroup(props.accessToken, deletingGroup.value.id);
    groups.value = groups.value.filter((g) => g.id !== deletingGroup.value!.id);
    showDeleteConfirm.value = false;
    deletingGroup.value = null;
  } catch (err) {
    showToast((err as Error).message, 'error');
  } finally {
    deleting.value = false;
  }
}

async function testGroup(group: ChannelGroup) {
  if (!props.accessToken) return;
  testingGroup.value = group.id;
  testResult.value = null;

  try {
    const results = await dispatchPush(props.accessToken, {
      title: `分组测试: ${group.name}`,
      body: '这是一条测试推送，用于验证分组配置是否正常。',
      channels: group.channels,
    });

    const success = results.every((r: any) => r.success);
    testResult.value = {
      success,
      message: success ? '所有渠道推送成功' : '部分渠道推送失败',
      results,
    };
  } catch (err: any) {
    testResult.value = {
      success: false,
      message: err.message || '推送失败',
      results: group.channels.map((ch) => ({ channel: ch, success: false, message: '推送失败' })),
    };
  } finally {
    testingGroup.value = null;
  }
}

async function saveGroup() {
  if (!props.accessToken || !form.name || form.channels.length === 0) return;
  saving.value = true;
  try {
    if (editingGroup.value) {
      const result = await updateChannelGroup(props.accessToken, editingGroup.value.id, {
        name: form.name,
        channels: form.channels,
      });
      const idx = groups.value.findIndex((g) => g.id === editingGroup.value!.id);
      if (idx !== -1) {
        groups.value[idx] = result.group;
      }
    } else {
      const result = await createChannelGroup(props.accessToken, {
        name: form.name,
        channels: form.channels,
      });
      groups.value.push(result.group);
    }
    closeModal();
  } catch (err) {
    showToast((err as Error).message, 'error');
  } finally {
    saving.value = false;
  }
}

async function loadGroups() {
  if (!props.accessToken) return;
  loading.value = true;
  try {
    const data = await getChannelGroups(props.accessToken);
    groups.value = data.groups || [];
  } catch (err) {
    console.error('加载分组失败:', err);
  } finally {
    loading.value = false;
  }
}

onMounted(loadGroups);
</script>

<style scoped>
.group-manager {
  padding: 0;
}

.panel {
  background: var(--bg-panel, white);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.panel-header {
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
}

.panel h2 {
  font-size: 18px;
  color: var(--text-primary, #1a1a2e);
  margin: 0;
  padding: 0;
  line-height: 36px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.filter-bar {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  padding: 16px;
  background: var(--bg-secondary, #f8f9fa);
  border-radius: 8px;
  margin-bottom: 16px;
  border: 1px solid var(--border-color, #e0e0e0);
  flex-wrap: wrap;
}

.filter-group {
  flex: 1;
  min-width: 180px;
}

.filter-group label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary, #666);
  margin-bottom: 4px;
}

.filter-input,
.filter-select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg-panel, white);
  color: var(--text-primary, #333);
  box-sizing: border-box;
}

.filter-input:focus,
.filter-select:focus {
  outline: none;
  border-color: #667eea;
}

.loading-state {
  text-align: center;
  padding: 60px 20px;
  color: #666;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #666;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-state p {
  margin: 0 0 16px;
}

.group-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.group-card {
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  background: white;
  border-radius: 16px;
  border: 1px solid #f0f0f0;
  transition: all 0.25s ease;
  overflow: hidden;
}

.group-card:hover {
  border-color: #e0e0e0;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
}

.group-main {
  flex: 1;
  min-width: 0;
  padding: 24px;
}

.group-top {
  margin-bottom: 16px;
}

.group-name-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.group-name {
  font-size: 17px;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0;
}

.group-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tag {
  font-size: 12px;
  padding: 3px 12px;
  border-radius: 20px;
  font-weight: 500;
}

.tag-channel {
  background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
  color: #667eea;
}

.group-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 13px;
}

.field-label {
  color: #999;
  min-width: 60px;
  flex-shrink: 0;
}

.field-value {
  color: #333;
}

.group-actions {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0;
  padding: 20px;
  border-left: 1px solid #f5f5f5;
  background: #fafafa;
}

.action-btn {
  padding: 8px 16px;
  font-size: 13px;
  border: none;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  text-align: center;
  min-width: 60px;
}

.action-use {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 8px 8px 0 0;
}

.action-use:hover {
  opacity: 0.9;
}

.action-test {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  border-top: 1px solid #059669;
}

.action-test:hover:not(:disabled) {
  opacity: 0.9;
}

.action-test:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-edit {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
}

.action-edit:hover {
  background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
}

.action-delete {
  background: #ff4757;
  color: white;
  border-radius: 0 0 8px 8px;
}

.action-delete:hover {
  background: #ff3742;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--bg-panel, white);
  border-radius: 12px;
  width: 90%;
  max-width: 560px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-small {
  max-width: 420px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary, #1a1a2e);
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #999;
  padding: 0;
  line-height: 1;
}

.btn-close:hover {
  color: #333;
}

.modal-body {
  padding: 20px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: var(--text-primary, #333);
  font-size: 14px;
}

.form-group input {
  width: 100%;
  padding: 10px 14px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 14px;
  box-sizing: border-box;
  font-family: inherit;
  background: var(--bg-panel, white);
  transition: border-color 0.3s;
}

.form-group input:focus {
  outline: none;
  border-color: #667eea;
}

.channels-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.channel-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.channel-checkbox:hover:not(.channel-disabled) {
  border-color: #667eea;
}

.channel-checkbox.channel-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.channel-checkbox input {
  width: auto;
}

.channel-icon {
  font-size: 18px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 20px;
  border-top: 1px solid var(--border-color, #f0f0f0);
}

.btn {
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-sm {
  padding: 6px 14px;
  font-size: 13px;
  height: 30px;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--bg-secondary, #f8f9fa);
  color: var(--text-primary, #333);
  border: 2px solid var(--border-color, #e0e0e0);
}

.btn-secondary:hover {
  border-color: #667eea;
}

.btn-danger {
  background: #ff4d4f;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #ff7875;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  padding: 4px;
  border-radius: 6px;
  transition: background 0.2s;
}

.btn-icon:hover {
  background: var(--bg-secondary, #f8f9fa);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 12px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.test-result {
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 12px;
}

.test-result.success {
  background: #d1fae5;
  border: 1px solid #a7f3d0;
}

.test-result:not(.success) {
  background: #fee2e2;
  border: 1px solid #fecaca;
}

.test-status {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 12px;
}

.test-result.success .test-status {
  color: #065f46;
}

.test-result:not(.success) .test-status {
  color: #991b1b;
}

.test-channel-result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
}

.test-channel-icon {
  font-size: 16px;
}

.test-channel-name {
  font-weight: 500;
  color: var(--text-primary, #333);
  min-width: 80px;
}

.test-channel-status.success {
  color: #10b981;
}

.test-channel-status:not(.success) {
  color: #ef4444;
}

.test-message {
  font-size: 12px;
  color: var(--text-secondary, #666);
  margin: 8px 0 0;
}

@media (max-width: 768px) {
  .panel {
    padding: 16px;
  }

  .header-actions {
    flex-wrap: wrap;
    gap: 6px;
  }

  .filter-bar {
    flex-direction: column;
    gap: 10px;
  }

  .filter-group {
    min-width: 100%;
  }

  .group-card {
    flex-direction: column;
  }

  .group-actions {
    flex-direction: row;
    border-left: none;
    border-top: 1px solid #f5f5f5;
  }

  .action-btn {
    flex: 1;
    border-radius: 0 !important;
  }

  .group-top {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
