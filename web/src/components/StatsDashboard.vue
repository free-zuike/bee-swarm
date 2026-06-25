<template>
  <div class="stats-dashboard">
    <div class="panel">
      <div class="panel-header">
        <h2>{{ t('dashboard.title') }}</h2>
        <div class="panel-actions">
          <select v-model="timeRange" class="time-range-select" @change="loadData">
            <option value="7">{{ t('label.recent_7_days') }}</option>
            <option value="30">{{ t('label.recent_30_days') }}</option>
            <option value="90">{{ t('label.recent_90_days') }}</option>
          </select>
          <button class="btn btn-sm btn-secondary" @click="loadData" :disabled="loading">
            {{ t('label.refresh') }}
          </button>
        </div>
      </div>

      <div v-if="loading" class="loading-state">
        <StatsSkeleton />
      </div>

      <div v-else-if="error" class="error-state">
        <p>{{ error }}</p>
        <button class="btn btn-primary" @click="loadData">
          {{ t('common.retry') || t('label.retry') }}
        </button>
      </div>

      <div v-else class="stats-content">
        <PerformanceMetricsChart :metrics="performanceMetrics" />

        <div v-if="stats.comparison" class="comparison-card" :class="stats.comparison.direction">
          <div class="comparison-header">
            <span class="comparison-title">{{ t('label.period_comparison') || '环比对比' }}</span>
          </div>
          <div class="comparison-body">
            <div class="comparison-item">
              <span class="comparison-label">{{ t('label.current_period') || '当前周期' }}</span>
              <span class="comparison-value">{{ stats.comparison.currentPeriodRate }}%</span>
            </div>
            <div class="comparison-item">
              <span class="comparison-label">{{ t('label.previous_period') || '上一周期' }}</span>
              <span class="comparison-value">{{ stats.comparison.prevPeriodRate }}%</span>
            </div>
            <div class="comparison-item change">
              <span class="comparison-label">{{ t('label.change') || '变化' }}</span>
              <span class="comparison-value" :class="stats.comparison.direction">
                {{ stats.comparison.change > 0 ? '+' : '' }}{{ stats.comparison.change }}%
                <span v-if="stats.comparison.direction === 'up'" class="trend-arrow">↑</span>
                <span v-else-if="stats.comparison.direction === 'down'" class="trend-arrow">↓</span>
                <span v-else class="trend-arrow">→</span>
              </span>
            </div>
          </div>
        </div>

        <div class="charts-row">
          <div class="section chart-section">
            <h3>{{ t('dashboard.recentActivity') }}</h3>
            <PushTrendChart :data="trendChartData" :title="''" height="350px" />
          </div>

          <div class="section chart-section">
            <h3>{{ t('label.success_rate') }}</h3>
            <SuccessRateChart :data="successRateChartData" :title="''" height="350px" />
          </div>
        </div>

        <div class="charts-row">
          <div
            v-if="activityData.length > 0"
            class="section chart-section"
            style="grid-column: 1 / -1"
          >
            <h3>{{ t('label.user_activity') || '用户活动分析 (7天)' }}</h3>
            <ActivityChart :data="activityData" height="350px" />
          </div>
        </div>

        <div class="charts-row">
          <div
            v-if="Object.keys(stats.channelUsage || {}).length > 0"
            class="section chart-section"
          >
            <h3>{{ t('label.channel_ratio') }}</h3>
            <ChannelDistributionChart :data="channelChartData" :title="''" height="350px" />
          </div>

          <div
            v-if="Object.keys(stats.channelUsage || {}).length > 0"
            class="section chart-section"
          >
            <h3>{{ t('label.latency_distribution') }}</h3>
            <LatencyDistributionChart :data="latencyChartData" :title="''" height="350px" />
          </div>
        </div>

        <div v-if="Object.keys(stats.channelUsage || {}).length > 0" class="section">
          <h3>{{ t('label.channel_usage_stats') }}</h3>
          <div class="channel-stats-grid">
            <div
              v-for="(data, channel) in stats.channelUsage"
              :key="channel"
              class="channel-stat-card"
            >
              <div class="channel-header">
                <div class="channel-icon">{{ getChannelIcon(channel) }}</div>
                <div class="channel-name">{{ getChannelName(channel) }}</div>
              </div>
              <div class="channel-stats">
                <div class="channel-stat-row">
                  <span class="row-label">{{ t('label.total_pushes_short') }}</span>
                  <span class="row-value">{{ data.count }}</span>
                </div>
                <div class="channel-stat-row">
                  <span class="row-label">{{ t('label.success_short') }}</span>
                  <span class="row-value success">{{ data.success }}</span>
                </div>
                <div class="channel-stat-row">
                  <span class="row-label">{{ t('label.failed_short') }}</span>
                  <span class="row-value failed">{{ data.failed }}</span>
                </div>
                <div class="channel-stat-row">
                  <span class="row-label">{{ t('label.success_rate_short') }}</span>
                  <span class="row-value"
                    >{{ data.count > 0 ? Math.round((data.success / data.count) * 100) : 0 }}%</span
                  >
                </div>
                <div class="channel-stat-row">
                  <span class="row-label">{{ t('label.avg_latency_short') }}</span>
                  <span class="row-value">{{ Math.round(data.avgLatency) }}ms</span>
                </div>
              </div>
              <div class="channel-bar">
                <div
                  class="channel-bar-fill"
                  :style="{ width: `${data.count > 0 ? (data.success / data.count) * 100 : 0}%` }"
                ></div>
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
import { useTranslation } from '@/i18n';
import { getPushStats, getActivityAnalytics, type ActivityData } from '@/api';
import PerformanceMetricsChart from './admin/PerformanceMetricsChart.vue';
import PushTrendChart from './admin/PushTrendChart.vue';
import ChannelDistributionChart from './admin/ChannelDistributionChart.vue';
import SuccessRateChart from './admin/SuccessRateChart.vue';
import LatencyDistributionChart from './admin/LatencyDistributionChart.vue';
import ActivityChart from './admin/ActivityChart.vue';
import { StatsSkeleton } from './skeletons';

const t = useTranslation();

const props = defineProps<{
  accessToken: string;
}>();

const loading = ref(true);
const error = ref('');
const timeRange = ref('30');
const stats = ref({
  session: { total: 0, success: 0, failed: 0 },
  trend: { rate: 0, direction: 'stable' as 'up' | 'down' | 'stable' },
  recent: [] as Array<{
    date: string;
    pushes: number;
    success: number;
    failed: number;
    successRate?: number;
  }>,
  comparison: undefined as
    | undefined
    | {
        prevPeriodRate: number;
        currentPeriodRate: number;
        change: number;
        direction: 'up' | 'down' | 'stable';
      },
  channelUsage: {} as Record<
    string,
    { count: number; success: number; failed: number; avgLatency: number }
  >,
});
let refreshTimer: ReturnType<typeof setInterval> | null = null;
const activityData = ref<ActivityData[]>([]);

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

const channelColors = [
  '#667eea',
  '#764ba2',
  '#f093fb',
  '#f5576c',
  '#4facfe',
  '#43e97b',
  '#fa709a',
  '#fee140',
  '#30cfd0',
  '#a8edea',
  '#fed6e3',
  '#b790d4',
];

function getChannelIcon(channelId: string): string {
  return channelIconMap[channelId] || '📡';
}

function getChannelName(channelId: string): string {
  return t(`channel.${channelId}`) || channelId;
}

const performanceMetrics = computed(() => {
  const total = stats.value.session.total;
  const successRate =
    total > 0 ? Number(((stats.value.session.success / total) * 100).toFixed(1)) : 0;

  let totalLatency = 0;
  let channelCount = 0;
  Object.values(stats.value.channelUsage).forEach((data) => {
    totalLatency += data.avgLatency * data.count;
    channelCount += data.count;
  });
  const avgLatency = channelCount > 0 ? Math.round(totalLatency / channelCount) : 0;

  return {
    successRate,
    avgLatency,
    totalSuccess: stats.value.session.success,
    totalFailed: stats.value.session.failed,
  };
});

const trendChartData = computed(() => {
  return stats.value.recent.map((item) => ({
    date: item.date,
    success: item.success,
    failed: item.failed,
  }));
});

const channelChartData = computed(() => {
  return Object.entries(stats.value.channelUsage).map(([channel, data]) => ({
    name: getChannelName(channel),
    value: data.count,
    icon: getChannelIcon(channel),
  }));
});

const successRateChartData = computed(() => {
  return stats.value.recent.map((item) => ({
    date: item.date,
    rate: item.pushes > 0 ? Math.round((item.success / item.pushes) * 100) : 0,
  }));
});

const latencyChartData = computed(() => {
  return Object.entries(stats.value.channelUsage).map(([channel, data]) => ({
    channel: getChannelName(channel),
    avgLatency: Math.round(data.avgLatency),
    p50: Math.round(data.avgLatency * 0.9),
    p95: Math.round(data.avgLatency * 1.5),
    p99: Math.round(data.avgLatency * 2),
  }));
});

async function loadData() {
  loading.value = true;
  error.value = '';

  try {
    const response = await getPushStats(props.accessToken, parseInt(timeRange.value));
    if (response.success && response.data) {
      stats.value = {
        session: response.data.session || { total: 0, success: 0, failed: 0 },
        trend: response.data.trend || { rate: 0, direction: 'stable' },
        recent: response.data.recent || [],
        comparison: response.data.comparison,
        channelUsage: response.data.channelUsage || {},
      };
    }

    try {
      const activityResponse = await getActivityAnalytics(props.accessToken);
      if (activityResponse.success && activityResponse.activity) {
        activityData.value = activityResponse.activity;
      }
    } catch {
      // Activity analytics is optional, don't fail the whole dashboard
    }
  } catch (err) {
    error.value = (err as Error).message || t('error.load_stats_failed');
    console.error('Failed to load stats:', err);
  } finally {
    loading.value = false;
  }
}

function startAutoRefresh() {
  refreshTimer = setInterval(() => {
    loadData();
  }, 30000);
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

onMounted(() => {
  loadData();
  startAutoRefresh();
});

onUnmounted(() => {
  stopAutoRefresh();
});

watch(
  () => props.accessToken,
  () => {
    loadData();
  }
);
</script>

<style scoped>
.stats-dashboard {
  width: 100%;
  padding: 16px;
}

.panel {
  background: var(--bg-panel);
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.panel-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.panel-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.time-range-select {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-panel);
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
  outline: none;
  transition: all 0.2s;
}

.time-range-select:hover {
  border-color: #1890ff;
}

.time-range-select:focus {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.1);
}

.stats-content {
  padding: 24px;
}

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--text-secondary);
}

.loading-state span {
  margin-top: 12px;
  font-size: 14px;
}

.error-state p {
  margin-bottom: 16px;
  color: #ff4d4f;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-color);
  border-top-color: #1890ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.charts-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 24px;
  margin-top: 24px;
}

.chart-section {
  background: var(--bg-panel);
  border-radius: 8px;
  padding: 20px;
  box-shadow: var(--shadow-sm);
}

.chart-section h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.channel-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.channel-stat-card {
  background: var(--bg-panel);
  border-radius: 8px;
  padding: 16px;
  box-shadow: var(--shadow-sm);
  transition: all 0.3s;
}

.channel-stat-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.channel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.channel-icon {
  font-size: 24px;
}

.channel-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.channel-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.channel-stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.row-label {
  color: var(--text-secondary);
}

.row-value {
  font-weight: 600;
  color: var(--text-primary);
}

.row-value.success {
  color: #52c41a;
}

.row-value.failed {
  color: #ff4d4f;
}

.channel-bar {
  height: 4px;
  background: var(--bg-secondary);
  border-radius: 2px;
  margin-top: 12px;
  overflow: hidden;
}

.channel-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #52c41a, #73d13d);
  transition: width 0.3s ease;
}

.btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
}

.btn-primary {
  background: #1890ff;
  color: white;
}

.btn-primary:hover {
  background: #40a9ff;
}

.btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.btn-secondary:hover {
  background: var(--border-color);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.comparison-card {
  background: var(--bg-panel);
  border-radius: 8px;
  padding: 16px 20px;
  box-shadow: var(--shadow-sm);
  margin-top: 24px;
  border-left: 4px solid #667eea;
  transition: all 0.3s;
}

.comparison-card.up {
  border-left-color: #52c41a;
}

.comparison-card.down {
  border-left-color: #ff4d4f;
}

.comparison-header {
  margin-bottom: 12px;
}

.comparison-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.comparison-body {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

.comparison-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.comparison-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.comparison-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.comparison-value.up {
  color: #52c41a;
}

.comparison-value.down {
  color: #ff4d4f;
}

.comparison-value.stable {
  color: #faad14;
}

.trend-arrow {
  font-size: 14px;
  margin-left: 2px;
}

@media (max-width: 768px) {
  .stats-dashboard {
    padding: 8px;
  }

  .panel-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .charts-row {
    grid-template-columns: 1fr;
  }

  .channel-stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
