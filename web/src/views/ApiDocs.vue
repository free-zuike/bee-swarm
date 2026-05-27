<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useThemeStore } from '@/stores/theme';
import { getOpenAPISpec } from '@/api-docs/openapi';
import SwaggerUI from 'swagger-ui';
import 'swagger-ui/dist/swagger-ui.css';

const themeStore = useThemeStore();
const router = useRouter();

const containerRef = ref<HTMLElement | null>(null);
let uiInstance: any = null;
const currentLocale = ref<'zh' | 'en'>('zh');

const isDark = computed(() => themeStore.isDark);

function initSwaggerUI() {
  if (!containerRef.value) return;

  containerRef.value.innerHTML = '';

  uiInstance = SwaggerUI({
    domNode: containerRef.value,
    spec: getOpenAPISpec(currentLocale.value),
    deepLinking: true,
    displayOperationId: true,
    defaultModelsExpandDepth: 1,
    defaultModelExpandDepth: 1,
    persistAuthorization: true,
    tryItOutEnabled: false,
    syntaxHighlight: {
      activate: true,
      theme: isDark.value ? 'monokai' : 'agate'
    },
    requestSnippets: {
      generators: {
        curl_bash: {
          title: 'curl',
          syntax: 'bash',
        },
      },
      defaultExpanded: true,
    },
  });

  applyTheme();
}

function applyTheme() {
  if (!containerRef.value) return;

  const container = containerRef.value;
  
  if (isDark.value) {
    container.classList.add('swagger-dark');
  } else {
    container.classList.remove('swagger-dark');
  }
}

function toggleLocale() {
  currentLocale.value = currentLocale.value === 'zh' ? 'en' : 'zh';
  initSwaggerUI();
}

function goBack() {
  router.push('/');
}

watch(isDark, () => {
  applyTheme();
  if (uiInstance) {
    initSwaggerUI();
  }
});

onMounted(() => {
  initSwaggerUI();
});
</script>

<template>
  <div class="api-docs-container">
    <div class="docs-header">
      <div class="header-left">
        <button class="btn btn-icon" @click="goBack">←</button>
        <h1>🐝 Bee Swarm API Docs</h1>
      </div>
      <div class="header-actions">
        <button class="btn btn-sm btn-secondary" @click="toggleLocale">
          {{ currentLocale === 'zh' ? 'English' : '中文' }}
        </button>
      </div>
    </div>
    <div ref="containerRef" class="swagger-ui-wrapper"></div>
  </div>
</template>

<style scoped>
.api-docs-container {
  min-height: 100vh;
  background: var(--bg-primary, #f5f5f5);
  padding: 20px;
}

.docs-header {
  max-width: 1200px;
  margin: 0 auto 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 8px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-left h1 {
  color: var(--text-primary, #1a1a2e);
  margin: 0;
  font-size: 24px;
}

.btn-icon {
  background: transparent;
  border: none;
  font-size: 24px;
  cursor: pointer;
  padding: 4px;
  color: var(--text-primary, #1a1a2e);
  border-radius: 4px;
}

.btn-icon:hover {
  background: var(--bg-secondary, #e0e0e0);
}

.swagger-ui-wrapper {
  max-width: 1200px;
  margin: 0 auto;
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.swagger-dark.swagger-ui-wrapper {
  background: #1e1e1e;
}

/* 覆盖 swagger-ui 的样式 */
:deep(.swagger-ui) {
  color: var(--text-primary, #1a1a2e);
}

:deep(.swagger-ui .topbar) {
  background: var(--bg-secondary, #e0e0e0);
  display: none;
}

:deep(.swagger-ui .info) {
  color: var(--text-primary, #1a1a2e);
}

:deep(.swagger-ui .info hgroup.main a) {
  color: #667eea;
}

:deep(.swagger-ui .opblock .opblock-summary-method) {
  background: #667eea;
  color: white;
}

:deep(.swagger-ui .opblock.opblock-get .opblock-summary-method) {
  background: #61affe;
}

:deep(.swagger-ui .opblock.opblock-post .opblock-summary-method) {
  background: #49cc90;
}

:deep(.swagger-ui .opblock.opblock-put .opblock-summary-method) {
  background: #fca130;
}

:deep(.swagger-ui .opblock.opblock-delete .opblock-summary-method) {
  background: #f93e3e;
}

:deep(.swagger-ui .opblock) {
  background: var(--bg-panel, white);
  border-color: var(--border-color, #e0e0e0);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

:deep(.swagger-ui .opblock-summary-path) {
  color: var(--text-primary, #1a1a2e);
}

:deep(.swagger-ui .opblock-summary-description) {
  color: var(--text-secondary, #666);
}

:deep(.swagger-ui .opblock-tag) {
  color: var(--text-primary, #1a1a2e);
  border-color: var(--border-color, #e0e0e0);
}

:deep(.swagger-ui .scheme-container) {
  background: var(--bg-secondary, #e0e0e0);
  border-bottom-color: var(--border-color, #e0e0e0);
}

:deep(.swagger-ui .models) {
  color: var(--text-primary, #1a1a2e);
}

:deep(.swagger-ui .model-title) {
  color: var(--text-primary, #1a1a2e);
}

:deep(.swagger-ui .parameter__name) {
  color: var(--text-primary, #1a1a2e);
}

:deep(.swagger-ui .parameter__type) {
  color: var(--text-secondary, #666);
}

:deep(.swagger-ui .parameter__in) {
  color: var(--text-muted, #999);
}

:deep(.swagger-ui select) {
  background: var(--bg-secondary, #e0e0e0);
  color: var(--text-primary, #1a1a2e);
  border-color: var(--border-color, #e0e0e0);
}

:deep(.swagger-ui input[type=text]),
:deep(.swagger-ui input[type=password]) {
  background: var(--bg-secondary, #e0e0e0);
  color: var(--text-primary, #1a1a2e);
  border-color: var(--border-color, #e0e0e0);
}

:deep(.swagger-ui textarea) {
  background: var(--bg-secondary, #e0e0e0);
  color: var(--text-primary, #1a1a2e);
  border-color: var(--border-color, #e0e0e0);
}

:deep(.swagger-ui .btn) {
  background: var(--bg-tertiary, #f5f5f5);
  color: var(--text-primary, #1a1a2e);
  border-color: var(--border-color, #e0e0e0);
}

:deep(.swagger-ui .btn:hover) {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

:deep(.swagger-ui .btn.primary) {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

:deep(.swagger-ui .btn.primary:hover) {
  background: #5a6fd6;
  border-color: #5a6fd6;
}

:deep(.swagger-ui .example) {
  background: var(--bg-secondary, #e0e0e0);
  color: var(--text-primary, #1a1a2e);
}

:deep(.swagger-ui .response-col_status) {
  color: var(--text-primary, #1a1a2e);
}

:deep(.swagger-ui .response-col_description) {
  color: var(--text-secondary, #666);
}

:deep(.swagger-ui .tab) {
  color: var(--text-secondary, #666);
}

:deep(.swagger-ui .tab.active) {
  color: #667eea;
  border-color: #667eea;
}

:deep(.swagger-ui .highlight-code) {
  background: var(--bg-secondary, #e0e0e0);
}

:deep(.swagger-ui .highlight-code code) {
  color: var(--text-primary, #1a1a2e);
}

/* 深色主题样式 */
.swagger-dark :deep(.swagger-ui) {
  background: #1e1e1e;
  color: #e0e0e0;
}

.swagger-dark :deep(.swagger-ui .info) {
  color: #e0e0e0;
}

.swagger-dark :deep(.swagger-ui .opblock) {
  background: #2d2d2d;
  border-color: #3c3c3c;
}

.swagger-dark :deep(.swagger-ui .opblock-summary-path) {
  color: #e0e0e0;
}

.swagger-dark :deep(.swagger-ui .opblock-summary-description) {
  color: #999;
}

.swagger-dark :deep(.swagger-ui .opblock-tag) {
  color: #e0e0e0;
  border-color: #3c3c3c;
}

.swagger-dark :deep(.swagger-ui .scheme-container) {
  background: #2d2d2d;
  border-bottom-color: #3c3c3c;
}

.swagger-dark :deep(.swagger-ui .models) {
  color: #e0e0e0;
}

.swagger-dark :deep(.swagger-ui .model-title) {
  color: #e0e0e0;
}

.swagger-dark :deep(.swagger-ui .parameter__name) {
  color: #e0e0e0;
}

.swagger-dark :deep(.swagger-ui .parameter__type) {
  color: #999;
}

.swagger-dark :deep(.swagger-ui select) {
  background: #2d2d2d;
  color: #e0e0e0;
  border-color: #3c3c3c;
}

.swagger-dark :deep(.swagger-ui input[type=text]),
.swagger-dark :deep(.swagger-ui input[type=password]) {
  background: #2d2d2d;
  color: #e0e0e0;
  border-color: #3c3c3c;
}

.swagger-dark :deep(.swagger-ui textarea) {
  background: #2d2d2d;
  color: #e0e0e0;
  border-color: #3c3c3c;
}

.swagger-dark :deep(.swagger-ui .btn) {
  background: #3c3c3c;
  color: #e0e0e0;
  border-color: #3c3c3c;
}

.swagger-dark :deep(.swagger-ui .example) {
  background: #2d2d2d;
  color: #e0e0e0;
}

.swagger-dark :deep(.swagger-ui .response-col_status) {
  color: #e0e0e0;
}

.swagger-dark :deep(.swagger-ui .response-col_description) {
  color: #999;
}

.swagger-dark :deep(.swagger-ui .tab) {
  color: #999;
}

.swagger-dark :deep(.swagger-ui .tab.active) {
  color: #667eea;
  border-color: #667eea;
}

.swagger-dark :deep(.swagger-ui .highlight-code) {
  background: #2d2d2d;
}

.swagger-dark :deep(.swagger-ui .highlight-code code) {
  color: #e0e0e0;
}

.swagger-dark :deep(.swagger-ui .opblock-description-wrapper p),
.swagger-dark :deep(.swagger-ui .opblock-external-docs-wrapper p),
.swagger-dark :deep(.swagger-ui .opblock-title_normal p) {
  color: #e0e0e0;
}

.swagger-dark :deep(.swagger-ui table thead tr td),
.swagger-dark :deep(.swagger-ui table thead tr th) {
  color: #e0e0e0;
  border-bottom: 1px solid #3c3c3c;
}

.swagger-dark :deep(.swagger-ui .renderedMarkdown p) {
  color: #e0e0e0;
}

.swagger-dark :deep(.swagger-ui .markdown code) {
  background: #2d2d2d;
  border-color: #3c3c3c;
  color: #e0e0e0;
}

.swagger-dark :deep(.swagger-ui .renderedMarkdown code) {
  background: #2d2d2d;
  border-color: #3c3c3c;
  color: #e0e0e0;
}

.swagger-dark :deep(.swagger-ui .opblock-body pre.microlight) {
  background: #2d2d2d !important;
  color: #e0e0e0 !important;
}

.swagger-dark :deep(.swagger-ui .model-box) {
  background: #2d2d2d !important;
  border-color: #3c3c3c !important;
}
</style>
