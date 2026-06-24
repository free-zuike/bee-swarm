<template>
  <div class="channel-health-check">
    <div class="panel">
      <div class="panel-header">
        <div class="header-left">
          <div class="header-icon">💚</div>
          <div class="header-text">
            <h2>{{ t('health.title') }}</h2>
            <p class="header-subtitle">{{ t('health.subtitle') }}</p>
          </div>
        </div>
        <button class="btn btn-primary" @click="checkAllChannels" :disabled="checking">
          <span v-if="checking" class="btn-spinner"></span>
          {{ checking ? t('health.checking') : t('health.batchCheck') }}
        </button>
      </div>

      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <span>{{ t('label.loading') }}</span>
      </div>

      <template v-else>
        <div class="health-summary">
          <div class="summary-card">
            <div class="summary-icon">📊</div>
            <div class="summary-content">
              <div class="summary-value">{{ totalChannels }}</div>
              <div class="summary-label">{{ t('health.totalChannels') }}</div>
            </div>
          </div>
          <div class="summary-card summary-healthy">
            <div class="summary-icon">✅</div>
            <div class="summary-content">
              <div class="summary-value">{{ healthyCount }}</div>
              <div class="summary-label">{{ t('health.healthy') }}</div>
            </div>
          </div>
          <div class="summary-card summary-warning">
            <div class="summary-icon">⚠️</div>
            <div class="summary-content">
              <div class="summary-value">{{ warningCount }}</div>
              <div class="summary-label">{{ t('health.warning') }}</div>
            </div>
          </div>
        </div>

        <div class="channel-list">
          <div
            v-for="ch in channelResults"
            :key="ch.channel"
            class="channel-card"
            :class="getCardClass(ch)"
          >
            <div class="channel-info">
              <div class="channel-icon">{{ getChannelIcon(ch.channel) }}</div>
              <div class="channel-details">
                <div class="channel-name">{{ getChannelName(ch.channel) }}</div>
                <div class="channel-type">{{ ch.channel }}</div>
              </div>
            </div>

            <div class="channel-status">
              <div class="status-top">
                <span class="status-badge" :class="getStatusClass(ch)">
                  <span class="status-dot"></span>
                  {{ getStatusText(ch) }}
                </span>
              </div>
              <p class="status-message" v-if="!ch.healthy && ch.message">
                {{ translateBackendMessage(ch.message) }}
              </p>
              <p class="status-tested" v-if="ch.testedAt">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12,6 12,12 16,14"></polyline>
                </svg>
                {{ formatTime(ch.testedAt) }}
              </p>
            </div>

            <button
              class="btn btn-sm btn-test"
              @click="testSingleChannel(ch.channel)"
              :disabled="testingChannel === ch.channel"
            >
              <span v-if="testingChannel === ch.channel" class="btn-spinner-sm"></span>
              {{ testingChannel === ch.channel ? t('health.testing') : t('health.test') }}
            </button>
          </div>
        </div>

        <div v-if="testResult" class="test-result" :class="{ success: testResult.healthy }">
          <div class="test-result-header">
            <div class="result-icon">{{ testResult.healthy ? '✅' : '❌' }}</div>
            <div class="result-header-text">
              <h4>{{ getChannelName(testResult.channel) }} {{ t('health.testResult') }}</h4>
              <p class="result-header-sub">{{ t('health.report') }}</p>
            </div>
          </div>
          <div class="result-content">
            <div class="result-row">
              <span class="result-label">{{ t('health.status') }}</span>
              <span class="result-value" :class="{ healthy: testResult.healthy }">
                {{ testResult.healthy ? t('health.channelNormal') : t('health.testFailed') }}
              </span>
            </div>
            <div class="result-row">
              <span class="result-label">{{ t('health.detail') }}</span>
              <span class="result-value">{{ translateBackendMessage(testResult.message) }}</span>
            </div>
            <div class="result-row">
              <span class="result-label">{{ t('health.time') }}</span>
              <span class="result-value">{{ formatTime(testResult.testedAt) }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { t } from '@/i18n';
import { useGlobalToast } from '@/composables/useToast';
import { checkAllChannelsHealth, testChannelHealth } from '@/api';
import type { PushChannel, ChannelHealth } from '@/types';

const props = defineProps<{
  accessToken: string;
}>();

const { showToast } = useGlobalToast();

const loading = ref(true);
const checking = ref(false);
const testingChannel = ref<string | null>(null);
const channelResults = ref<Array<ChannelHealth & { testedAt?: string }>>([]);
const testResult = ref<{
  channel: PushChannel;
  healthy: boolean;
  message: string;
  testedAt: string;
} | null>(null);

const totalChannels = computed(() => channelResults.value.length);
const healthyCount = computed(() => channelResults.value.filter((ch) => ch.healthy).length);
const warningCount = computed(() => channelResults.value.filter((ch) => !ch.healthy).length);

const channelIcons: Record<string, string> = {
  wework: '💼',
  dingtalk: '🅰️',
  feishu: '🪶',
  telegram: '✈️',
  bark: '📱',
  ntfy: '📢',
  email: '📧',
  slack: '💬',
  discord: '🎮',
  serverchan: '🔔',
  pushplus: '➕',
  webhook: '🔗',
  gotify: '🔔',
  line: '💬',
  teams: '🤝',
  pushover: '🔔',
};

function getChannelIcon(channel: string): string {
  return channelIcons[channel] || '📡';
}

function getChannelName(channel: string): string {
  return t(`channel.${channel}`) || channel;
}

function getCardClass(ch: ChannelHealth): string {
  if (ch.healthy) return 'healthy';
  return 'warning';
}

function getStatusClass(ch: ChannelHealth): string {
  if (ch.healthy) return 'healthy';
  return 'warning';
}

function translateBackendMessage(msg: string): string {
  const messageMap: Record<string, string> = {
    渠道未配置: 'message.channel_not_configured',
    没有已启用的推送渠道: 'message.no_enabled_channel',
  };

  const key = messageMap[msg];
  if (key) {
    return t(key);
  }

  return msg;
}

function getStatusText(ch: ChannelHealth): string {
  if (ch.healthy) return t('health.healthy');
  return t('health.warning');
}

function formatTime(time: string): string {
  try {
    return new Date(time).toLocaleString();
  } catch {
    return time;
  }
}

async function checkAllChannels() {
  checking.value = true;
  try {
    const data = await checkAllChannelsHealth(props.accessToken);
    channelResults.value = data.channels || [];
    if (data.channels.length > 0) {
      showToast(t('health.checkComplete'), 'success');
    }
  } catch (err: unknown) {
    showToast((err as Error).message || t('health.checkFailed'), 'error');
  } finally {
    checking.value = false;
  }
}

async function testSingleChannel(channel: PushChannel) {
  testingChannel.value = channel;
  testResult.value = null;

  try {
    const result = await testChannelHealth(props.accessToken, channel);
    testResult.value = result;

    const idx = channelResults.value.findIndex((ch) => ch.channel === channel);
    if (idx >= 0) {
      channelResults.value[idx] = {
        ...channelResults.value[idx],
        healthy: result.healthy,
        message: result.message,
        testedAt: result.testedAt,
      };
    }

    if (result.healthy) {
      showToast(t('health.testSuccess', { channel: getChannelName(channel) }), 'success');
    } else {
      showToast(
        t('health.testFail', { channel: getChannelName(channel) }) +
          ': ' +
          translateBackendMessage(result.message),
        'error'
      );
    }
  } catch (err: unknown) {
    showToast((err as Error).message || t('health.testError'), 'error');
  } finally {
    testingChannel.value = null;
  }
}

onMounted(async () => {
  loading.value = true;
  await checkAllChannels();
  loading.value = false;
});
</script>

<style scoped>
.channel-health-check {
  margin-bottom: 24px;
}

.panel {
  background: var(--bg-panel, #ffffff);
  border-radius: 16px;
  padding: 28px;
  box-shadow:
    0 4px 24px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.04);
  transition: all 0.3s ease;
  border: 1px solid var(--border-color, #e8e8e8);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 28px;
  flex-wrap: wrap;
  gap: 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.header-icon {
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.header-text h2 {
  font-size: 20px;
  color: var(--text-primary, #1a1a2e);
  margin: 0;
  font-weight: 700;
  letter-spacing: -0.3px;
}

.header-subtitle {
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  margin: 4px 0 0;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 60px 0;
  color: var(--text-secondary, #6b7280);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color, #e5e7eb);
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.health-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 28px;
}

.summary-card {
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  padding: 20px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 14px;
  border: 1px solid #e2e8f0;
  transition: all 0.3s ease;
}

.summary-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
}

.summary-healthy {
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
  border-color: #86efac;
}

.summary-warning {
  background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
  border-color: #fca5a5;
}

.summary-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  background: rgba(255, 255, 255, 0.7);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.summary-healthy .summary-icon {
  background: rgba(34, 197, 94, 0.1);
}

.summary-warning .summary-icon {
  background: rgba(239, 68, 68, 0.1);
}

.summary-content {
  display: flex;
  flex-direction: column;
}

.summary-value {
  font-size: 32px;
  font-weight: 800;
  color: var(--text-primary, #1f2937);
  line-height: 1;
}

.summary-healthy .summary-value {
  color: #166534;
}

.summary-warning .summary-value {
  color: #991b1b;
}

.summary-label {
  font-size: 13px;
  color: var(--text-secondary, #64748b);
  margin-top: 6px;
  font-weight: 500;
}

.channel-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.channel-card {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 20px;
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.channel-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: #e5e7eb;
  transition: all 0.3s ease;
}

.channel-card:hover {
  transform: translateX(4px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
}

.channel-card.healthy {
  background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
  border-color: #a7f3d0;
}

.channel-card.healthy::before {
  background: #22c55e;
}

.channel-card.warning {
  background: linear-gradient(135deg, #fef2f2 0%, #fef2f2 100%);
  border-color: #fecaca;
}

.channel-card.warning::before {
  background: #ef4444;
}

.channel-info {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1;
  min-width: 0;
}

.channel-icon {
  width: 48px;
  height: 48px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.channel-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.channel-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary, #1f2937);
}

.channel-type {
  font-size: 12px;
  color: var(--text-secondary, #64748b);
  font-family: 'Monaco', 'Menlo', monospace;
  background: rgba(0, 0, 0, 0.03);
  padding: 2px 8px;
  border-radius: 6px;
  display: inline-block;
}

.channel-status {
  flex: 2;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.status-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 100px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.2px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.status-badge.healthy {
  background: rgba(34, 197, 94, 0.15);
  color: #166534;
}

.status-badge.healthy .status-dot {
  background: #22c55e;
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.2);
}

.status-badge.warning {
  background: rgba(239, 68, 68, 0.15);
  color: #991b1b;
}

.status-badge.warning .status-dot {
  background: #ef4444;
  box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.2);
}

.status-message {
  font-size: 13px;
  color: var(--text-secondary, #4b5563);
  margin: 0;
}

.status-tested {
  font-size: 11px;
  color: var(--text-tertiary, #9ca3af);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-tested svg {
  width: 14px;
  height: 14px;
  opacity: 0.6;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  height: 42px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.btn-spinner,
.btn-spinner-sm {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.btn-sm {
  padding: 8px 16px;
  font-size: 13px;
  height: 36px;
  border-radius: 8px;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.btn-test {
  background: white;
  color: #667eea;
  border: 2px solid #667eea;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.1);
}

.btn-test:hover:not(:disabled) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.btn-test:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #f3f4f6;
  color: #9ca3af;
  border-color: #e5e7eb;
}

.test-result {
  margin-top: 24px;
  padding: 24px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border: 1px solid #e2e8f0;
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.test-result.success {
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
  border-color: #86efac;
}

.test-result:not(.success) {
  background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
  border-color: #fca5a5;
}

.test-result-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.result-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.test-result.success .result-icon {
  background: rgba(34, 197, 94, 0.1);
}

.test-result:not(.success) .result-icon {
  background: rgba(239, 68, 68, 0.1);
}

.result-header-text h4 {
  font-size: 16px;
  color: var(--text-primary, #1f2937);
  margin: 0;
  font-weight: 700;
}

.result-header-sub {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
  margin: 4px 0 0;
}

.result-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.result-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
}

.result-label {
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  font-weight: 500;
}

.result-value {
  font-size: 14px;
  color: var(--text-primary, #1f2937);
  font-weight: 600;
}

.result-value.healthy {
  color: #166534;
}

.test-result:not(.success) .result-value {
  color: #991b1b;
}

@media (max-width: 768px) {
  .panel {
    padding: 20px;
    border-radius: 12px;
  }

  .panel-header {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }

  .btn-primary {
    width: 100%;
    justify-content: center;
  }

  .header-text h2 {
    font-size: 18px;
  }

  .health-summary {
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  .summary-card {
    padding: 16px;
    flex-direction: column;
    text-align: center;
    gap: 10px;
  }

  .summary-icon {
    width: 40px;
    height: 40px;
    font-size: 20px;
  }

  .summary-value {
    font-size: 24px;
  }

  .channel-card {
    flex-wrap: wrap;
    gap: 14px;
    padding: 16px;
  }

  .channel-info {
    flex: 1 1 100%;
  }

  .channel-status {
    flex: 1 1 100%;
    flex-direction: column;
    align-items: flex-start;
  }

  .btn-test {
    width: 100%;
    justify-content: center;
  }

  .test-result {
    padding: 18px;
    margin-top: 20px;
  }

  .result-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}

@media (max-width: 480px) {
  .panel {
    padding: 16px;
  }

  .header-icon {
    width: 40px;
    height: 40px;
    font-size: 20px;
  }

  .header-text h2 {
    font-size: 16px;
  }

  .health-summary {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .summary-card {
    flex-direction: row;
    text-align: left;
  }

  .summary-value {
    font-size: 22px;
  }

  .channel-icon {
    width: 40px;
    height: 40px;
    font-size: 20px;
  }

  .channel-name {
    font-size: 14px;
  }

  .test-result-header {
    flex-direction: column;
    text-align: center;
  }
}

/* Dark mode */
.dark .summary-card {
  background: var(--bg-secondary, #1e1e2e);
  border-color: var(--border-color, #333);
}

.dark .summary-healthy {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.08) 100%);
  border-color: rgba(34, 197, 94, 0.3);
}

.dark .summary-warning {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(239, 68, 68, 0.08) 100%);
  border-color: rgba(239, 68, 68, 0.3);
}

.dark .summary-icon {
  background: rgba(255, 255, 255, 0.1);
}

.dark .summary-healthy .summary-icon {
  background: rgba(34, 197, 94, 0.2);
}

.dark .summary-warning .summary-icon {
  background: rgba(239, 68, 68, 0.2);
}

.dark .summary-healthy .summary-value {
  color: #4ade80;
}

.dark .summary-warning .summary-value {
  color: #f87171;
}

.dark .channel-card {
  background: var(--bg-secondary, #1e1e2e);
  border-color: var(--border-color, #333);
}

.dark .channel-card.healthy {
  border-left-color: #22c55e;
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(34, 197, 94, 0.03) 100%);
}

.dark .channel-card.error {
  border-left-color: #ef4444;
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(239, 68, 68, 0.03) 100%);
}

.dark .channel-name {
  color: var(--text-primary, #e0e0e0);
}

.dark .channel-id {
  color: var(--text-secondary, #999);
}

.dark .status-badge.healthy {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
}

.dark .status-badge.error {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.dark .last-check {
  color: var(--text-secondary, #888);
}

.dark .error-message {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.2);
}
</style>
