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

interface TrendData {
  date: string;
  success: number;
  failed: number;
}

const t = useTranslation();

const props = defineProps<{
  data: TrendData[];
  title?: string;
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
  const backgroundColor = isDark ? '#2d2d2d' : '#ffffff';
  
  const option: echarts.EChartsOption = {
    title: {
      text: props.title || t('dashboard.recentActivity'),
      textStyle: {
        color: textColor,
        fontSize: 16,
        fontWeight: 'normal',
      },
      left: 'center',
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor,
      textStyle: { color: textColor },
      axisPointer: {
        type: 'shadow',
      },
    },
    legend: {
      data: [t('status.success'), t('status.failed')],
      bottom: 10,
      textStyle: { color: textColor },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      top: '15%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: props.data.map((d) => d.date),
      axisLabel: {
        color: textColor,
        rotate: 45,
      },
      axisLine: {
        lineStyle: { color: isDark ? '#3c3c3c' : '#e0e0e0' },
      },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: textColor,
      },
      axisLine: {
        lineStyle: { color: isDark ? '#3c3c3c' : '#e0e0e0' },
      },
      splitLine: {
        lineStyle: {
          color: isDark ? '#3c3c3c' : '#f0f0f0',
        },
      },
    },
    series: [
      {
        name: t('status.success'),
        type: 'line',
        smooth: true,
        data: props.data.map((d) => d.success),
        itemStyle: { color: '#52c41a' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(82, 196, 26, 0.3)' },
            { offset: 1, color: 'rgba(82, 196, 26, 0.05)' },
          ]),
        },
      },
      {
        name: t('status.failed'),
        type: 'line',
        smooth: true,
        data: props.data.map((d) => d.failed),
        itemStyle: { color: '#ff4d4f' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(255, 77, 79, 0.3)' },
            { offset: 1, color: 'rgba(255, 77, 79, 0.05)' },
          ]),
        },
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
  
  watch(
    () => themeStore.isDark,
    () => {
      updateChart();
    }
  );
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  chartInstance?.dispose();
});

watch(
  () => props.data,
  () => {
    updateChart();
  },
  { deep: true }
);
</script>

<style scoped>
.chart-container {
  width: 100%;
  height: v-bind('props.height || "300px"');
  position: relative;
}

.chart {
  width: 100%;
  height: 100%;
}

.empty-chart {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-text {
  font-size: 14px;
}
</style>