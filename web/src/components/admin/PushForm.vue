<script setup lang="ts">
// ============================================
// 推送表单组件
// ============================================
import { ref, computed, watch } from 'vue';
import { useTranslation } from '@/i18n';
import { useGlobalToast } from '@/composables/useToast';
import { checkAIAvailable, generateMessageWithAI } from '@/api';
import type { ChannelConfig, PushChannel, PushResult, PushTemplate } from '@/types';

const { showToast } = useGlobalToast();
const t = useTranslation();

const props = defineProps<{
  channels: ChannelConfig[];
  selectedChannels: Set<PushChannel>;
  isPushing?: boolean;
  pushResults?: PushResult[];
  lastPushTime?: string;
  accessToken: string;
}>();

const emit = defineEmits<{
  push: [title: string, body: string, url: string, channels: PushChannel[], async: boolean];
  'update:selectedChannels': [channels: Set<PushChannel>];
  refresh: [];
}>();

const pushTitle = ref('');
const pushBody = ref('');
const pushUrl = ref('');
const useAsync = ref(false);

// AI 相关状态
const aiAvailable = ref(false);
const aiLoading = ref(false);
const aiPrompt = ref('');
const showAiPanel = ref(false);

// 消息预览相关状态
const showPreview = ref(false);

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
  emit('push', pushTitle.value.trim(), pushBody.value.trim(), pushUrl.value.trim(), channels, useAsync.value);
}

// 检查 AI 是否可用
async function checkAI() {
  try {
    const result = await checkAIAvailable(props.accessToken);
    aiAvailable.value = result.available;
  } catch (error) {
    console.error('Failed to check AI availability:', error);
    aiAvailable.value = false;
  }
}

// 使用 AI 生成内容
async function generateContent(type: 'title' | 'body' | 'both') {
  if (!aiPrompt.value.trim()) {
    showToast(t('error.required', { field: t('label.ai_prompt') }), 'error');
    return;
  }

  aiLoading.value = true;
  try {
    const result = await generateMessageWithAI(props.accessToken, aiPrompt.value.trim(), type);
    if (result.success) {
      if (result.title) pushTitle.value = result.title;
      if (result.body) pushBody.value = result.body;
      showToast(t('msg.ai_generate_success'), 'success');
    } else {
      showToast(result.message || t('msg.ai_generate_failed'), 'error');
    }
  } catch (error) {
    console.error('Failed to generate content:', error);
    showToast(t('msg.ai_generate_failed'), 'error');
  } finally {
    aiLoading.value = false;
  }
}

// 初始化时检查 AI 可用性
checkAI();
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
          <button v-if="aiAvailable" class="btn btn-sm btn-secondary" @click="showAiPanel = !showAiPanel">
            🤖 {{ t('button.ai_generate') }}
          </button>
          <button class="btn btn-sm btn-secondary" @click="showPreview = !showPreview">
            👁️ {{ t('button.preview') }}
          </button>
        </div>
      </div>

      <!-- AI 生成面板 -->
      <div v-if="showAiPanel" class="ai-panel">
        <div class="form-group">
          <label>{{ t('label.ai_prompt') }} *</label>
          <textarea
            v-model="aiPrompt"
            :placeholder="t('placeholder.ai_prompt')"
            rows="3"
          ></textarea>
          <p class="hint">{{ t('hint.ai_prompt') }}</p>
        </div>
        <div class="ai-actions">
          <button
            class="btn btn-sm btn-secondary"
            :disabled="aiLoading"
            @click="generateContent('title')"
          >
            {{ aiLoading ? '...' : t('button.generate_title') }}
          </button>
          <button
            class="btn btn-sm btn-secondary"
            :disabled="aiLoading"
            @click="generateContent('body')"
          >
            {{ aiLoading ? '...' : t('button.generate_body') }}
          </button>
          <button
            class="btn btn-sm btn-primary"
            :disabled="aiLoading"
            @click="generateContent('both')"
          >
            {{ aiLoading ? '...' : t('button.generate_both') }}
          </button>
        </div>
      </div>

      <!-- 消息预览面板 -->
      <div v-if="showPreview" class="preview-panel">
        <div class="preview-title">
          {{ pushTitle || t('label.title_placeholder') }}
        </div>
        <div v-if="pushBody" class="preview-body">
          {{ pushBody }}
        </div>
        <div v-if="pushUrl" class="preview-url">
          🔗 {{ pushUrl }}
        </div>
        <div v-if="selectedChannels.size > 0" class="preview-channels">
          <span class="label">{{ t('label.selected_channels') }}: </span>
          <span v-for="ch in Array.from(selectedChannels)" :key="ch" class="preview-channel">
            {{ t(`channel.${ch}`) }}
          </span>
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

      <div class="form-group">
        <label class="checkbox-label">
          <input v-model="useAsync" type="checkbox" />
          <span>{{ t('label.async_push') }}</span>
          <span class="hint-text">{{ t('hint.async_push') }}</span>
        </label>
      </div>

      <button class="btn btn-primary btn-fixed" :disabled="isPushing" @click="doPush">
        🚀 {{ useAsync ? t('button.push_async') : t('button.push') }}
      </button>
      <button class="btn btn-secondary btn-fixed" @click="$emit('refresh')">
        {{ t('button.refresh_channels') }}
      </button>
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

.ai-panel {
  background: var(--bg-secondary, #f8f9fa);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.ai-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.preview-panel {
  background: var(--bg-secondary, #f8f9fa);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.preview-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
  margin-bottom: 8px;
}

.preview-body {
  font-size: 14px;
  color: var(--text-secondary, #666);
  margin-bottom: 8px;
  line-height: 1.5;
}

.preview-url {
  font-size: 13px;
  color: #667eea;
  margin-bottom: 8px;
  word-break: break-all;
}

.preview-channels {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color, #e0e0e0);
}

.preview-channels .label {
  font-size: 12px;
  color: var(--text-secondary, #999);
}

.preview-channel {
  display: inline-block;
  background: #667eea;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  margin-right: 4px;
  margin-bottom: 4px;
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
  margin-left: 8px;
}

.btn-secondary:hover {
  background: var(--border-color, #e0e0e0);
}

.btn-fixed {
  min-width: 180px;
  width: 180px;
  box-sizing: border-box;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

  .btn-fixed {
    min-width: 140px;
    width: 140px;
    font-size: 13px;
    padding: 10px 16px;
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
    width: 120px;
    font-size: 12px;
    padding: 8px 12px;
  }
}
</style>
