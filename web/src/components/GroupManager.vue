<template>
  <div class="group-manager">
    <div class="panel">
      <div class="panel-header">
        <h2>📁 {{ t('groups.title') }}</h2>
        <button class="btn btn-primary" @click="openCreateModal" :disabled="saving">
          + {{ t('groups.create') }}
        </button>
      </div>

      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <span>{{ t('common.loading') || '加载中...' }}</span>
      </div>

      <div v-else-if="groups.length === 0" class="empty-state">
        <div class="empty-icon"></div>
        <p>{{ t('groups.empty') }}</p>
      </div>

      <div v-else class="group-list">
        <div v-for="group in groups" :key="group.id" class="group-card">
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
            </div>
          </div>
          <div class="group-actions">
            <button class="action-btn action-use" @click="useGroup(group)">使用</button>
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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { t } from '@/i18n';
import {
  getChannelGroups,
  createChannelGroup,
  deleteChannelGroup,
  updateChannelGroup,
  type ChannelGroup,
  type PushChannel,
} from '@/api';

const emit = defineEmits<{
  (e: 'use-group', channels: PushChannel[]): void;
}>();

const props = defineProps<{
  accessToken: string;
  channels?: Array<{ id: string; name: string; icon: string; enabled: boolean }>;
}>();

const loading = ref(true);
const saving = ref(false);
const deleting = ref(false);
const showModal = ref(false);
const showDeleteConfirm = ref(false);
const editingGroup = ref<ChannelGroup | null>(null);
const deletingGroup = ref<ChannelGroup | null>(null);
const groups = ref<ChannelGroup[]>([]);

const form = reactive({
  name: '',
  channels: [] as PushChannel[],
});

const availableChannels = computed(() => props.channels || [
  { id: 'wechat', name: '企业微信', icon: '💼', enabled: true },
  { id: 'dingtalk', name: '钉钉', icon: '📌', enabled: true },
  { id: 'feishu', name: '飞书', icon: '🍃', enabled: true },
  { id: 'telegram', name: 'Telegram', icon: '✈️', enabled: true },
  { id: 'email', name: '邮件', icon: '📧', enabled: true },
  { id: 'sms', name: '短信', icon: '📱', enabled: true },
  { id: 'push', name: '推送', icon: '🔔', enabled: true },
  { id: 'slack', name: 'Slack', icon: '', enabled: true },
  { id: 'discord', name: 'Discord', icon: '🎮', enabled: true },
  { id: 'webpush', name: 'Web Push', icon: '🌐', enabled: true },
]);

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
    webpush: 'Web Push',
  };
  return channelNameMap[ch] || ch;
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
    alert((err as Error).message);
  } finally {
    deleting.value = false;
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
    alert((err as Error).message);
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
  height: 50px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel h2 {
  font-size: 18px;
  color: var(--text-primary, #1a1a2e);
  margin: 0;
  padding: 0;
  line-height: 36px;
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
  min-width: 40px;
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

.btn-small {
  padding: 6px 14px;
  font-size: 13px;
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
</style>
