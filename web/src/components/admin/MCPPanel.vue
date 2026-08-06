<template>
  <div class="settings-panel" :class="{ dark: isDark }">
    <h3>🔌 {{ t('mcp.title') }}</h3>

    <!-- 连接信息 -->
    <div class="settings-card">
      <h4>📡 {{ t('mcp.connection_info') }}</h4>
      <div class="mcp-info-grid">
        <div class="info-item">
          <span class="info-label">{{ t('mcp.endpoint') }}</span>
          <code class="info-value" :class="{ dark: isDark }">{{ mcpEndpoint }}</code>
          <button class="btn-copy" @click="copyText(mcpEndpoint)">📋</button>
        </div>
        <div class="info-item">
          <span class="info-label">{{ t('mcp.message_endpoint') }}</span>
          <code class="info-value" :class="{ dark: isDark }">{{ mcpMessageEndpoint }}</code>
          <button class="btn-copy" @click="copyText(mcpMessageEndpoint)">📋</button>
        </div>
        <div class="info-item">
          <span class="info-label">{{ t('mcp.protocol') }}</span>
          <span class="info-value">{{ protocolVersion }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">{{ t('mcp.server_name') }}</span>
          <span class="info-value">{{ serverInfo.name }} v{{ serverInfo.version }}</span>
        </div>
      </div>
    </div>

    <!-- 认证方式 -->
    <div class="settings-card">
      <h4>🔑 {{ t('mcp.auth') }}</h4>
      <p class="hint">{{ t('mcp.auth_hint') }}</p>
      <div class="auth-methods">
        <div class="auth-method">
          <code :class="{ dark: isDark }">X-API-Key: &lt;your-api-key&gt;</code>
        </div>
        <div class="auth-method">
          <code :class="{ dark: isDark }">X-Token: &lt;your-token&gt;</code>
        </div>
      </div>
    </div>

    <!-- 可用工具列表 -->
    <div class="settings-card">
      <h4>🛠️ {{ t('mcp.available_tools') }}</h4>
      <div class="tools-list">
        <div v-for="tool in tools" :key="tool.name" class="tool-card" :class="{ dark: isDark }">
          <div class="tool-header">
            <code class="tool-name" :class="{ dark: isDark }">{{ tool.name }}</code>
          </div>
          <p class="tool-desc">{{ tool.description }}</p>
          <div v-if="tool.params.length > 0" class="tool-params">
            <span class="params-label">{{ t('mcp.params') }}:</span>
            <div class="param-list">
              <span
                v-for="param in tool.params"
                :key="param.name"
                class="param-tag"
                :class="{ required: param.required }"
              >
                {{ param.name }}<span v-if="param.required">*</span>: {{ param.type }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 使用示例 -->
    <div class="settings-card">
      <h4>📝 {{ t('mcp.usage_example') }}</h4>
      <pre :class="{ dark: isDark }"><code>{{ usageExample }}</code></pre>
      <button class="btn btn-sm btn-secondary" :class="{ dark: isDark }" @click="copyText(usageExample)">
        📋 {{ t('mcp.copy_example') }}
      </button>
    </div>

    <!-- 连接测试 -->
    <div class="settings-card">
      <h4>🔍 {{ t('mcp.test_connection') }}</h4>
      <div class="test-actions">
        <button class="btn btn-sm btn-primary" :class="{ dark: isDark, loading: testing }" @click="testConnection">
          {{ testing ? t('mcp.testing') : t('mcp.test') }}
        </button>
      </div>
      <div v-if="testResult" class="test-result" :class="{ success: testSuccess, error: !testSuccess }">
        <pre :class="{ dark: isDark }">{{ testResult }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useTranslation } from '@/i18n';

const { t } = useTranslation();

const props = defineProps<{
  token: string;
}>();

const isDark = computed(() => document.documentElement.getAttribute('data-theme') === 'dark');
const testing = ref(false);
const testResult = ref('');
const testSuccess = ref(false);

const mcpEndpoint = computed(() => `${window.location.origin}/mcp`);
const mcpMessageEndpoint = computed(() => `${window.location.origin}/mcp/message`);
const protocolVersion = '2024-11-05';
const serverInfo = { name: 'bee-swarm-mcp', version: '1.0.0' };

const tools = [
  {
    name: 'send_push',
    description: '发送推送通知到指定渠道。支持 wework、dingtalk、telegram、bark 等 15+ 渠道。',
    params: [
      { name: 'title', type: 'string', required: true },
      { name: 'body', type: 'string', required: false },
      { name: 'url', type: 'string', required: false },
      { name: 'channels', type: 'string (逗号分隔)', required: false },
    ],
  },
  {
    name: 'list_channels',
    description: '列出所有可用的推送渠道及其启用状态。',
    params: [],
  },
  {
    name: 'list_scheduled_pushes',
    description: '列出所有定时推送任务，可按状态筛选。',
    params: [
      { name: 'status', type: 'string (pending/completed/failed)', required: false },
    ],
  },
  {
    name: 'get_push_history',
    description: '获取最近的推送历史记录。',
    params: [
      { name: 'limit', type: 'number (默认 10)', required: false },
    ],
  },
  {
    name: 'get_system_status',
    description: '获取系统健康状态、用户数量、待处理任务数等统计信息。',
    params: [],
  },
];

const usageExample = `// 列出可用工具
POST /mcp/message
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}

// 发送推送
POST /mcp/message
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "send_push",
    "arguments": {
      "title": "Hello",
      "body": "这是一条测试推送",
      "channels": "wework,dingtalk"
    }
  }
}`;

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // fallback
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

async function testConnection() {
  testing.value = true;
  testResult.value = '';
  testSuccess.value = false;

  try {
    const res = await fetch(mcpEndpoint.value, {
      headers: { 'X-Token': props.token },
    });
    const data = await res.json();
    testResult.value = JSON.stringify(data, null, 2);
    testSuccess.value = true;
  } catch (err) {
    testResult.value = `连接失败: ${(err as Error).message}`;
    testSuccess.value = false;
  } finally {
    testing.value = false;
  }
}
</script>

<style scoped>
.mcp-info-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.info-label {
  font-size: 13px;
  color: #666;
  min-width: 100px;
}

.info-value {
  font-size: 13px;
  word-break: break-all;
}

.btn-copy {
  background: none;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  padding: 2px 6px;
  font-size: 12px;
}

.btn-copy:hover {
  background: #f0f0f0;
}

.auth-methods {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.auth-method code {
  display: block;
  padding: 8px 12px;
  background: #f5f5f5;
  border-radius: 6px;
  font-size: 13px;
  word-break: break-all;
}

.auth-method code.dark {
  background: #2a2a2a;
  color: #e0e0e0;
}

.tools-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
}

.tool-card {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px 16px;
  background: #fafafa;
}

.tool-card.dark {
  border-color: #333;
  background: #1e1e1e;
}

.tool-header {
  margin-bottom: 6px;
}

.tool-name {
  font-size: 14px;
  font-weight: 600;
  color: #1a73e8;
  background: #e8f0fe;
  padding: 2px 8px;
  border-radius: 4px;
}

.tool-name.dark {
  background: #1a3a5c;
  color: #64b5f6;
}

.tool-desc {
  font-size: 13px;
  color: #555;
  margin: 4px 0 8px;
  line-height: 1.5;
}

.tool-params {
  margin-top: 6px;
}

.params-label {
  font-size: 12px;
  color: #888;
  margin-right: 6px;
}

.param-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.param-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #f0f0f0;
  color: #666;
}

.param-tag.required {
  background: #fce8e6;
  color: #d93025;
}

.test-actions {
  margin-top: 12px;
}

.test-result {
  margin-top: 12px;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid #e0e0e0;
}

.test-result.success {
  border-color: #34a853;
  background: #e6f4ea;
}

.test-result.error {
  border-color: #ea4335;
  background: #fce8e6;
}

.test-result pre {
  margin: 0;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}

pre {
  padding: 12px;
  background: #f5f5f5;
  border-radius: 6px;
  font-size: 12px;
  overflow-x: auto;
  line-height: 1.5;
}

pre.dark {
  background: #1e1e1e;
  color: #e0e0e0;
}

.hint {
  font-size: 13px;
  color: #666;
  line-height: 1.5;
}
</style>