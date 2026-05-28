<template>
  <div class="stats-dashboard">
    <div class="panel">
      <div class="panel-header">
        <h2>📊 {{ t('dashboard.title') }}</h2>
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
              <span class="trend-icon">→</span>
              {{ stats.trend.direction === 'up' ? 'dashboard.trend.up' : stats.trend.direction === 'down' ? 'dashboard.trend.down' : 'dashboard.trend.stable' }}
            </div>
          </div>
        </div>

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

        <div v-if="metrics" class="section">
          <h3>{{ t('dashboard.channelStats') }}</h3>
          <div class="channel-stats-grid">
            <div v-for="(data, channel) in metrics.byChannel" :key="channel" class="channel-stat-card">
              <div class="channel-name">{{ channel }}</div>
              <div class="channel-values">
                <span class="success-val">✓ {{ data.success }}</span>
                <span class="failed-val"> {{ data.failed }}</span>
              </div>
              <div class="channel-bar">
                <div class="channel-bar-fill" :style="{ width: `${channelRate(data)}%` }"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="avg-latency">
            <span>{{ t('dashboard.avgLatency') }}</span>
            <span class="latency-value">{{ metrics?.avgLatency || 0 }}ms</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { t } from '@/i18n';
import { getPushStats, getPushMetrics } from '@/api';

const props = defineProps<{
  accessToken: string;
}>();

const loading = ref(true);
const error = ref('');
const stats = ref({
  session: { total: 0, success: 0, failed: 0 },
  trend: { rate: 0, direction: 'stable' as 'up' | 'down' | 'stable' },
  recent: [] as Array<{ date: string; pushes: number; success: number; failed: number }>,
});
const metrics = ref<{ total: number; success: number; failed: number; byChannel: Record<string, { success: number; failed: number }>; avgLatency: number } | null>(null);

const successRate = computed(() => {
  const total = stats.value.session.total;
  if (total === 0) return '0.0';
  return ((stats.value.session.success / total) * 100).toFixed(1);
});

const maxRecent = computed(() => {
  return Math.max(...stats.value.recent.map((r) => Math.max(r.success, r.failed)), 1);
});

function channelRate(data: { success: number; failed: number }): number {
  const total = data.success + data.failed;
  if (total === 0) return 0;
  return (data.success / total) * 100;
}

async function loadData() {
  if (!props.accessToken) return;

  loading.value = true;
  error.value = '';
  try {
    const [statsData, metricsData] = await Promise.all([
      getPushStats(props.accessToken),
      getPushMetrics(props.accessToken),
    ]);
    stats.value = statsData;
    metrics.value = metricsData;
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);
watch(() => props.accessToken, loadData);
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

.channel-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.channel-stat-card {
  background: var(--bg-secondary, #f8f9fa);
  border-radius: 8px;
  padding: 14px;
}

.channel-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
  margin-bottom: 8px;
}

.channel-values {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
}

.success-val {
  color: #52c41a;
  font-size: 13px;
}

.failed-val {
  color: #ff4d4f;
  font-size: 13px;
}

.channel-bar {
  height: 6px;
  background: #e8e8e8;
  border-radius: 3px;
  overflow: hidden;
}

.channel-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  border-radius: 3px;
  transition: width 0.3s ease;
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
</style>
