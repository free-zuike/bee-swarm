<script setup lang="ts">
/**
 * 空状态组件
 * 当没有数据时显示友好的提示
 */
import { computed } from 'vue';
import { themeState } from '@/stores/theme';

interface Props {
  title: string;
  description?: string;
  icon?: string;
  actionText?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: '暂无数据',
  icon: '📭',
});

const emit = defineEmits<{
  action: [];
}>();

const isDark = computed(() => themeState.isDark);

function handleAction() {
  emit('action');
}
</script>

<template>
  <div class="empty-container" :class="{ dark: isDark }">
    <div class="empty-icon">{{ icon }}</div>
    <h3 class="empty-title">{{ title }}</h3>
    <p v-if="description" class="empty-description">{{ description }}</p>
    <button
      v-if="actionText"
      class="action-button"
      :class="{ dark: isDark }"
      @click="handleAction"
    >
      {{ actionText }}
    </button>
  </div>
</template>

<style scoped>
.empty-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.8;
}

.empty-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
  margin: 0 0 8px;
}

.empty-container.dark .empty-title {
  color: var(--text-primary, #e0e0e0);
}

.empty-description {
  font-size: 14px;
  color: var(--text-secondary, #666);
  margin: 0 0 20px;
  max-width: 300px;
  line-height: 1.5;
}

.empty-container.dark .empty-description {
  color: var(--text-secondary, #999);
}

.action-button {
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

.action-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}
</style>
