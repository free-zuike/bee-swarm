<template>
  <div class="webhook-manager">
    <div class="panel">
      <div class="panel-header">
        <h2>🔗 Webhook 触发推送</h2>
      </div>

      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <span>加载中...</span>
      </div>

      <template v-else>
        <div class="webhook-url-section">
          <h3>Webhook URL</h3>
          <div class="url-display">
            <code class="url-text">{{ webhookUrl }}</code>
            <button class="btn btn-sm btn-icon" @click="copyWebhookUrl" title="复制 URL"></button>
          </div>
          <p class="hint">使用 API Key 作为 Bearer Token 发送 POST 请求到此 URL 来触发推送</p>
        </div>

        <div class="example-section">
          <h3>使用示例</h3>

          <div class="example-tabs">
            <button
              v-for="tab in ['curl', 'javascript', 'python']"
              :key="tab"
              :class="['example-tab', { active: activeExample === tab }]"
              @click="activeExample = tab"
            >
              {{ tab }}
            </button>
          </div>

          <div class="example-code">
            <pre><code>{{ exampleCode }}</code></pre>
            <button class="btn btn-sm btn-icon" @click="copyExampleCode" title="复制代码">
              📋
            </button>
          </div>
        </div>

        <div class="info-section">
          <h3>请求格式</h3>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Method</span>
              <code>POST</code>
            </div>
            <div class="info-item">
              <span class="info-label">Content-Type</span>
              <code>application/json</code>
            </div>
            <div class="info-item">
              <span class="info-label">Authorization</span>
              <code>Bearer YOUR_API_KEY</code>
            </div>
          </div>

          <h3 style="margin-top: 16px">请求体</h3>
          <div class="schema-table">
            <div class="schema-row header">
              <span>字段</span>
              <span>类型</span>
              <span>必填</span>
              <span>说明</span>
            </div>
            <div class="schema-row">
              <code>title</code>
              <span>string</span>
              <span>是</span>
              <span>推送标题</span>
            </div>
            <div class="schema-row">
              <code>content</code>
              <span>string</span>
              <span>否</span>
              <span>推送内容</span>
            </div>
            <div class="schema-row">
              <code>channels</code>
              <span>string[]</span>
              <span>否</span>
              <span>指定推送渠道，不传则推送到所有已启用的渠道</span>
            </div>
            <div class="schema-row">
              <code>url</code>
              <span>string</span>
              <span>否</span>
              <span>跳转链接</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useGlobalToast } from '@/composables/useToast';
import { getWebhookUrl } from '@/api';

const props = defineProps<{
  accessToken: string;
}>();

const { showToast } = useGlobalToast();

const loading = ref(true);
const webhookUrl = ref('');
const activeExample = ref<'curl' | 'javascript' | 'python'>('curl');

const exampleCode = computed(() => {
  const url = webhookUrl.value;

  switch (activeExample.value) {
    case 'curl':
      return `curl -X POST '${url}' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "title": "部署完成",
    "content": "v1.2.3 已成功部署到生产环境",
    "channels": ["wework", "dingtalk"]
  }'`;
    case 'javascript':
      return `fetch('${url}', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    title: '部署完成',
    content: 'v1.2.3 已成功部署到生产环境',
    channels: ['wework', 'dingtalk'],
  })
}).then(res => res.json())
  .then(data => console.log(data));`;
    case 'python':
      return `import requests

response = requests.post(
    '${url}',
    headers={
        'Authorization': 'Bearer YOUR_API_KEY',
        'Content-Type': 'application/json',
    },
    json={
        'title': '部署完成',
        'content': 'v1.2.3 已成功部署到生产环境',
        'channels': ['wework', 'dingtalk'],
    }
)
print(response.json())`;
    default:
      return '';
  }
});

async function loadWebhookUrl() {
  try {
    const data = await getWebhookUrl(props.accessToken);
    webhookUrl.value = data.webhookUrl;
  } catch (_err) {
    console.error('获取 Webhook URL 失败:', _err);
    showToast('获取 Webhook URL 失败', 'error');
  }
}

async function copyWebhookUrl() {
  if (!webhookUrl.value) return;
  try {
    await navigator.clipboard.writeText(webhookUrl.value);
    showToast('已复制到剪贴板', 'success');
  } catch (_err) {
    showToast('复制失败', 'error');
  }
}

async function copyExampleCode() {
  try {
    await navigator.clipboard.writeText(exampleCode.value);
    showToast('代码已复制', 'success');
  } catch (_err) {
    showToast('复制失败', 'error');
  }
}

onMounted(async () => {
  loading.value = true;
  await loadWebhookUrl();
  loading.value = false;
});
</script>

<style scoped>
.webhook-manager {
  margin-bottom: 24px;
}

.panel {
  background: var(--bg-panel, white);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: background 0.3s;
}

.panel-header {
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
}

.panel-header h2 {
  font-size: 18px;
  color: var(--text-primary, #1a1a2e);
  margin: 0;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 0;
  color: var(--text-secondary, #666);
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.webhook-url-section,
.example-section,
.info-section {
  margin-bottom: 24px;
}

h3 {
  font-size: 16px;
  color: var(--text-primary, #1a1a2e);
  margin-bottom: 12px;
}

.url-display {
  display: flex;
  gap: 8px;
  align-items: center;
  background: var(--bg-secondary, #f5f5f5);
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 8px;
}

.url-text {
  flex: 1;
  font-family: monospace;
  font-size: 13px;
  color: var(--text-primary, #1a1a2e);
  word-break: break-all;
}

.hint {
  font-size: 12px;
  color: var(--text-secondary, #999);
  margin: 0;
}

.example-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}

.example-tab {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  background: transparent;
  color: var(--text-secondary, #666);
  transition: all 0.2s;
}

.example-tab:hover {
  background: var(--bg-secondary, #f0f0f0);
}

.example-tab.active {
  background: #667eea;
  color: white;
}

.example-code {
  position: relative;
  background: #1e1e2e;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.example-code pre {
  margin: 0;
  flex: 1;
  overflow-x: auto;
}

.example-code code {
  font-family: 'Fira Code', 'Cascadia Code', monospace;
  font-size: 12px;
  color: #cdd6f4;
  white-space: pre;
  line-height: 1.5;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 8px;
}

.info-label {
  font-size: 13px;
  color: var(--text-secondary, #666);
}

.info-item code {
  font-size: 13px;
  color: #667eea;
  font-weight: 600;
}

.schema-table {
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 8px;
  overflow: hidden;
}

.schema-row {
  display: grid;
  grid-template-columns: 120px 100px 60px 1fr;
  gap: 12px;
  padding: 12px 16px;
  font-size: 13px;
  align-items: center;
}

.schema-row.header {
  background: var(--bg-panel, white);
  font-weight: 600;
  color: var(--text-primary, #333);
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.schema-row:not(.header) {
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.schema-row:not(.header):last-child {
  border-bottom: none;
}

.schema-row code {
  font-size: 12px;
  color: #667eea;
  background: var(--bg-panel, white);
  padding: 2px 6px;
  border-radius: 4px;
}

.btn-sm {
  padding: 8px 18px;
  font-size: 13px;
  height: 36px;
}

.btn-icon {
  padding: 8px 12px;
  background: transparent;
  border: none;
  font-size: 20px;
  cursor: pointer;
  border-radius: 4px;
}

.btn-icon:hover {
  background: var(--bg-secondary, #f0f0f0);
}

.example-code .btn-icon {
  color: #cdd6f4;
  flex-shrink: 0;
}

.example-code .btn-icon:hover {
  background: rgba(255, 255, 255, 0.1);
}

@media (max-width: 768px) {
  .panel {
    padding: 16px;
  }

  .panel-header h2 {
    font-size: 16px;
  }

  .example-code {
    padding: 12px;
  }

  .example-code code {
    font-size: 11px;
    word-break: break-all;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }

  .schema-row {
    grid-template-columns: 100px 80px 50px 1fr;
    font-size: 12px;
    gap: 8px;
  }
}

@media (max-width: 480px) {
  .panel {
    padding: 12px;
  }

  .panel-header h2 {
    font-size: 14px;
  }

  .example-code {
    padding: 10px;
  }

  .example-code code {
    font-size: 10px;
  }

  .schema-row {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .schema-row.header {
    display: none;
  }

  .schema-row:not(.header) {
    padding: 12px;
  }
}
</style>
