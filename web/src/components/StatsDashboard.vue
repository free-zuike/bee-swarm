<template>
  <div class="stats-dashboard">
    <h2 class="section-title">{{ t('dashboard.title') }}</h2>

    <div v-if="loading" class="loading">
      <div class="spinner"></div>
    </div>

    <div v-else-if="error" class="error-message">
      {{ error }}
    </div>

    <template v-else>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon total">📊</div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.session.total }}</div>
            <div class="stat-label">{{ t('dashboard.totalPushes') }}</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon success">✅</div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.session.success }}</div>
            <div class="stat-label">{{ t('dashboard.successful') }}</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon failed">❌</div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.session.failed }}</div>
            <div class="stat-label">{{ t('dashboard.failed') }}</div>
          </div>
        </div>

        <div class="stat-card highlight">
          <div class="stat-content">
            <div class="stat-value">{{ stats.trend.rate.toFixed(1) }}%</div>
            <div class="stat-label">{{ t('dashboard.successRate') }}</div>
            <div class="stat-trend" :class="stats.trend.direction">
              <span v-if="stats.trend.direction === 'up'">📈</span>
              <span v-else-if="stats.trend.direction === 'down'">📉</span>
              <span v-else>➡️</span>
              {{ t(`dashboard.trend.${stats.trend.direction}`) }}
            </div>
          </div>
        </div>
      </div>

      <div class="recent-chart">
        <h3>{{ t('dashboard.recentActivity') }}</h3>
        <div class="chart-container">
          <div class="chart-bars">
            <div
              v-for="day in stats.recent"
              :key="day.date"
              class="chart-bar-group"
            >
              <div class="chart-bar-wrapper">
                <div
                  class="chart-bar success"
                  :style="{ height: getBarHeight(day.success, day.pushes) + '%' }"
                  :title="`${t('dashboard.successful')}: ${day.success}`"
                ></div>
                <div
                  class="chart-bar failed"
                  :style="{ height: getBarHeight(day.failed, day.pushes) + '%' }"
                  :title="`${t('dashboard.failed')}: ${day.failed}`"
                ></div>
              </div>
              <div class="chart-label">{{ formatDate(day.date) }}</div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="metrics" class="metrics-details">
        <h3>{{ t('dashboard.channelStats') }}</h3>
        <div class="channel-stats">
          <div
            v-for="(data, channel) in metrics.byChannel"
            :key="channel"
            class="channel-stat"
          >
            <span class="channel-name">{{ channel }}</span>
            <span class="channel-success">✅ {{ data.success }}</span>
            <span class="channel-failed">❌ {{ data.failed }}</span>
          </div>
        </div>
        <div v-if="metrics.avgLatency" class="avg-latency">
          {{ t('dashboard.avgLatency') }}: {{ metrics.avgLatency.toFixed(0) }}ms
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { t } from '@/i18n';
import { getPushStats, getPushMetrics } from '@/api';
import { useAuth } from '@/composables/useAuth';

const { token } = useAuth();

const loading = ref(true);
const error = ref('');
const stats = ref({
  session: { total: 0, success: 0, failed: 0 },
  trend: { rate: 0, direction: 'stable' as 'up' | 'down' | 'stable' },
  recent: [] as Array<{ date: string; pushes: number; success: number; failed: number }>,
});
const metrics = ref<{ total: number; success: number; failed: number; byChannel: Record<string, { success: number; failed: number }>; avgLatency: number } | null>(null);

onMounted(async () => {
  if (!token.value) return;

  try {
    const [statsData, metricsData] = await Promise.all([
      getPushStats(token.value),
      getPushMetrics(token.value),
    ]);
    stats.value = statsData;
    metrics.value = metricsData;
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
});

function getBarHeight(value: number, total: number): number {
  if (total === 0) return 0;
  return (value / total) * 100;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
</script>

<style scoped>
.stats-dashboard {
  padding: 1rem;
}

.section-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
  color: var(--color-text);
}

.loading {
  display: flex;
  justify-content: center;
  padding: 3rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-message {
  color: var(--color-error);
  text-align: center;
  padding: 2rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1.25rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.stat-card.highlight {
  background: linear-gradient(135deg, var(--color-primary) 0%, #4f46e5 100%);
  border: none;
  color: white;
}

.stat-card.highlight .stat-label {
  color: rgba(255, 255, 255, 0.8);
}

.stat-icon {
  font-size: 2rem;
}

.stat-content {
  flex: 1;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.2;
}

.stat-label {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin-top: 0.25rem;
}

.stat-trend {
  font-size: 0.75rem;
  margin-top: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.stat-trend.up {
  color: #22c55e;
}

.stat-trend.down {
  color: #ef4444;
}

.stat-card.highlight .stat-trend {
  color: rgba(255, 255, 255, 0.9);
}

.recent-chart {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.recent-chart h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.chart-container {
  height: 200px;
}

.chart-bars {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  height: 100%;
  gap: 0.5rem;
}

.chart-bar-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}

.chart-bar-wrapper {
  display: flex;
  gap: 2px;
  height: calc(100% - 24px);
  align-items: flex-end;
  width: 100%;
  max-width: 30px;
}

.chart-bar {
  width: 50%;
  min-height: 4px;
  border-radius: 4px 4px 0 0;
  transition: height 0.3s ease;
}

.chart-bar.success {
  background: #22c55e;
}

.chart-bar.failed {
  background: #ef4444;
}

.chart-label {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-top: 0.5rem;
}

.metrics-details {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1.5rem;
}

.metrics-details h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.channel-stats {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.channel-stat {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem;
  background: var(--color-background);
  border-radius: 8px;
}

.channel-name {
  font-weight: 500;
  min-width: 100px;
}

.channel-success,
.channel-failed {
  font-size: 0.875rem;
}

.avg-latency {
  margin-top: 1rem;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}
</style>
