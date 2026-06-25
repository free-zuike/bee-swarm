<script setup lang="ts">
// ============================================
// 推送表单组件
// ============================================
import { ref, computed } from 'vue';
import { useTranslation } from '@/i18n';
import { useGlobalToast } from '@/composables/useToast';
import type { ChannelConfig, PushChannel, PushResult, PushTemplate } from '@/types';

const { showToast } = useGlobalToast();
const t = useTranslation();

const props = defineProps<{
  channels: ChannelConfig[];
  selectedChannels: Set<PushChannel>;
  isPushing?: boolean;
  pushResults?: PushResult[];
  lastPushTime?: string;
  token?: string;
}>();

const emit = defineEmits<{
  push: [title: string, body: string, url: string, channels: PushChannel[], async: boolean];
  'update:selectedChannels': [channels: Set<PushChannel>];
  refresh: [];
}>();

const pushTitle = ref('');
const pushBody = ref('');
const pushUrl = ref('');
const useAsync = ref(true);

// 草稿箱相关状态
const drafts = ref<
  Array<{
    id: string;
    title: string;
    body: string;
    url: string;
    channels: PushChannel[];
    createdAt: string;
    updatedAt: string;
  }>
>([]);
const showDraftDropdown = ref(false);
const currentDraftId = ref<string | null>(null);

function fillFromTemplate(template: PushTemplate) {
  pushTitle.value = template.title;
  pushBody.value = template.content || '';
  pushUrl.value = template.url || '';

  if (template.channels && template.channels.length > 0) {
    const newSelection = new Set<PushChannel>(template.channels);
    emit('update:selectedChannels', newSelection);
    sessionStorage.setItem('bee_swarm_selected_channels', JSON.stringify(Array.from(newSelection)));
  }
}

defineExpose({ fillFromTemplate });

const enabledChannelCount = computed(() => props.channels.filter((c) => c.enabled).length);

const enabledChannels = computed(() => props.channels.filter((c) => c.enabled));

function toggleChannel(ch: ChannelConfig) {
  if (!ch.enabled) return;
  const newSelection = new Set(props.selectedChannels);
  if (newSelection.has(ch.id)) {
    newSelection.delete(ch.id);
  } else {
    newSelection.add(ch.id);
  }
  emit('update:selectedChannels', newSelection);
  const selected = Array.from(newSelection);
  sessionStorage.setItem('bee_swarm_selected_channels', JSON.stringify(selected));
}

function doPush() {
  if (!pushTitle.value.trim()) {
    showToast(t('error.required', { field: t('label.title') }), 'error');
    return;
  }
  const channels = props.selectedChannels.size > 0 ? Array.from(props.selectedChannels) : [];
  emit(
    'push',
    pushTitle.value.trim(),
    pushBody.value.trim(),
    pushUrl.value.trim(),
    channels,
    useAsync.value
  );
}

// 草稿箱操作
async function loadDrafts() {
  if (!props.token) return;
  try {
    const { getDrafts } = await import('@/api');
    const result = await getDrafts(props.token);
    drafts.value = result.drafts || [];
    showDraftDropdown.value = !showDraftDropdown.value;
  } catch {
    showToast('加载草稿失败', 'error');
  }
}

function loadDraft(draft: (typeof drafts.value)[0]) {
  pushTitle.value = draft.title;
  pushBody.value = draft.body;
  pushUrl.value = draft.url;
  currentDraftId.value = draft.id;
  if (draft.channels && draft.channels.length > 0) {
    const newSelection = new Set<PushChannel>(draft.channels);
    emit('update:selectedChannels', newSelection);
    sessionStorage.setItem('bee_swarm_selected_channels', JSON.stringify(Array.from(newSelection)));
  }
  showDraftDropdown.value = false;
  showToast('草稿已加载', 'success');
}

async function saveDraft() {
  if (!props.token) return;
  if (!pushTitle.value.trim()) {
    showToast(t('error.required', { field: t('label.title') }), 'error');
    return;
  }
  try {
    const channels = props.selectedChannels.size > 0 ? Array.from(props.selectedChannels) : [];
    const { createDraft, updateDraft } = await import('@/api');
    if (currentDraftId.value) {
      await updateDraft(props.token, currentDraftId.value, {
        title: pushTitle.value.trim(),
        body: pushBody.value.trim(),
        url: pushUrl.value.trim(),
        channels,
      });
      showToast('草稿已更新', 'success');
    } else {
      const result = await createDraft(props.token, {
        title: pushTitle.value.trim(),
        body: pushBody.value.trim(),
        url: pushUrl.value.trim(),
        channels,
      });
      currentDraftId.value = result.draft.id;
      showToast('草稿已保存', 'success');
    }
    await loadDrafts();
  } catch {
    showToast('保存草稿失败', 'error');
  }
}

async function deleteDraft(id: string) {
  if (!props.token) return;
  try {
    const { deleteDraft: apiDeleteDraft } = await import('@/api');
    await apiDeleteDraft(props.token, id);
    if (currentDraftId.value === id) {
      currentDraftId.value = null;
    }
    showToast('草稿已删除', 'success');
    await loadDrafts();
  } catch {
    showToast('删除草稿失败', 'error');
  }
}

// 预览渠道效果
const showPreviewModal = ref(false);
const previewChannels = computed(() => {
  return Array.from(props.selectedChannels);
});

function openPreviewModal() {
  showPreviewModal.value = true;
}

function getChannelPreview(channel: PushChannel): { icon: string; name: string; desc: string } {
  const previews: Record<string, { icon: string; name: string; desc: string }> = {
    wework: { icon: '💬', name: '企业微信', desc: '企业微信群机器人消息卡片' },
    dingtalk: { icon: '🔔', name: '钉钉', desc: '钉钉群机器人 Markdown 消息' },
    feishu: { icon: '🦢', name: '飞书', desc: '飞书群机器人富文本卡片' },
    telegram: { icon: '✈️', name: 'Telegram', desc: 'Telegram Bot 消息' },
    bark: { icon: '📱', name: 'Bark', desc: 'iOS Bark 推送通知' },
    ntfy: { icon: '📣', name: 'ntfy', desc: 'ntfy 推送通知' },
    email: { icon: '📧', name: '邮件', desc: 'HTML 格式邮件' },
    slack: { icon: '💼', name: 'Slack', desc: 'Slack 频道消息' },
    discord: { icon: '🎮', name: 'Discord', desc: 'Discord Webhook 消息' },
    webhook: { icon: '🔗', name: 'Webhook', desc: '自定义 Webhook POST 请求' },
    pushplus: { icon: '📦', name: 'PushPlus', desc: 'PushPlus 推送通知' },
    serverchan: { icon: '🍵', name: 'Server酱', desc: 'Server酱推送通知' },
    gotify: { icon: '🔔', name: 'Gotify', desc: 'Gotify 推送通知' },
    line: { icon: '🟢', name: 'LINE Notify', desc: 'LINE Notify 推送通知' },
    teams: { icon: '🏢', name: 'Microsoft Teams', desc: 'Teams Webhook 消息' },
    pushover: { icon: '🔔', name: 'Pushover', desc: 'Pushover 推送通知' },
  };
  return previews[channel] || { icon: '📱', name: channel, desc: '推送通知' };
}
</script>

<template>
  <div class="tab-content">
    <div class="stats">
      <div class="stat-card">
        <div class="label">{{ t('label.enabled_channels') }}</div>
        <div class="value">{{ enabledChannelCount }}</div>
      </div>
      <div class="stat-card">
        <div class="label">{{ t('label.last_push') }}</div>
        <div class="value">{{ lastPushTime || '-' }}</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h2>📤 {{ t('label.push_notification') }}</h2>
        <div class="panel-actions">
          <button class="btn btn-sm btn-secondary" @click="openPreviewModal">
            👁️ {{ t('button.preview') }}
          </button>
        </div>
      </div>

      <div class="form-group">
        <label>{{ t('label.select_channels') }}</label>
        <div class="channel-grid">
          <div
            v-for="ch in enabledChannels"
            :key="ch.id"
            class="channel-tag"
            :class="{ active: selectedChannels.has(ch.id) }"
            @click="toggleChannel(ch)"
          >
            <span class="ch-icon">{{ ch.icon }}</span>
            <span class="ch-name">{{ t(`channel.${ch.id}`) }}</span>
          </div>
        </div>
        <p class="hint">{{ t('hint.channel_selection') }}</p>
      </div>

      <div class="form-group">
        <label>{{ t('label.title') }} *</label>
        <input v-model="pushTitle" type="text" :placeholder="t('placeholder.title')" />
      </div>
      <div class="form-group">
        <label>{{ t('label.content') }}</label>
        <textarea v-model="pushBody" :placeholder="t('placeholder.content')"></textarea>
      </div>
      <div class="form-group">
        <label>{{ t('label.url') }} ({{ t('label.optional') }})</label>
        <input v-model="pushUrl" type="url" placeholder="https://example.com" />
      </div>

      <div class="button-row">
        <button class="btn btn-primary btn-fixed" :disabled="isPushing" @click="doPush">
          🚀 {{ t('button.push_async') }}
        </button>
        <button class="btn btn-secondary btn-fixed" @click="$emit('refresh')">
          {{ t('button.refresh_channels') }}
        </button>
        <button class="btn btn-secondary btn-fixed" @click="saveDraft">
          💾 {{ currentDraftId ? '更新草稿' : '保存草稿' }}
        </button>
      </div>

      <!-- 草稿箱 -->
      <div class="draft-section">
        <div class="draft-header" @click="loadDrafts">
          <span>📋 草稿箱</span>
          <span v-if="drafts.length > 0" class="draft-count">({{ drafts.length }})</span>
          <span class="draft-arrow" :class="{ open: showDraftDropdown }">▼</span>
        </div>
        <div v-if="showDraftDropdown" class="draft-dropdown">
          <div v-if="drafts.length === 0" class="draft-empty">暂无草稿</div>
          <div
            v-for="draft in drafts"
            :key="draft.id"
            class="draft-item"
            :class="{ active: currentDraftId === draft.id }"
          >
            <div class="draft-info" @click="loadDraft(draft)">
              <div class="draft-title">{{ draft.title || '无标题' }}</div>
              <div class="draft-time">{{ new Date(draft.updatedAt).toLocaleString() }}</div>
            </div>
            <button class="draft-delete" @click.stop="deleteDraft(draft.id)">✕</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 预览模态框 -->
    <div v-if="showPreviewModal" class="modal-overlay" @click.self="showPreviewModal = false">
      <div class="modal-content preview-modal">
        <div class="modal-header">
          <h3>👁️ 消息预览</h3>
          <button class="modal-close" @click="showPreviewModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div v-if="previewChannels.length === 0" class="preview-empty">请先选择推送渠道</div>
          <div v-else class="preview-grid">
            <div v-for="channel in previewChannels" :key="channel" class="preview-card">
              <div class="preview-card-header">
                <span class="preview-icon">{{ getChannelPreview(channel).icon }}</span>
                <span class="preview-name">{{ getChannelPreview(channel).name }}</span>
              </div>
              <div class="preview-card-desc">{{ getChannelPreview(channel).desc }}</div>
              <div class="preview-card-body">
                <div class="preview-field">
                  <span class="preview-label">标题:</span>
                  <span class="preview-value">{{ pushTitle || '（无标题）' }}</span>
                </div>
                <div v-if="pushBody" class="preview-field">
                  <span class="preview-label">内容:</span>
                  <span class="preview-value">{{ pushBody }}</span>
                </div>
                <div v-if="pushUrl" class="preview-field">
                  <span class="preview-label">链接:</span>
                  <span class="preview-value preview-url">{{ pushUrl }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showPreviewModal = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
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

.stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 24px;
  height: 88px;
  box-sizing: border-box;
  flex-shrink: 0;
}

.stat-card {
  background: var(--bg-panel, white);
  border-radius: 12px;
  padding: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  text-align: center;
  height: 88px;
  width: 100%;
  min-width: 140px;
  max-width: 100%;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
}

.stat-card .label {
  font-size: 12px;
  color: var(--text-secondary, #999);
  position: absolute;
  top: 20px;
  left: 0;
  right: 0;
  height: 16px;
  line-height: 16px;
  overflow: hidden;
  white-space: nowrap;
}

.stat-card .value {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary, #1a1a2e);
  position: absolute;
  top: 44px;
  left: 0;
  right: 0;
  height: 32px;
  line-height: 32px;
  overflow: hidden;
  white-space: nowrap;
}

.panel {
  background: var(--bg-panel, white);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  margin-bottom: 24px;
  position: relative;
}

.panel-header {
  height: 50px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
  box-sizing: border-box;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.panel-actions {
  display: flex;
  gap: 8px;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
  min-width: auto;
  width: auto;
}

.panel h2 {
  font-size: 18px;
  color: var(--text-primary, #1a1a2e);
  margin: 0;
  padding: 0;
  line-height: 36px;
  white-space: nowrap;
  overflow: hidden;
}

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
  border: 2px solid var(--border-color, #e0e0e0);
  background: var(--bg-panel, white);
  transition: all 0.2s;
  text-align: center;
  user-select: none;
  height: 56px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
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
  color: var(--text-secondary, #666);
}

.channel-tag.active .ch-name {
  color: #667eea;
  font-weight: 600;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #333);
  margin-bottom: 6px;
  height: 20px;
  line-height: 20px;
  box-sizing: border-box;
  white-space: nowrap;
  overflow: hidden;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 10px 14px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.3s;
  font-family: inherit;
  box-sizing: border-box;
  background: var(--bg-panel, white);
  color: var(--text-primary, #1a1a2e);
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

.hint {
  font-size: 12px;
  color: var(--text-secondary, #999);
  margin-top: 4px;
  height: 18px;
  line-height: 18px;
  box-sizing: border-box;
  white-space: nowrap;
  overflow: hidden;
}

.button-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

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
  background: var(--bg-secondary, #f0f0f0);
  color: var(--text-primary, #333);
}

.btn-secondary:hover {
  background: var(--border-color, #e0e0e0);
}

.btn-fixed {
  min-width: 140px;
  box-sizing: border-box;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 草稿箱 */
.draft-section {
  margin-top: 16px;
  border-top: 1px solid var(--border-color, #f0f0f0);
  padding-top: 12px;
}

.draft-header {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #333);
  user-select: none;
}

.draft-count {
  font-size: 12px;
  color: var(--text-secondary, #999);
  font-weight: 400;
}

.draft-arrow {
  font-size: 10px;
  transition: transform 0.2s;
  margin-left: auto;
}

.draft-arrow.open {
  transform: rotate(180deg);
}

.draft-dropdown {
  margin-top: 8px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.draft-empty {
  padding: 16px;
  text-align: center;
  color: var(--text-secondary, #999);
  font-size: 13px;
}

.draft-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
  transition: background 0.2s;
}

.draft-item:last-child {
  border-bottom: none;
}

.draft-item:hover {
  background: var(--bg-secondary, #f8f9fa);
}

.draft-item.active {
  background: #f0f0ff;
}

.draft-info {
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.draft-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #333);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.draft-time {
  font-size: 11px;
  color: var(--text-secondary, #999);
  margin-top: 2px;
}

.draft-delete {
  background: none;
  border: none;
  color: var(--text-secondary, #999);
  cursor: pointer;
  padding: 4px 8px;
  font-size: 14px;
  border-radius: 4px;
  flex-shrink: 0;
}

.draft-delete:hover {
  color: #e74c3c;
  background: #fff5f5;
}

/* 预览模态框 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  animation: fadeIn 0.2s ease;
}

.modal-content {
  background: var(--bg-panel, white);
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary, #1a1a2e);
}

.modal-close {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: var(--text-secondary, #999);
  padding: 4px 8px;
  border-radius: 4px;
}

.modal-close:hover {
  background: var(--bg-secondary, #f5f5f5);
  color: var(--text-primary, #333);
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border-color, #f0f0f0);
  display: flex;
  justify-content: flex-end;
}

.preview-empty {
  text-align: center;
  padding: 32px;
  color: var(--text-secondary, #999);
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
}

.preview-card {
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  padding: 12px;
  background: var(--bg-secondary, #f8f9fa);
}

.preview-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.preview-icon {
  font-size: 16px;
}

.preview-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
}

.preview-card-desc {
  font-size: 11px;
  color: var(--text-secondary, #999);
  margin-bottom: 8px;
}

.preview-card-body {
  background: var(--bg-panel, white);
  border-radius: 6px;
  padding: 10px;
  border: 1px solid var(--border-color, #e8e8e8);
}

.preview-field {
  margin-bottom: 6px;
}

.preview-field:last-child {
  margin-bottom: 0;
}

.preview-label {
  font-size: 11px;
  color: var(--text-secondary, #999);
  display: block;
  margin-bottom: 2px;
}

.preview-value {
  font-size: 13px;
  color: var(--text-primary, #333);
  word-break: break-all;
}

.preview-url {
  color: #667eea;
}

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

/* ==================== 移动端响应式 ==================== */
@media (max-width: 768px) {
  .panel {
    padding: 12px;
    margin-bottom: 16px;
  }

  .panel-header {
    height: auto;
    margin-bottom: 12px;
  }

  .panel h2 {
    font-size: 16px;
    height: auto;
    line-height: 1.4;
  }

  .panel h3 {
    font-size: 14px;
    height: auto;
    line-height: 1.4;
  }

  .channel-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-bottom: 12px;
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

  .button-row {
    flex-direction: column;
  }

  .btn-fixed {
    min-width: 140px;
    width: 100%;
    font-size: 13px;
    padding: 10px 16px;
  }

  .preview-grid {
    grid-template-columns: 1fr;
  }

  .modal-content {
    width: 95%;
  }
}

@media (max-width: 480px) {
  .stat-card {
    height: 64px;
  }

  .stat-card .label {
    font-size: 10px;
  }

  .stat-card .value {
    font-size: 18px;
  }

  .btn-fixed {
    min-width: 120px;
    font-size: 12px;
    padding: 8px 12px;
  }
}
</style>
