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

const t = useTranslation();

interface ChannelData {
  name: string;
  value: number;
  icon?: string;
}

const props = defineProps<{
  data: ChannelData[];
  title?: string;
  height?: string;
}>();

const chartRef = ref<HTMLElement>();
let chartInstance: echarts.ECharts | null = null;
const themeStore = useThemeStore();

const defaultColors = [
  '#5470c6',
  '#91cc75',
  '#fac858',
  '#ee6666',
  '#73c0de',
  '#3ba272',
  '#fc8452',
  '#9a60b4',
  '#ea7ccc',
];

const initChart = () => {
  if (!chartRef.value) return;

  chartInstance = echarts.init(chartRef.value);
  updateChart();
};

const updateChart = () => {
  if (!chartInstance || !props.data.length) return;

  const isDark = themeStore.isDark;
  const textColor = isDark ? '#e0e0e0' : '#1a1a2e';

  const option: echarts.EChartsOption = {
    title: {
      text: props.title || t('label.channel_ratio'),
      textStyle: {
        color: textColor,
        fontSize: 16,
        fontWeight: 'normal',
      },
      left: 'center',
    },
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
      backgroundColor: isDark ? '#2d2d2d' : '#ffffff',
      textStyle: { color: textColor },
    },
    legend: {
      orient: 'vertical',
      right: '5%',
      top: 'center',
      textStyle: { color: textColor },
      formatter: (name: string) => {
        const item = props.data.find(
          (d) => `${d.icon || ''} ${d.name}` === name || d.name === name
        );
        return `${name}: ${item?.value || 0}`;
      },
    },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['40%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: isDark ? '#1e1e1e' : '#ffffff',
          borderWidth: 2,
        },
        label: {
          show: false,
          position: 'center',
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 16,
            fontWeight: 'bold',
            color: textColor,
          },
        },
        labelLine: {
          show: false,
        },
        data: props.data.map((item, index) => ({
          name: item.icon ? `${item.icon} ${item.name}` : item.name,
          value: item.value,
          itemStyle: {
            color: defaultColors[index % defaultColors.length],
          },
        })),
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
