<script setup lang="ts">
/**
 * 统计面板骨架屏
 */
import { computed } from 'vue';
import { useThemeStore } from '@/stores/theme';

const themeStore = useThemeStore();
const isDark = computed(() => themeStore.isDark);
</script>

<template>
  <div class="stats-skeleton" :class="{ dark: isDark }">
    <div class="stats-grid">
      <div class="stat-card" v-for="i in 4" :key="i">
        <div class="stat-icon skeleton"></div>
        <div class="stat-info">
          <div class="skeleton skeleton-value"></div>
          <div class="skeleton skeleton-label"></div>
        </div>
      </div>
    </div>
    <div class="chart-area">
      <div class="skeleton skeleton-chart"></div>
    </div>
  </div>
</template>

<style scoped>
.stats-skeleton {
  padding: 20px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--bg-panel, white);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  flex-shrink: 0;
}

.stat-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-value {
  height: 24px;
  width: 60%;
}

.skeleton-label {
  height: 14px;
  width: 80%;
}

.chart-area {
  background: var(--bg-panel, white);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.skeleton-chart {
  height: 300px;
  border-radius: 8px;
}

.skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 6px;
}

.dark .skeleton {
  background: linear-gradient(90deg, #3c3c3c 25%, #4a4a4a 50%, #3c3c3c 75%);
  background-size: 200% 100%;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
