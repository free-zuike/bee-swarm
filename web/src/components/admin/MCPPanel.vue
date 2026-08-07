<template>
  <div class="mcp-panel" :class="{ dark: isDark }">
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
          <div class="tool-permission">
            <span class="perm-badge" :class="{ admin: tool.permission === '仅管理员' }">{{ tool.permission }}</span>
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

    <!-- MiMoCode 配置 -->
    <div class="settings-card">
      <h4>🤖 {{ t('mcp.mimocode_config') }}</h4>
      <p class="hint">{{ t('mcp.mimocode_hint') }}</p>
      <pre :class="{ dark: isDark }"><code>{{ mimocodeConfig }}</code></pre>
      <button class="btn btn-sm btn-secondary" :class="{ dark: isDark }" @click="copyText(mimocodeConfig)">
        📋 {{ t('mcp.copy_config') }}
      </button>
    </div>

    <!-- 连接测试 -->
    <div class="settings-card">
      <h4>🔍 {{ t('mcp.test_connection') }}</h4>
      <div class="test-actions">
        <button class="btn btn-sm btn-primary" :class="{ dark: isDark, loading: testing }" @click="testConnection">
          {{ testing ? t('mcp.testing') : t('mcp.test') }}
        </button>
        <button class="btn btn-sm btn-secondary" :class="{ dark: isDark, loading: testingTools }" @click="testToolsList">
          {{ testingTools ? t('mcp.testing') : t('mcp.test_tools') }}
        </button>
      </div>
      <div v-if="testResult" class="test-result" :class="{ success: testSuccess, error: !testSuccess }">
        <pre :class="{ dark: isDark }">{{ testResult }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useTranslation } from '@/i18n';
import { useThemeStore } from '@/stores/theme';
import { useGlobalToast } from '@/composables/useToast';

const t = useTranslation();
const { showToast } = useGlobalToast();
const themeStore = useThemeStore();
const isDark = computed(() => themeStore.isDark);

const props = defineProps<{
  token: string;
}>();
const testing = ref(false);
const testingTools = ref(false);
const testResult = ref('');
const testSuccess = ref(false);

const mcpEndpoint = computed(() => `${window.location.origin}/mcp`);
const mcpMessageEndpoint = computed(() => `${window.location.origin}/mcp/message`);
const protocolVersion = '2024-11-05';
const serverInfo = { name: 'bee-swarm-mcp', version: '1.0.0' };

const mimocodeConfig = computed(() => `{
  "mcp": {
    "bee-swarm": {
      "type": "remote",
      "url": "${window.location.origin}/mcp?apikey=YOUR_API_KEY",
      "headers": {
        "X-API-Key": "YOUR_API_KEY"
      }
    }
  }
}`);

const tools = [
  {
    name: 'send_push',
    description: '发送推送通知到指定渠道。支持 wework、dingtalk、telegram、bark 等 15+ 渠道。',
    permission: '所有用户',
    params: [
      { name: 'title', type: 'string', required: true },
      { name: 'body', type: 'string', required: false },
      { name: 'url', type: 'string', required: false },
      { name: 'channels', type: 'string (逗号分隔)', required: false },
    ],
  },
  {
    name: 'create_scheduled_push',
    description: '创建定时推送任务，支持一次性或循环（daily/weekly/monthly/cron）。',
    permission: '所有用户',
    params: [
      { name: 'title', type: 'string', required: true },
      { name: 'channels', type: 'string (逗号分隔)', required: true },
      { name: 'scheduledAt', type: 'string (ISO 8601)', required: true },
      { name: 'body', type: 'string', required: false },
      { name: 'scheduleType', type: 'once/recurring', required: false },
      { name: 'recurringType', type: 'daily/weekly/monthly/cron', required: false },
      { name: 'selectedWeekDays', type: 'string (0-6 逗号分隔)', required: false },
      { name: 'cronExpression', type: 'string', required: false },
      { name: 'timezone', type: 'string (默认 Asia/Shanghai)', required: false },
    ],
  },
  {
    name: 'update_scheduled_push',
    description: '更新一个定时推送任务（仅 pending 状态可编辑）。',
    permission: '所有用户',
    params: [
      { name: 'id', type: 'string', required: true },
      { name: 'title', type: 'string', required: false },
      { name: 'body', type: 'string', required: false },
      { name: 'channels', type: 'string (逗号分隔)', required: false },
      { name: 'scheduledAt', type: 'string (ISO 8601)', required: false },
      { name: 'scheduleType', type: 'once/recurring', required: false },
      { name: 'recurringType', type: 'daily/weekly/monthly/cron', required: false },
      { name: 'selectedWeekDays', type: 'string (0-6 逗号分隔)', required: false },
      { name: 'timezone', type: 'string', required: false },
    ],
  },
  {
    name: 'cancel_scheduled_push',
    description: '取消一个定时推送任务。',
    permission: '所有用户',
    params: [{ name: 'id', type: 'string', required: true }],
  },
  {
    name: 'reschedule_overdue_task',
    description: '重新安排一个已超时的定时任务。',
    permission: '所有用户',
    params: [
      { name: 'id', type: 'string', required: true },
      { name: 'scheduledAt', type: 'string (ISO 8601)', required: true },
    ],
  },
  {
    name: 'list_scheduled_pushes',
    description: '列出所有定时推送任务，可按状态筛选。',
    permission: '所有用户',
    params: [{ name: 'status', type: 'string (pending/completed/failed)', required: false }],
  },
  {
    name: 'get_scheduled_push_detail',
    description: '获取单个定时推送任务的详细信息。',
    permission: '所有用户',
    params: [{ name: 'id', type: 'string', required: true }],
  },
  {
    name: 'get_templates',
    description: '获取所有推送模板列表。',
    permission: '所有用户',
    params: [],
  },
  {
    name: 'get_channel_groups',
    description: '获取渠道分组列表。',
    permission: '所有用户',
    params: [],
  },
  {
    name: 'get_push_history',
    description: '获取最近的推送历史记录。',
    permission: '所有用户',
    params: [{ name: 'limit', type: 'number (默认 10)', required: false }],
  },
  {
    name: 'get_push_history_detail',
    description: '获取单条推送历史的详细信息，包含渠道结果。',
    permission: '所有用户',
    params: [{ name: 'id', type: 'string', required: true }],
  },
  {
    name: 'get_push_stats',
    description: '获取推送统计信息，包括成功率、趋势、每日统计等。',
    permission: '所有用户',
    params: [{ name: 'days', type: 'number (默认 7)', required: false }],
  },
  {
    name: 'get_execution_logs',
    description: '获取推送执行日志，包含渠道结果和错误信息。',
    permission: '所有用户',
    params: [{ name: 'limit', type: 'number (默认 10)', required: false }],
  },
  {
    name: 'test_channel',
    description: '测试单个推送渠道，发送真实测试消息验证是否可用。',
    permission: '所有用户',
    params: [{ name: 'channel', type: 'string', required: true }],
  },
  {
    name: 'check_all_channels_health',
    description: '检查所有已配置渠道的健康状态，逐个发送测试消息。',
    permission: '所有用户',
    params: [],
  },
  {
    name: 'get_drafts',
    description: '获取推送草稿列表。',
    permission: '所有用户',
    params: [],
  },
  {
    name: 'get_favorites',
    description: '获取推送收藏列表。',
    permission: '所有用户',
    params: [],
  },
  {
    name: 'list_channels',
    description: '列出所有可用的推送渠道及其启用状态。',
    permission: '所有用户',
    params: [],
  },
  {
    name: 'get_system_status',
    description: '获取系统健康状态、用户数量、待处理任务数等统计信息。',
    permission: '仅管理员',
    params: [],
  },
];

const usageExample = `// 列出可用工具 (Streamable HTTP)
POST /mcp
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}

// 发送推送
POST /mcp
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
    showToast(t('label.copied') || '已复制', 'success');
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast(t('label.copied') || '已复制', 'success');
  }
}

async function testConnection() {
  testing.value = true;
  testResult.value = '';
  testSuccess.value = false;

  try {
    const res = await fetch(mcpEndpoint.value, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Token': props.token },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    const data = await res.json();
    testResult.value = `HTTP ${res.status}\n${JSON.stringify(data, null, 2)}`;
    testSuccess.value = res.ok;
  } catch (err) {
    testResult.value = `连接失败: ${(err as Error).message}`;
    testSuccess.value = false;
  } finally {
    testing.value = false;
  }
}

async function testToolsList() {
  testingTools.value = true;
  testResult.value = '';
  testSuccess.value = false;

  try {
    const res = await fetch(mcpEndpoint.value, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Token': props.token },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    const data = await res.json();
    const toolCount = data?.result?.tools?.length ?? 0;
    testResult.value = `HTTP ${res.status} | 工具数: ${toolCount}\n${JSON.stringify(data, null, 2)}`;
    testSuccess.value = res.ok && toolCount > 0;
  } catch (err) {
    testResult.value = `获取工具失败: ${(err as Error).message}`;
    testSuccess.value = false;
  } finally {
    testingTools.value = false;
  }
}
</script>

<style scoped>
.mcp-panel h3 {
  font-size: 18px;
  margin-bottom: 20px;
}

.settings-card {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
}

.mcp-panel.dark .settings-card {
  background: #2d2d2d;
  border-color: #3c3c3c;
}

.settings-card h4 {
  margin: 0 0 12px;
  font-size: 15px;
  color: #333;
}

.mcp-panel.dark .settings-card h4 {
  color: #e0e0e0;
}

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

.tool-permission {
  margin-top: 6px;
}

.perm-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #e6f4ea;
  color: #1e7e34;
}

.perm-badge.admin {
  background: #fce8e6;
  color: #d93025;
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