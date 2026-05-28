<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useThemeStore } from '@/stores/theme';
import { getOpenAPISpec } from '@/api-docs/openapi';

interface SwaggerUIConfig {
  domNode: HTMLElement;
  spec: unknown;
  deepLinking: boolean;
  displayOperationId: boolean;
  defaultModelsExpandDepth: number;
  defaultModelExpandDepth: number;
  persistAuthorization: boolean;
  tryItOutEnabled: boolean;
  syntaxHighlight: { activate: boolean; theme: string };
}

interface SwaggerUIBundle {
  (config: SwaggerUIConfig): void;
}

interface SwaggerWindow extends Window {
  SwaggerUIBundle?: SwaggerUIBundle;
}

const themeStore = useThemeStore();
const router = useRouter();

const containerRef = ref<HTMLElement | null>(null);
const currentLocale = ref<'zh' | 'en'>('zh');
const isDark = computed(() => themeStore.isDark);
const swaggerInitialized = ref(false);

async function initSwaggerUI() {
  if (!containerRef.value) return;

  try {
    containerRef.value.textContent = '';

    const swaggerWindow = window as unknown as SwaggerWindow;
    const SwaggerUIBundle = swaggerWindow.SwaggerUIBundle;
    if (SwaggerUIBundle) {
      SwaggerUIBundle({
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
          theme: isDark.value ? 'monokai' : 'agate',
        },
      });
      swaggerInitialized.value = true;
    } else {
      console.warn('SwaggerUIBundle not loaded');
    }
  } catch (error) {
    console.error('Failed to initialize Swagger UI:', error);
  }

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
  initSwaggerUI();
});

onMounted(async () => {
  await nextTick();
  initSwaggerUI();
});
</script>

<template>
  <div class="api-docs-container" :class="{ dark: isDark }">
    <div class="docs-header">
      <div class="header-left">
        <button class="btn btn-icon" @click="goBack">←</button>
        <h1>🐝 Bee Swarm API Docs</h1>
      </div>
      <div class="header-actions">
        <button class="btn btn-sm btn-secondary" :class="{ dark: isDark }" @click="toggleLocale">
          {{ currentLocale === 'zh' ? 'English' : '中文' }}
        </button>
      </div>
    </div>
    <div ref="containerRef" class="swagger-ui-wrapper"></div>
  </div>
</template>

<style>
.api-docs-container {
  min-height: 100vh;
  background: var(--bg-primary, #f0f2f5);
  padding: 20px;
  transition: background 0.3s;
}

.api-docs-container.dark {
  background: var(--bg-primary, #1e1e1e);
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

.api-docs-container.dark .header-left h1 {
  color: var(--text-primary, #e0e0e0);
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

.api-docs-container.dark .btn-icon {
  color: var(--text-primary, #e0e0e0);
}

.api-docs-container.dark .btn-icon:hover {
  background: var(--bg-secondary, #3c3c3c);
}

.btn-sm {
  padding: 8px 16px;
  font-size: 14px;
}

.btn-secondary {
  background: var(--bg-secondary, #e0e0e0);
  color: var(--text-primary, #1a1a2e);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: var(--border-color, #d0d0d0);
}

.btn-secondary.dark {
  background: var(--bg-secondary, #3c3c3c);
  color: var(--text-primary, #e0e0e0);
}

.btn-secondary.dark:hover {
  background: var(--border-color, #4c4c4c);
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
.swagger-ui {
  color: var(--text-primary, #1a1a2e);
}

.swagger-ui .topbar {
  background: var(--bg-secondary, #e0e0e0);
  display: none;
}

.swagger-ui .info {
  color: var(--text-primary, #1a1a2e);
}

.swagger-ui .info hgroup.main a {
  color: #667eea;
}

.swagger-ui .opblock .opblock-summary-method {
  background: #667eea;
  color: white;
}

.swagger-ui .opblock.opblock-get .opblock-summary-method {
  background: #61affe;
}

.swagger-ui .opblock.opblock-post .opblock-summary-method {
  background: #49cc90;
}

.swagger-ui .opblock.opblock-put .opblock-summary-method {
  background: #fca130;
}

.swagger-ui .opblock.opblock-delete .opblock-summary-method {
  background: #f93e3e;
}

.swagger-ui .opblock {
  background: white;
  border-color: #e0e0e0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.swagger-ui .opblock-summary-path {
  color: var(--text-primary, #1a1a2e);
}

.swagger-ui .opblock-summary-description {
  color: var(--text-secondary, #666);
}

.swagger-ui .opblock-tag {
  color: var(--text-primary, #1a1a2e);
  border-color: var(--border-color, #e0e0e0);
}

.swagger-ui .scheme-container {
  background: #f5f5f5;
  border-bottom-color: var(--border-color, #e0e0e0);
}

.swagger-ui .models {
  color: var(--text-primary, #1a1a2e);
}

.swagger-ui .model-title {
  color: var(--text-primary, #1a1a2e);
}

.swagger-ui .parameter__name {
  color: var(--text-primary, #1a1a2e);
}

.swagger-ui .parameter__type {
  color: var(--text-secondary, #666);
}

.swagger-ui .parameter__in {
  color: var(--text-muted, #999);
}

.swagger-ui select {
  background: white;
  color: var(--text-primary, #1a1a2e);
  border-color: var(--border-color, #e0e0e0);
}

.swagger-ui input[type=text],
.swagger-ui input[type=password] {
  background: white;
  color: var(--text-primary, #1a1a2e);
  border-color: var(--border-color, #e0e0e0);
}

.swagger-ui textarea {
  background: white;
  color: var(--text-primary, #1a1a2e);
  border-color: var(--border-color, #e0e0e0);
}

.swagger-ui .btn {
  background: #f5f5f5;
  color: var(--text-primary, #1a1a2e);
  border-color: var(--border-color, #e0e0e0);
}

.swagger-ui .btn:hover {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

.swagger-ui .btn.primary {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

.swagger-ui .btn.primary:hover {
  background: #5a6fd6;
  border-color: #5a6fd6;
}

.swagger-ui .example {
  background: #f5f5f5;
  color: var(--text-primary, #1a1a2e);
}

.swagger-ui .response-col_status {
  color: var(--text-primary, #1a1a2e);
}

.swagger-ui .response-col_description {
  color: var(--text-secondary, #666);
}

.swagger-ui .tab {
  color: var(--text-secondary, #666);
}

.swagger-ui .tab.active {
  color: #667eea;
  border-color: #667eea;
}

.swagger-ui .highlight-code {
  background: #f5f5f5;
}

.swagger-ui .highlight-code code {
  color: var(--text-primary, #1a1a2e);
}

/* 深色主题样式 */
.swagger-dark .swagger-ui {
  background: #1e1e1e;
  color: #e0e0e0;
}

.swagger-dark .swagger-ui .info {
  color: #e0e0e0;
}

.swagger-dark .swagger-ui .opblock {
  background: #2d2d2d;
  border-color: #3c3c3c;
}

.swagger-dark .swagger-ui .opblock-summary-path {
  color: #e0e0e0;
}

.swagger-dark .swagger-ui .opblock-summary-description {
  color: #999;
}

.swagger-dark .swagger-ui .opblock-tag {
  color: #e0e0e0;
  border-color: #3c3c3c;
}

.swagger-dark .swagger-ui .scheme-container {
  background: #2d2d2d;
  border-bottom-color: #3c3c3c;
}

.swagger-dark .swagger-ui .models {
  color: #e0e0e0;
}

.swagger-dark .swagger-ui .model-title {
  color: #e0e0e0;
}

.swagger-dark .swagger-ui .parameter__name {
  color: #e0e0e0;
}

.swagger-dark .swagger-ui .parameter__type {
  color: #999;
}

.swagger-dark .swagger-ui select {
  background: #2d2d2d;
  color: #e0e0e0;
  border-color: #3c3c3c;
}

.swagger-dark .swagger-ui input[type=text],
.swagger-dark .swagger-ui input[type=password] {
  background: #2d2d2d;
  color: #e0e0e0;
  border-color: #3c3c3c;
}

.swagger-dark .swagger-ui textarea {
  background: #2d2d2d;
  color: #e0e0e0;
  border-color: #3c3c3c;
}

.swagger-dark .swagger-ui .btn {
  background: #3c3c3c;
  color: #e0e0e0;
  border-color: #3c3c3c;
}

.swagger-dark .swagger-ui .example {
  background: #2d2d2d;
  color: #e0e0e0;
}

.swagger-dark .swagger-ui .response-col_status {
  color: #e0e0e0;
}

.swagger-dark .swagger-ui .response-col_description {
  color: #999;
}

.swagger-dark .swagger-ui .tab {
  color: #999;
}

.swagger-dark .swagger-ui .tab.active {
  color: #667eea;
  border-color: #667eea;
}

.swagger-dark .swagger-ui .highlight-code {
  background: #2d2d2d;
}

.swagger-dark .swagger-ui .highlight-code code {
  color: #e0e0e0;
}

.swagger-dark .swagger-ui .opblock-description-wrapper p,
.swagger-dark .swagger-ui .opblock-external-docs-wrapper p,
.swagger-dark .swagger-ui .opblock-title_normal p {
  color: #e0e0e0;
}

.swagger-dark .swagger-ui table thead tr td,
.swagger-dark .swagger-ui table thead tr th {
  color: #e0e0e0;
  border-bottom: 1px solid #3c3c3c;
}

.swagger-dark .swagger-ui .renderedMarkdown p {
  color: #e0e0e0;
}

.swagger-dark .swagger-ui .markdown code {
  background: #2d2d2d;
  border-color: #3c3c3c;
  color: #e0e0e0;
}

.swagger-dark .swagger-ui .renderedMarkdown code {
  background: #2d2d2d;
  border-color: #3c3c3c;
  color: #e0e0e0;
}

.swagger-dark .swagger-ui .opblock-body pre.microlight {
  background: #2d2d2d !important;
  color: #e0e0e0 !important;
}

.swagger-dark .swagger-ui .model-box {
  background: #2d2d2d !important;
  border-color: #3c3c3c !important;
}
</style>
