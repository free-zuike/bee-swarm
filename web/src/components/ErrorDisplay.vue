<script setup lang="ts">
/**
 * 错误显示组件
 * 统一展示错误信息，支持重试功能
 */
import { computed } from 'vue';
import { themeState } from '@/stores/theme';

interface Props {
  error: string | null;
  title?: string;
  showRetry?: boolean;
  compact?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  title: '出错了',
  showRetry: true,
  compact: false,
});

const emit = defineEmits<{
  retry: [];
}>();

const isDark = computed(() => themeState.isDark);

function handleRetry() {
  emit('retry');
}
</script>

<template>
  <div v-if="error" class="error-container" :class="{ dark: isDark, compact }">
    <div class="error-icon">⚠️</div>
    <div class="error-content">
      <h3 class="error-title">{{ title }}</h3>
      <p class="error-message">{{ error }}</p>
    </div>
    <button
      v-if="showRetry"
      class="retry-button"
      :class="{ dark: isDark }"
      @click="handleRetry"
    >
      🔄 重试
    </button>
  </div>
</template>

<style scoped>
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 12px;
  text-align: center;
  margin: 16px 0;
}

.error-container.dark {
  background: #2d1f1f;
  border-color: #4a2020;
}

.error-container.compact {
  padding: 16px;
  margin: 8px 0;
}

.error-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.compact .error-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.error-content {
  margin-bottom: 16px;
}

.error-title {
  font-size: 16px;
  font-weight: 600;
  color: #991b1b;
  margin: 0 0 8px;
}

.error-container.dark .error-title {
  color: #fca5a5;
}

.compact .error-title {
  font-size: 14px;
  margin-bottom: 4px;
}

.error-message {
  font-size: 14px;
  color: #b91c1c;
  margin: 0;
  line-height: 1.5;
}

.error-container.dark .error-message {
  color: #fca5a5;
}

.compact .error-message {
  font-size: 13px;
}

.retry-button {
  padding: 10px 24px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.retry-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.retry-button.dark {
  background: linear-gradient(135deg, #667eea, #764ba2);
}

.compact .retry-button {
  padding: 8px 16px;
  font-size: 13px;
}
</style>
