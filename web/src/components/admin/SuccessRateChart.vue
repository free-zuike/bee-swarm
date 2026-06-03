<template>
  <div class="chart-container">
    <div v-if="!props.data.length" class="empty-chart">
      <div class="empty-icon">📈</div>
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

interface SuccessRateData {
  date: string;
  rate: number;
}

const t = useTranslation();

const props = defineProps<{
  data: SuccessRateData[];
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
      text: props.title || t('label.success_rate'),
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
      formatter: (params: any) => {
        const data = params[0];
        return `${data.name}<br/>${t('label.success_rate')}: <strong>${data.value}%</strong>`;
      },
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
      min: 0,
      max: 100,
      axisLabel: {
        color: textColor,
        formatter: '{value}%',
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
        name: t('label.success_rate'),
        type: 'line',
        smooth: true,
        data: props.data.map((d) => d.rate),
        itemStyle: { color: '#667eea' },
        lineStyle: {
          width: 3,
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(102, 126, 234, 0.4)' },
            { offset: 1, color: 'rgba(102, 126, 234, 0.05)' },
          ]),
        },
        markLine: {
          silent: true,
          data: [
            {
              yAxis: 90,
              lineStyle: { color: '#52c41a', type: 'dashed' },
              label: {
                formatter: t('dashboard.trend.up') + ' (90%)',
                color: '#52c41a',
              },
            },
            {
              yAxis: 70,
              lineStyle: { color: '#faad14', type: 'dashed' },
              label: {
                formatter: t('dashboard.trend.stable') + ' (70%)',
                color: '#faad14',
              },
            },
            {
              yAxis: 50,
              lineStyle: { color: '#ff4d4f', type: 'dashed' },
              label: {
                formatter: t('dashboard.trend.down') + ' (50%)',
                color: '#ff4d4f',
              },
            },
          ],
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
