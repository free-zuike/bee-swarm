<template>
  <div class="channel-health-check">
    <div class="panel">
      <div class="panel-header">
        <h2>💚 渠道健康检查</h2>
        <button class="btn btn-primary" @click="checkAllChannels" :disabled="checking">
          {{ checking ? '检查中...' : '批量检查' }}
        </button>
      </div>

      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <span>加载中...</span>
      </div>

      <template v-else>
        <div class="health-summary">
          <div class="summary-card">
            <div class="summary-value">{{ totalChannels }}</div>
            <div class="summary-label">总渠道数</div>
          </div>
          <div class="summary-card summary-healthy">
            <div class="summary-value">{{ healthyCount }}</div>
            <div class="summary-label">健康</div>
          </div>
          <div class="summary-card summary-warning">
            <div class="summary-value">{{ warningCount }}</div>
            <div class="summary-label">需关注</div>
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
              <div class="channel-name">{{ getChannelName(ch.channel) }}</div>
            </div>

            <div class="channel-status">
              <span class="status-badge" :class="getStatusClass(ch)">
                {{ getStatusText(ch) }}
              </span>
              <p class="status-message" v-if="ch.message">{{ ch.message }}</p>
              <p class="status-tested" v-if="ch.testedAt">
                测试时间: {{ formatTime(ch.testedAt) }}
              </p>
            </div>

            <button
              class="btn btn-sm btn-test"
              @click="testSingleChannel(ch.channel)"
              :disabled="testingChannel === ch.channel"
            >
              {{ testingChannel === ch.channel ? '测试中...' : '测试' }}
            </button>
          </div>
        </div>

        <div v-if="testResult" class="test-result" :class="{ success: testResult.healthy }">
          <h4>测试结果</h4>
          <p class="result-channel">
            {{ getChannelIcon(testResult.channel) }} {{ getChannelName(testResult.channel) }}
          </p>
          <p class="result-status" :class="{ healthy: testResult.healthy }">
            {{ testResult.healthy ? '✅ 渠道正常' : '❌ 测试失败' }}
          </p>
          <p class="result-message">{{ testResult.message }}</p>
          <p class="result-time">测试时间: {{ formatTime(testResult.testedAt) }}</p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
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
const healthyCount = computed(() => channelResults.value.filter(ch => ch.healthy).length);
const warningCount = computed(() => channelResults.value.filter(ch => !ch.healthy).length);

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
};

function getChannelIcon(channel: string): string {
  return channelIcons[channel] || '📡';
}

function getChannelName(channel: string): string {
  const names: Record<string, string> = {
    wework: '企业微信',
    dingtalk: '钉钉',
    feishu: '飞书',
    telegram: 'Telegram',
    bark: 'Bark',
    ntfy: 'ntfy',
    email: '邮件',
    slack: 'Slack',
    discord: 'Discord',
  };
  return names[channel] || channel;
}

function getCardClass(ch: ChannelHealth): string {
  if (ch.healthy) return 'healthy';
  return 'warning';
}

function getStatusClass(ch: ChannelHealth): string {
  if (ch.healthy) return 'healthy';
  return 'warning';
}

function getStatusText(ch: ChannelHealth): string {
  if (ch.healthy) return '健康';
  return '需关注';
}

function formatTime(time: string): string {
  try {
    return new Date(time).toLocaleString('zh-CN');
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
      showToast('渠道检查完成', 'success');
    }
  } catch (err: any) {
    showToast(err.message || '渠道检查失败', 'error');
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

    // 更新列表中的状态
    const idx = channelResults.value.findIndex(ch => ch.channel === channel);
    if (idx >= 0) {
      channelResults.value[idx] = {
        ...channelResults.value[idx],
        healthy: result.healthy,
        message: result.message,
        testedAt: result.testedAt,
      };
    }

    if (result.healthy) {
      showToast(`${getChannelName(channel)} 测试成功`, 'success');
    } else {
      showToast(`${getChannelName(channel)} 测试失败: ${result.message}`, 'error');
    }
  } catch (err: any) {
    showToast(err.message || '测试失败', 'error');
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
  background: var(--bg-panel, white);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: background 0.3s;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
}

.panel-header h2 {
  font-size: 18px;
  color: var(--text-primary, #1a1a2e);
  margin: 0;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 0;
  color: var(--text-secondary, #666);
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.health-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.summary-card {
  background: var(--bg-secondary, #f5f5f5);
  padding: 16px;
  border-radius: 8px;
  text-align: center;
}

.summary-healthy {
  background: #d1fae5;
  border: 1px solid #a7f3d0;
}

.summary-warning {
  background: #fee2e2;
  border: 1px solid #fecaca;
}

.summary-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary, #1a1a2e);
}

.summary-healthy .summary-value {
  color: #065f46;
}

.summary-warning .summary-value {
  color: #991b1b;
}

.summary-label {
  font-size: 13px;
  color: var(--text-secondary, #666);
  margin-top: 4px;
}

.channel-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.channel-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 8px;
  border: 1px solid var(--border-color, #e0e0e0);
  transition: all 0.2s;
}

.channel-card.healthy {
  background: #f0fdf4;
  border-color: #bbf7d0;
}

.channel-card.warning {
  background: #fef2f2;
  border-color: #fecaca;
}

.channel-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.channel-icon {
  font-size: 24px;
}

.channel-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #333);
}

.channel-status {
  flex: 2;
  min-width: 0;
}

.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}

.status-badge.healthy {
  background: #d1fae5;
  color: #065f46;
}

.status-badge.warning {
  background: #fee2e2;
  color: #991b1b;
}

.status-message {
  font-size: 12px;
  color: var(--text-secondary, #666);
  margin: 4px 0 0;
}

.status-tested {
  font-size: 11px;
  color: var(--text-secondary, #999);
  margin: 2px 0 0;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  height: 40px;
  box-sizing: border-box;
}

.btn-sm {
  padding: 6px 14px;
  font-size: 13px;
  height: 34px;
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

.btn-test {
  background: var(--bg-panel, white);
  color: #667eea;
  border: 1px solid #667eea;
  flex-shrink: 0;
}

.btn-test:hover:not(:disabled) {
  background: #667eea;
  color: white;
}

.btn-test:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.test-result {
  margin-top: 20px;
  padding: 16px;
  border-radius: 8px;
  background: var(--bg-secondary, #f5f5f5);
  border: 1px solid var(--border-color, #e0e0e0);
}

.test-result.success {
  background: #d1fae5;
  border-color: #a7f3d0;
}

.test-result:not(.success) {
  background: #fee2e2;
  border-color: #fecaca;
}

.test-result h4 {
  font-size: 15px;
  color: var(--text-primary, #333);
  margin: 0 0 8px;
}

.result-channel {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
  margin: 0 0 4px;
}

.result-status {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 4px;
}

.result-status.healthy {
  color: #065f46;
}

.result-message {
  font-size: 13px;
  color: var(--text-secondary, #666);
  margin: 0 0 4px;
}

.result-time {
  font-size: 11px;
  color: var(--text-secondary, #999);
  margin: 0;
}

@media (max-width: 768px) {
  .panel {
    padding: 16px;
  }

  .panel-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .panel-header h2 {
    font-size: 16px;
  }

  .health-summary {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .summary-value {
    font-size: 22px;
  }

  .channel-card {
    flex-wrap: wrap;
    gap: 12px;
    padding: 12px;
  }

  .channel-info {
    flex: 1 1 100%;
  }

  .channel-status {
    flex: 1 1 100%;
    flex-direction: column;
    align-items: flex-start;
  }

  .channel-status-info {
    width: 100%;
  }

  .btn-test {
    width: 100%;
  }

  .test-result {
    padding: 12px;
    margin-top: 16px;
  }

  .test-result h4 {
    font-size: 14px;
  }

  .result-channel {
    font-size: 13px;
  }
}

@media (max-width: 480px) {
  .panel {
    padding: 12px;
  }

  .panel-header h2 {
    font-size: 14px;
  }

  .health-summary {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .summary-value {
    font-size: 20px;
  }

  .summary-label {
    font-size: 11px;
  }

  .channel-name {
    font-size: 13px;
  }

  .channel-type {
    font-size: 10px;
    padding: 2px 6px;
  }

  .status-badge {
    font-size: 11px;
    padding: 3px 8px;
  }

  .channel-last-check {
    font-size: 10px;
  }

  .btn-sm {
    padding: 5px 10px;
    font-size: 11px;
  }

  .test-result {
    padding: 10px;
  }

  .result-channel {
    font-size: 12px;
  }

  .result-status {
    font-size: 13px;
  }

  .result-message {
    font-size: 12px;
  }
}
</style>
