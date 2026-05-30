<template>
  <div class="stats-dashboard">
    <div class="panel">
      <div class="panel-header">
        <h2>📊 {{ t('dashboard.title') }}</h2>
        <button class="btn btn-sm btn-secondary" @click="loadData" :disabled="loading">
          🔄 刷新
        </button>
      </div>

      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <span>{{ t('common.loading') || '加载中...' }}</span>
      </div>

      <div v-else-if="error" class="error-state">
        <p>{{ error }}</p>
        <button class="btn btn-primary" @click="loadData">{{ t('common.retry') || '重试' }}</button>
      </div>

      <div v-else class="stats-content">
        <!-- 核心指标 -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon">📊</div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.session.total }}</div>
              <div class="stat-label">{{ t('dashboard.totalPushes') }}</div>
            </div>
          </div>

          <div class="stat-card success">
            <div class="stat-icon">✅</div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.session.success }}</div>
              <div class="stat-label">{{ t('dashboard.successful') }}</div>
            </div>
          </div>

          <div class="stat-card failed">
            <div class="stat-icon">❌</div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.session.failed }}</div>
              <div class="stat-label">{{ t('dashboard.failed') }}</div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-value large">{{ successRate }}%</div>
            <div class="stat-label">{{ t('dashboard.successRate') }}</div>
            <div class="trend-indicator" :class="stats.trend.direction">
              <span class="trend-icon">{{ trendIcon }}</span>
              {{ stats.trend.direction === 'up' ? t('dashboard.trend.up') : stats.trend.direction === 'down' ? t('dashboard.trend.down') : t('dashboard.trend.stable') }}
            </div>
          </div>
        </div>

        <!-- 近期成功率 -->
        <div class="summary-bar">
          <div class="summary-item">
            <span class="summary-label">总记录数</span>
            <span class="summary-value">{{ stats.totalRecords || 0 }}</span>
          </div>
          <div class="summary-item summary-highlight">
            <span class="summary-label">近期成功率</span>
            <span class="summary-value">{{ stats.recentSuccessRate || 0 }}%</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">平均延迟</span>
            <span class="summary-value">{{ metrics?.avgLatency || 0 }}ms</span>
          </div>
        </div>

        <!-- 推送趋势图 -->
        <div class="section">
          <h3>{{ t('dashboard.recentActivity') }}</h3>
          <div class="bar-chart">
            <div v-for="(item, i) in stats.recent" :key="i" class="bar-group">
              <div class="bar-container">
                <div class="bar bar-success" :style="{ height: `${(item.success / maxRecent) * 100}%` }"></div>
                <div class="bar bar-failed" :style="{ height: `${(item.failed / maxRecent) * 100}%` }"></div>
              </div>
              <div class="bar-label">{{ item.date }}</div>
            </div>
          </div>
        </div>

        <!-- 渠道使用统计 -->
        <div class="section">
          <h3>渠道使用统计</h3>
          <div v-if="Object.keys(stats.channelUsage || {}).length === 0" class="empty-hint">
            <p>暂无推送记录</p>
          </div>
          <div v-else class="channel-stats-grid">
            <div v-for="(data, channel) in stats.channelUsage" :key="channel" class="channel-stat-card">
              <div class="channel-header">
                <div class="channel-icon">{{ getChannelIcon(channel) }}</div>
                <div class="channel-name">{{ getChannelName(channel) }}</div>
              </div>
              <div class="channel-stats">
                <div class="channel-stat-row">
                  <span class="row-label">总推送</span>
                  <span class="row-value">{{ data.count }}</span>
                </div>
                <div class="channel-stat-row">
                  <span class="row-label">成功</span>
                  <span class="row-value success">{{ data.success }}</span>
                </div>
                <div class="channel-stat-row">
                  <span class="row-label">失败</span>
                  <span class="row-value failed">{{ data.failed }}</span>
                </div>
                <div class="channel-stat-row">
                  <span class="row-label">成功率</span>
                  <span class="row-value">{{ data.count > 0 ? Math.round((data.success / data.count) * 100) : 0 }}%</span>
                </div>
                <div class="channel-stat-row">
                  <span class="row-label">平均延迟</span>
                  <span class="row-value">{{ Math.round(data.avgLatency) }}ms</span>
                </div>
              </div>
              <div class="channel-bar">
                <div class="channel-bar-fill" :style="{ width: `${data.count > 0 ? (data.success / data.count) * 100 : 0}%` }"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { t } from '@/i18n';
import { getPushStats } from '@/api';

const props = defineProps<{
  accessToken: string;
}>();

const loading = ref(true);
const error = ref('');
const stats = ref({
  session: { total: 0, success: 0, failed: 0 },
  trend: { rate: 0, direction: 'stable' as 'up' | 'down' | 'stable' },
  recent: [] as Array<{ date: string; pushes: number; success: number; failed: number }>,
  channelUsage: {} as Record<string, { count: number; success: number; failed: number; avgLatency: number }>,
  recentSuccessRate: 0,
  totalRecords: 0,
});
const metrics = ref<{ total: number; success: number; failed: number; byChannel: Record<string, { success: number; failed: number }>; avgLatency: number } | null>(null);
let refreshTimer: ReturnType<typeof setInterval> | null = null;

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
  ntfy: 'ntfy',
  email: '邮件',
};

function getChannelIcon(channelId: string): string {
  return channelIconMap[channelId] || '📡';
}

function getChannelName(channelId: string): string {
  return channelNameMap[channelId] || channelId;
}

const successRate = computed(() => {
  const total = stats.value.session.total;
  if (total === 0) return '0.0';
  return ((stats.value.session.success / total) * 100).toFixed(1);
});

const maxRecent = computed(() => {
  return Math.max(...stats.value.recent.map((r) => Math.max(r.success, r.failed)), 1);
});

const trendIcon = computed(() => {
  switch (stats.value.trend.direction) {
    case 'up': return '↑';
    case 'down': return '↓';
    default: return '→';
  }
});

async function loadData() {
  if (!props.accessToken) return;

  loading.value = true;
  error.value = '';
  try {
    const statsData = await getPushStats(props.accessToken);
    stats.value = {
      session: statsData.session,
      trend: statsData.trend,
      recent: statsData.recent,
      channelUsage: statsData.channelUsage || {},
      recentSuccessRate: statsData.recentSuccessRate || 0,
      totalRecords: statsData.totalRecords || 0,
    };
    // metrics 保留兼容性
    metrics.value = {
      total: statsData.session.total,
      success: statsData.session.success,
      failed: statsData.session.failed,
      byChannel: {},
      avgLatency: 0,
    };
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadData();
  refreshTimer = setInterval(loadData, 30000);
});

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});

watch(() => props.accessToken, loadData);

defineExpose({ loadData });
</script>

<style scoped>
.stats-dashboard {
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
  align-items: flex-start;
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

.error-state {
  text-align: center;
  padding: 60px 20px;
  color: #ff4d4f;
}

.error-state .btn {
  margin-top: 16px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 32px;
}

.stat-card {
  background: var(--bg-secondary, #f8f9fa);
  border-radius: 10px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  font-size: 28px;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border-radius: 10px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary, #1a1a2e);
  line-height: 1;
}

.stat-value.large {
  font-size: 36px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.stat-label {
  font-size: 13px;
  color: var(--text-secondary, #666);
  margin-top: 4px;
}

.trend-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #666;
  margin-top: 4px;
}

.trend-indicator.up {
  color: #52c41a;
}

.trend-indicator.down {
  color: #ff4d4f;
}

.section {
  margin-top: 24px;
}

.section h3 {
  font-size: 15px;
  color: var(--text-primary, #1a1a2e);
  margin: 0 0 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
}

.summary-bar {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}

.summary-item {
  background: var(--bg-secondary, #f8f9fa);
  padding: 16px 20px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary-highlight {
  background: #d1fae5;
  border: 1px solid #a7f3d0;
}

.summary-label {
  font-size: 12px;
  color: var(--text-secondary, #666);
}

.summary-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary, #1a1a2e);
}

.summary-highlight .summary-value {
  color: #065f46;
}

.empty-hint {
  text-align: center;
  padding: 24px;
  color: var(--text-secondary, #999);
  font-size: 14px;
}

.channel-stat-card {
  background: var(--bg-secondary, #f8f9fa);
  border-radius: 10px;
  padding: 16px;
  border: 1px solid var(--border-color, #e0e0e0);
  transition: all 0.2s;
}

.channel-stat-card:hover {
  border-color: #667eea;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
}

.channel-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.channel-icon {
  font-size: 24px;
}

.channel-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
}

.channel-stats {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}

.channel-stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.row-label {
  color: var(--text-secondary, #666);
}

.row-value {
  font-weight: 600;
  color: var(--text-primary, #333);
}

.row-value.success {
  color: #10b981;
}

.row-value.failed {
  color: #ef4444;
}

.channel-bar {
  height: 6px;
  background: #e8e8e8;
  border-radius: 3px;
  overflow: hidden;
}

.channel-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #10b981 0%, #059669 100%);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.channel-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.bar-chart {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  height: 120px;
  padding: 0 8px;
}

.bar-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  justify-content: flex-end;
}

.bar-container {
  width: 100%;
  display: flex;
  gap: 2px;
  align-items: flex-end;
  flex: 1;
  max-width: 40px;
}

.bar {
  flex: 1;
  border-radius: 3px 3px 0 0;
  min-height: 4px;
}

.bar-success {
  background: linear-gradient(180deg, #52c41a 0%, #73d13d 100%);
}

.bar-failed {
  background: linear-gradient(180deg, #ff4d4f 0%, #ff7875 100%);
}

.bar-label {
  font-size: 11px;
  color: var(--text-secondary, #666);
  margin-top: 8px;
  text-align: center;
}

.avg-latency {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-secondary, #f8f9fa);
  border-radius: 8px;
  font-size: 14px;
  color: var(--text-secondary, #666);
}

.latency-value {
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
}

.btn {
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-sm {
  padding: 6px 14px;
  font-size: 13px;
  height: 30px;
}

.btn-secondary {
  background: var(--bg-secondary, #f0f0f0);
  color: var(--text-primary, #333);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--border-color, #e0e0e0);
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
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

@media (max-width: 768px) {
  .panel {
    padding: 16px;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 24px;
  }

  .summary-bar {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .stat-card {
    padding: 16px;
    gap: 12px;
  }

  .stat-icon {
    font-size: 24px;
    width: 40px;
    height: 40px;
  }

  .stat-value {
    font-size: 24px;
  }

  .stat-value.large {
    font-size: 30px;
  }

  .stat-label {
    font-size: 12px;
  }

  .section h3 {
    font-size: 14px;
  }

  .bar-chart {
    height: 100px;
    gap: 8px;
  }

  .bar-label {
    font-size: 10px;
  }

  .channel-stats-grid {
    grid-template-columns: 1fr;
  }

  .channel-stat-card {
    padding: 14px;
  }

  .avg-latency {
    font-size: 13px;
    padding: 10px 14px;
  }

  .latency-value {
    font-size: 16px;
  }
}

@media (max-width: 480px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .stat-card {
    padding: 14px;
  }

  .bar-chart {
    padding: 0;
  }
}
</style>
