<template>
  <div class="metrics-container">
    <div class="metric-card">
      <div class="metric-header">
        <span class="metric-title">{{ t('label.success_rate') }}</span>
        <span :class="['metric-badge', successRateClass]">
          {{ successRateText }}
        </span>
      </div>
      <div ref="successRateRef" class="gauge"></div>
      <div class="metric-value">
        <span class="value">{{ metrics.successRate }}</span>
        <span class="unit">%</span>
      </div>
    </div>

    <div class="metric-card">
      <div class="metric-header">
        <span class="metric-title">{{ t('label.avg_latency_short') }}</span>
        <span :class="['metric-badge', latencyClass]">
          {{ latencyText }}
        </span>
      </div>
      <div ref="latencyRef" class="gauge"></div>
      <div class="metric-value">
        <span class="value">{{ metrics.avgLatency }}</span>
        <span class="unit">ms</span>
      </div>
    </div>

    <div class="metric-card">
      <div class="metric-header">
        <span class="metric-title">{{ t('label.total_pushes_short') }}</span>
        <span class="metric-badge info">{{ t('label.total') }}</span>
      </div>
      <div class="total-push">
        <div class="push-stat">
          <span class="stat-label">{{ t('status.success') }}</span>
          <span class="stat-value success">{{ metrics.totalSuccess }}</span>
        </div>
        <div class="push-stat">
          <span class="stat-label">{{ t('status.failed') }}</span>
          <span class="stat-value failed">{{ metrics.totalFailed }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, onBeforeUnmount } from 'vue';
import * as echarts from 'echarts';
import { useThemeStore } from '@/stores/theme';
import { useTranslation } from '@/i18n';

const t = useTranslation();

interface MetricsData {
  successRate: number;
  avgLatency: number;
  totalSuccess: number;
  totalFailed: number;
}

const props = defineProps<{
  metrics: MetricsData;
}>();

const themeStore = useThemeStore();
const successRateRef = ref<HTMLElement>();
const latencyRef = ref<HTMLElement>();
let successRateChart: echarts.ECharts | null = null;
let latencyChart: echarts.ECharts | null = null;

const successRateClass = computed(() => {
  const rate = props.metrics.successRate;
  if (rate >= 95) return 'success';
  if (rate >= 80) return 'warning';
  return 'danger';
});

const successRateText = computed(() => {
  const rate = props.metrics.successRate;
  if (rate >= 95) return t('label.excellent');
  if (rate >= 80) return t('label.good');
  return t('label.needs_improvement');
});

const latencyClass = computed(() => {
  const latency = props.metrics.avgLatency;
  if (latency <= 500) return 'success';
  if (latency <= 2000) return 'warning';
  return 'danger';
});

const latencyText = computed(() => {
  const latency = props.metrics.avgLatency;
  if (latency <= 500) return t('label.excellent');
  if (latency <= 2000) return t('label.good');
  return t('label.needs_improvement');
});

const initCharts = () => {
  if (successRateRef.value) {
    successRateChart = echarts.init(successRateRef.value);
    updateSuccessRateChart();
  }

  if (latencyRef.value) {
    latencyChart = echarts.init(latencyRef.value);
    updateLatencyChart();
  }
};

const updateSuccessRateChart = () => {
  if (!successRateChart) return;

  const isDark = themeStore.isDark;
  const value = props.metrics.successRate;

  const option: echarts.EChartsOption = {
    series: [
      {
        type: 'gauge',
        startAngle: 180,
        endAngle: 0,
        min: 0,
        max: 100,
        splitNumber: 4,
        radius: '100%',
        center: ['50%', '70%'],
        progress: {
          show: true,
          width: 12,
          itemStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 1,
              y2: 0,
              colorStops: [
                { offset: 0, color: value >= 95 ? '#52c41a' : value >= 80 ? '#faad14' : '#ff4d4f' },
                { offset: 1, color: value >= 95 ? '#73d13d' : value >= 80 ? '#ffc53d' : '#ff7875' },
              ],
            },
          },
        },
        axisLine: {
          lineStyle: {
            width: 12,
            color: [[1, isDark ? '#3c3c3c' : '#e0e0e0']],
          },
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer: { show: false },
        title: { show: false },
        detail: { show: false },
        data: [{ value }],
      },
    ],
  };

  successRateChart.setOption(option);
};

const updateLatencyChart = () => {
  if (!latencyChart) return;

  const isDark = themeStore.isDark;
  const latency = props.metrics.avgLatency;
  const maxLatency = 5000;

  let color = '#52c41a';
  if (latency > 500) color = '#faad14';
  if (latency > 2000) color = '#ff4d4f';

  const option: echarts.EChartsOption = {
    series: [
      {
        type: 'gauge',
        startAngle: 180,
        endAngle: 0,
        min: 0,
        max: maxLatency,
        splitNumber: 5,
        radius: '100%',
        center: ['50%', '70%'],
        progress: {
          show: true,
          width: 12,
          itemStyle: {
            color,
          },
        },
        axisLine: {
          lineStyle: {
            width: 12,
            color: [[1, isDark ? '#3c3c3c' : '#e0e0e0']],
          },
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer: { show: false },
        title: { show: false },
        detail: { show: false },
        data: [{ value: latency }],
      },
    ],
  };

  latencyChart.setOption(option);
};

const handleResize = () => {
  successRateChart?.resize();
  latencyChart?.resize();
};

onMounted(() => {
  initCharts();
  window.addEventListener('resize', handleResize);

  watch(
    () => themeStore.isDark,
    () => {
      updateSuccessRateChart();
      updateLatencyChart();
    }
  );
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  successRateChart?.dispose();
  latencyChart?.dispose();
});

watch(
  () => props.metrics,
  () => {
    updateSuccessRateChart();
    updateLatencyChart();
  },
  { deep: true }
);
</script>

<style scoped>
.metrics-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  padding: 16px;
}

.metric-card {
  background: var(--bg-panel);
  border-radius: 12px;
  padding: 16px;
  box-shadow: var(--shadow-sm);
  transition: all 0.3s ease;
}

.metric-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.metric-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.metric-title {
  font-size: 14px;
  color: var(--text-secondary);
  font-weight: 500;
}

.metric-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.metric-badge.success {
  background: rgba(82, 196, 26, 0.1);
  color: #52c41a;
}

.metric-badge.warning {
  background: rgba(250, 173, 20, 0.1);
  color: #faad14;
}

.metric-badge.danger {
  background: rgba(255, 77, 79, 0.1);
  color: #ff4d4f;
}

.metric-badge.info {
  background: rgba(24, 144, 255, 0.1);
  color: #1890ff;
}

.gauge {
  width: 100%;
  height: 100px;
  margin: 0 auto;
}

.metric-value {
  text-align: center;
  margin-top: 8px;
}

.metric-value .value {
  font-size: 28px;
  font-weight: 600;
  color: var(--text-primary);
}

.metric-value .unit {
  font-size: 14px;
  color: var(--text-secondary);
  margin-left: 4px;
}

.total-push {
  display: flex;
  justify-content: space-around;
  margin-top: 20px;
}

.push-stat {
  text-align: center;
}

.stat-label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.stat-value {
  font-size: 20px;
  font-weight: 600;
}

.stat-value.success {
  color: #52c41a;
}

.stat-value.failed {
  color: #ff4d4f;
}
</style>
