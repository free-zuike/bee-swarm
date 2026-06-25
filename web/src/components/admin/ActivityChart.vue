<template>
  <div class="chart-container">
    <div v-if="!props.data.length" class="empty-chart">
      <div class="empty-icon">📊</div>
      <span class="empty-text">{{ t('label.noData') }}</span>
    </div>
    <div v-else ref="chartRef" class="chart"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount } from 'vue';
import * as echarts from 'echarts';
import { useThemeStore } from '@/stores/theme';
import { useTranslation } from '@/i18n';

interface ActivityData {
  date: string;
  logins: number;
  pushes: number;
  templates: number;
}

const t = useTranslation();

const props = defineProps<{
  data: ActivityData[];
  height?: string;
}>();

const chartRef = ref<HTMLElement>();
let chartInstance: echarts.ECharts | null = null;
const themeStore = useThemeStore();

const initChart = () => {
  if (!chartRef.value) return;

  chartInstance = echarts.init(chartRef.value);
  updateChart();
};

const updateChart = () => {
  if (!chartInstance || !props.data.length) return;

  const isDark = themeStore.isDark;
  const textColor = isDark ? '#e0e0e0' : '#1a1a2e';

  const dates = props.data.map((d) => d.date.slice(5));
  const logins = props.data.map((d) => d.logins);
  const pushes = props.data.map((d) => d.pushes);
  const templates = props.data.map((d) => d.templates);

  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
    },
    legend: {
      data: [
        t('label.logins') || '登录',
        t('label.pushes') || '推送',
        t('label.templates') || '模板操作',
      ],
      textStyle: { color: textColor },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: textColor },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: textColor },
    },
    series: [
      {
        name: t('label.logins') || '登录',
        type: 'bar',
        data: logins,
        itemStyle: { color: '#667eea' },
      },
      {
        name: t('label.pushes') || '推送',
        type: 'bar',
        data: pushes,
        itemStyle: { color: '#43e97b' },
      },
      {
        name: t('label.templates') || '模板操作',
        type: 'bar',
        data: templates,
        itemStyle: { color: '#f093fb' },
      },
    ],
  };

  chartInstance.setOption(option);
};

const handleResize = () => {
  chartInstance?.resize();
};

onMounted(() => {
  initChart();
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  chartInstance?.dispose();
  chartInstance = null;
});

watch(
  () => props.data,
  () => updateChart(),
  { deep: true }
);

watch(
  () => themeStore.isDark,
  () => updateChart()
);
</script>

<style scoped>
.chart-container {
  width: 100%;
  min-height: 200px;
}

.chart {
  width: 100%;
  height: v-bind("props.height || '300px'");
}

.empty-chart {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--text-secondary, #999);
}

.empty-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.empty-text {
  font-size: 14px;
}
</style>
