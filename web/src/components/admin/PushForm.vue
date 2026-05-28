<script setup lang="ts">
// ============================================
// 推送表单组件
// ============================================
import { ref, computed } from 'vue';
import { t } from '@/i18n';
import type { ChannelConfig, PushChannel, PushResult } from '@/types';

const props = defineProps<{
  channels: ChannelConfig[];
  selectedChannels: Set<PushChannel>;
  isPushing?: boolean;
  pushResults?: PushResult[];
  lastPushTime?: string;
}>();

const emit = defineEmits<{
  push: [title: string, body: string, url: string, channels: PushChannel[]];
  'update:selectedChannels': [channels: Set<PushChannel>];
  refresh: [];
}>();

const pushTitle = ref('');
const pushBody = ref('');
const pushUrl = ref('');

const enabledChannelCount = computed(() => props.channels.filter((c) => c.enabled).length);

const enabledChannels = computed(() => props.channels.filter(c => c.enabled));

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
  sessionStorage.setItem('push_selected_channels', JSON.stringify(selected));
}

function doPush() {
  if (!pushTitle.value.trim()) {
    alert(t('error.required', { field: t('label.title') }));
    return;
  }
  const channels = props.selectedChannels.size > 0 ? Array.from(props.selectedChannels) : [];
  emit('push', pushTitle.value.trim(), pushBody.value.trim(), pushUrl.value.trim(), channels);
}

function isNoChannelSelectedError(results: PushResult[]): boolean {
  if (results.length === 0) return false;
  return results.every(r => !r.success && r.message === t('error.no_channel_selected'));
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
      <h2>📤 {{ t('label.push_notification') }}</h2>

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
            <span class="ch-name">{{ ch.name }}</span>
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

      <button class="btn btn-primary" :disabled="isPushing" @click="doPush">
        🚀 {{ t('button.push') }}
      </button>
      <button class="btn btn-secondary" @click="$emit('refresh')">{{ t('button.refresh_channels') }}</button>

      <div v-if="pushResults?.length" class="result-list">
        <template v-if="isNoChannelSelectedError(pushResults)">
          <div class="result-item error">
            <span>⚠️ {{ t('error.no_channel_selected_full') }}</span>
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
</template>

<style scoped>
.tab-content {
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}

.stat-card {
  background: var(--bg-panel, white);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  text-align: center;
}

.stat-card .label {
  font-size: 12px;
  color: var(--text-secondary, #999);
  margin-bottom: 4px;
}

.stat-card .value {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary, #1a1a2e);
}

.panel {
  background: var(--bg-panel, white);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  margin-bottom: 24px;
}

.panel h2 {
  font-size: 18px;
  color: var(--text-primary, #1a1a2e);
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
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
</style>
