<script setup lang="ts">
/**
 * 卡片网格骨架屏
 */
import { computed } from 'vue';
import { useThemeStore } from '@/stores/theme';

interface Props {
  count?: number;
  columns?: number;
}

const props = withDefaults(defineProps<Props>(), {
  count: 6,
  columns: 3,
});

const themeStore = useThemeStore();
const isDark = computed(() => themeStore.isDark);
</script>

<template>
  <div class="cards-skeleton" :class="{ dark: isDark }" :style="{ '--columns': columns }">
    <div v-for="i in count" :key="i" class="card-skeleton">
      <div class="skeleton skeleton-icon"></div>
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-desc"></div>
      <div class="skeleton skeleton-desc short"></div>
      <div class="card-actions">
        <div class="skeleton skeleton-btn"></div>
        <div class="skeleton skeleton-btn small"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cards-skeleton {
  display: grid;
  grid-template-columns: repeat(var(--columns, 3), 1fr);
  gap: 16px;
}

.card-skeleton {
  background: var(--bg-panel, white);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
}

.skeleton-title {
  height: 18px;
  width: 70%;
}

.skeleton-desc {
  height: 14px;
  width: 100%;
}

.skeleton-desc.short {
  width: 60%;
}

.card-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.skeleton-btn {
  height: 32px;
  width: 80px;
  border-radius: 6px;
}

.skeleton-btn.small {
  width: 40px;
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
  .cards-skeleton {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .cards-skeleton {
    grid-template-columns: 1fr;
  }
}
</style>
