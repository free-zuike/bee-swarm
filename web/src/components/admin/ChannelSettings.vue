<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { useTranslation } from '@/i18n';
import { useGlobalToast } from '@/composables/useToast';
import type { ChannelConfig, ChannelDefinition, ChannelSettings } from '@/types';

const { showToast } = useGlobalToast();
const t = useTranslation();

const props = defineProps<{
  channels: ChannelConfig[];
  channelDefinitions: ChannelDefinition[];
  channelSettings: ChannelSettings;
  accessToken: string;
}>();

const emit = defineEmits<{
  save: [channelId: string, fields: Record<string, string>];
  test: [channelId: string, fields: Record<string, string>];
  'toggle-enabled': [channelId: string];
  'update:channels': [channels: ChannelConfig[]];
  'update:channelSettings': [settings: ChannelSettings];
}>();

const editingValues = ref<ChannelSettings>({});
const expandedChannels = ref<Set<string>>(new Set());
const savingChannels = reactive<Record<string, boolean>>({});
const togglingChannel = ref<string | null>(null);

const settingsDefinitions = computed(() => props.channelDefinitions);

function isChannelConfigured(def: ChannelDefinition): boolean {
  return def.fields.some((f) => {
    const key = `channel:${def.id}:${f.key}`;
    return props.channelSettings[key] && props.channelSettings[key].trim() !== '';
  });
}

function isChannelEnabled(channelId: string): boolean {
  const key = `channel:${channelId}:enabled`;
  const value = props.channelSettings[key];
  return String(value) !== 'false';
}

function canToggleChannel(def: ChannelDefinition): boolean {
  const prefix = `channel:${def.id}:`;
  for (const key of Object.keys(props.channelSettings)) {
    if (key.startsWith(prefix)) {
      return true;
    }
  }
  return isChannelConfigured(def);
}

function getSettingValue(channelId: string, fieldKey: string): string {
  const key = `channel:${channelId}:${fieldKey}`;
  return editingValues.value[key] ?? props.channelSettings[key] ?? '';
}

function setSettingValue(channelId: string, fieldKey: string, value: string) {
  editingValues.value[`channel:${channelId}:${fieldKey}`] = value;
}

function hasUnsavedChanges(channelId: string): boolean {
  const prefix = `channel:${channelId}:`;
  for (const [key, edited] of Object.entries(editingValues.value)) {
    if (key.startsWith(prefix)) {
      const saved = props.channelSettings[key];
      if (edited !== saved) return true;
    }
  }
  return false;
}

function toggleChannelExpand(channelId: string) {
  if (expandedChannels.value.has(channelId)) {
    expandedChannels.value.delete(channelId);
  } else {
    expandedChannels.value.clear();
    expandedChannels.value.add(channelId);
  }
}

async function doSaveChannel(channelId: string) {
  if (savingChannels[channelId]) return;

  const def = props.channelDefinitions.find((d) => d.id === channelId);
  if (!def) return;

  const requiredFields = def.fields.filter((f) => f.required);
  const missingFields = requiredFields.filter((f) => {
    const value = getSettingValue(channelId, f.key);
    return !value || value.trim() === '';
  });

  if (missingFields.length > 0) {
    showToast(t('msg.required_fields_missing'), 'error');
    return;
  }

  savingChannels[channelId] = true;

  const fields: Record<string, string> = {};
  for (const field of def.fields) {
    fields[field.key] = getSettingValue(channelId, field.key);
  }

  emit('save', channelId, fields);
}

async function doTestChannel(channelId: string) {
  const def = props.channelDefinitions.find((d) => d.id === channelId);
  if (!def) return;

  const fields: Record<string, string> = {};
  for (const field of def.fields) {
    const editKey = `channel:${channelId}:${field.key}`;
    fields[field.key] = editingValues.value[editKey] ?? props.channelSettings[editKey] ?? '';
  }

  const isConfigured = def.fields.filter((f) => f.required).every((f) => !!fields[f.key]);
  if (!isConfigured) {
    showToast(t('msg.required_fields_missing'), 'error');
    return;
  }

  emit('test', channelId, fields);
}

function handleSaveSuccess(channelId: string, message: string) {
  const def = props.channelDefinitions.find((d) => d.id === channelId);
  if (def) {
    for (const field of def.fields) {
      const key = `channel:${channelId}:${field.key}`;
      delete editingValues.value[key];
    }
  }
  showToast(message || t('msg.save_success'), 'success');
  savingChannels[channelId] = false;
}

function handleSaveError(channelId: string, message: string) {
  showToast(message || t('msg.save_failed'), 'error');
  savingChannels[channelId] = false;
}

function handleTestResult(channelId: string, success: boolean, message: string) {
  showToast(message, success ? 'success' : 'error');
}

async function toggleChannelEnabled(channelId: string) {
  if (togglingChannel.value) return;
  togglingChannel.value = channelId;
  emit('toggle-enabled', channelId);
}

function handleToggleComplete() {
  togglingChannel.value = null;
}

defineExpose({
  handleSaveSuccess,
  handleSaveError,
  handleTestResult,
  handleToggleComplete,
});
</script>

<template>
  <div>
    <p class="hint" style="margin-bottom: 20px">{{ t('hint.channel_settings') }}</p>

    <div class="channel-cards">
      <div v-for="def in settingsDefinitions" :key="def.id" class="channel-card">
        <div class="channel-card-header" @click="toggleChannelExpand(def.id)">
          <div class="channel-card-info">
            <span class="channel-card-icon">{{ def.icon }}</span>
            <span class="channel-card-name">{{ t(`channel.${def.id}`) }}</span>
            <span v-if="hasUnsavedChanges(def.id)" class="unsaved-hint"
              >({{ t('label.unsaved') }})</span
            >
            <span v-if="!canToggleChannel(def)" class="status-tag status-unconfigured">
              {{ t('label.unconfigured') }}
            </span>
            <span
              v-else
              class="status-tag"
              :class="isChannelEnabled(def.id) ? 'status-enabled' : 'status-disabled'"
              @click.stop="toggleChannelEnabled(def.id)"
            >
              {{ isChannelEnabled(def.id) ? t('label.enabled') : t('label.disabled') }}
            </span>
          </div>
          <span class="expand-arrow" :class="{ expanded: expandedChannels.has(def.id) }"> ▾ </span>
        </div>

        <div v-if="expandedChannels.has(def.id)" class="channel-card-body">
          <div v-for="field in def.fields" :key="field.key" class="form-group">
            <label>
              {{ field.label }}
              <span v-if="field.required" class="required-mark">*</span>
            </label>
            <input
              :type="field.type === 'password' ? 'password' : 'text'"
              :value="getSettingValue(def.id, field.key)"
              :placeholder="field.placeholder"
              @input="setSettingValue(def.id, field.key, ($event.target as HTMLInputElement).value)"
            />
          </div>

          <div class="channel-save-area">
            <button class="btn btn-secondary btn-sm" @click="doTestChannel(def.id)">
              {{ t('button.test') }}
            </button>
            <button
              class="btn btn-primary btn-sm"
              :disabled="savingChannels[def.id]"
              @click="doSaveChannel(def.id)"
            >
              {{ savingChannels[def.id] ? t('label.saving') : '💾 ' + t('button.save') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
  height: 32px;
  line-height: 32px;
  box-sizing: border-box;
}

.hint {
  font-size: 12px;
  color: var(--text-secondary, #999);
  margin-top: 4px;
}

.channel-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: visible;
  min-height: fit-content;
}

.channel-card {
  background: var(--bg-panel, white);
  border: 1px solid var(--border-color, #eee);
  border-radius: 12px;
  overflow: hidden;
  transition: box-shadow 0.2s;
}

.channel-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
  height: 60px;
  box-sizing: border-box;
}

.channel-card-header:hover {
  background: var(--bg-secondary, #f8f8fc);
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
  color: var(--text-primary, #1a1a2e);
}

.unsaved-hint {
  color: #f59e0b;
  font-size: 13px;
  font-weight: 500;
  margin-left: 8px;
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
  color: var(--text-secondary, #999);
  transition: transform 0.3s;
}

.expand-arrow.expanded {
  transform: rotate(180deg);
}

.channel-card-body {
  padding: 0 20px 20px;
  border-top: 1px solid var(--border-color, #f0f0f0);
  padding-top: 16px;
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

.form-group input {
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

.form-group input:focus {
  outline: none;
  border-color: #667eea;
}

.required-mark {
  color: #e74c3c;
  margin-left: 2px;
}

.channel-save-area {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
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

.btn-sm {
  padding: 8px 18px;
  font-size: 13px;
}
</style>
