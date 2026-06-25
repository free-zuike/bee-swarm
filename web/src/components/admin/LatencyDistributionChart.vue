<template>
  <div class="chart-container">
    <div v-if="!props.data.length" class="empty-chart">
      <div class="empty-icon">⏱️</div>
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

interface LatencyData {
  channel: string;
  avgLatency: number;
  p50: number;
  p95: number;
  p99: number;
}

const t = useTranslation();

const props = defineProps<{
  data: LatencyData[];
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
      text: props.title || t('label.latency_distribution'),
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
      formatter: (params: echarts.DefaultLabelFormatterCallbackParams[]) => {
        const data = props.data[params[0].dataIndex];
        return `
          <strong>${data.channel}</strong><br/>
          ${t('label.avg')}: ${data.avgLatency}ms<br/>
          P50: ${data.p50}ms<br/>
          P95: ${data.p95}ms<br/>
          P99: ${data.p99}ms
        `;
      },
    },
    legend: {
      data: ['P50', 'P95', 'P99'],
      bottom: 10,
      textStyle: { color: textColor },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '18%',
      top: '15%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: props.data.map((d) => d.channel),
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
      name: t('label.avg_latency_short'),
      nameTextStyle: { color: textColor },
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
        name: 'P50',
        type: 'bar',
        data: props.data.map((d) => d.p50),
        itemStyle: {
          color: '#52c41a',
          borderRadius: [4, 4, 0, 0],
        },
      },
      {
        name: 'P95',
        type: 'bar',
        data: props.data.map((d) => d.p95),
        itemStyle: {
          color: '#faad14',
          borderRadius: [4, 4, 0, 0],
        },
      },
      {
        name: 'P99',
        type: 'bar',
        data: props.data.map((d) => d.p99),
        itemStyle: {
          color: '#ff4d4f',
          borderRadius: [4, 4, 0, 0],
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

  watch(
    () => t('label.avg_latency'),
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
