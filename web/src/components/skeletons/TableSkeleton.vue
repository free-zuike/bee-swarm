<script setup lang="ts">
/**
 * 表格列表骨架屏
 */
import { computed } from 'vue';
import { useThemeStore } from '@/stores/theme';

interface Props {
  rows?: number;
  columns?: number;
}

const props = withDefaults(defineProps<Props>(), {
  rows: 5,
  columns: 4,
});

const themeStore = useThemeStore();
const isDark = computed(() => themeStore.isDark);
</script>

<template>
  <div class="table-skeleton" :class="{ dark: isDark }">
    <div class="table-header">
      <div v-for="i in columns" :key="i" class="skeleton skeleton-header"></div>
    </div>
    <div class="table-body">
      <div v-for="row in rows" :key="row" class="table-row">
        <div v-for="col in columns" :key="col" class="skeleton skeleton-cell"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.table-skeleton {
  background: var(--bg-panel, white);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.table-header {
  display: grid;
  gap: 1px;
  background: var(--border-color, #eee);
  padding: 12px 16px;
}

.table-body {
  display: flex;
  flex-direction: column;
}

.table-row {
  display: grid;
  gap: 1px;
  padding: 16px;
  border-bottom: 1px solid var(--border-color, #eee);
}

.table-row:last-child {
  border-bottom: none;
}

.skeleton-header {
  height: 14px;
  width: 80%;
}

.skeleton-cell {
  height: 16px;
  width: 70%;
}

.skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 4px;
}

.dark .skeleton {
  background: linear-gradient(90deg, #3c3c3c 25%, #4a4a4a 50%, #3c3c3c 75%);
  background-size: 200% 100%;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
