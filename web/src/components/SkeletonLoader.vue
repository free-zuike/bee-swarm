<script setup lang="ts">
/**
 * 骨架屏组件
 * 在内容加载时显示占位符，提升用户体验
 */
import { computed } from 'vue';
import { themeState } from '@/stores/theme';

interface Props {
  type?: 'text' | 'title' | 'avatar' | 'card' | 'button' | 'image';
  width?: string;
  height?: string;
  lines?: number;
  animated?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  width: '100%',
  height: '16px',
  lines: 1,
  animated: true,
});

const isDark = computed(() => themeState.isDark);

const skeletonStyle = computed(() => {
  const style: Record<string, string> = {
    width: props.width,
    height: props.height,
  };

  if (props.type === 'card') {
    style.height = '120px';
  } else if (props.type === 'avatar') {
    style.width = '40px';
    style.height = '40px';
    style.borderRadius = '50%';
  } else if (props.type === 'button') {
    style.height = '36px';
    style.width = '80px';
    style.borderRadius = '6px';
  } else if (props.type === 'image') {
    style.height = '200px';
    style.borderRadius = '8px';
  }

  return style;
});
</script>

<template>
  <div class="skeleton-wrapper">
    <template v-if="type === 'card'">
      <div
        v-for="i in lines"
        :key="i"
        class="skeleton skeleton-card"
        :class="{ dark: isDark, animated }"
        :style="{ width, height: '120px' }"
      ></div>
    </template>

    <template v-else-if="type === 'text'">
      <div
        v-for="i in lines"
        :key="i"
        class="skeleton skeleton-text"
        :class="{ dark: isDark, animated }"
        :style="{ width: i === lines ? '60%' : width }"
      ></div>
    </template>

    <template v-else>
      <div class="skeleton" :class="{ dark: isDark, animated }" :style="skeletonStyle"></div>
    </template>
  </div>
</template>

<style scoped>
.skeleton-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  border-radius: 4px;
}

.skeleton.dark {
  background: linear-gradient(90deg, #3c3c3c 25%, #4a4a4a 50%, #3c3c3c 75%);
  background-size: 200% 100%;
}

.skeleton.animated {
  animation: shimmer 1.5s ease-in-out infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.skeleton-text {
  height: 16px;
}

.skeleton-card {
  height: 120px;
  border-radius: 8px;
}
</style>
