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
            <button class="btn btn-sm btn-icon" @click="copyWebhookUrl" title="复制 URL">📋</button>
          </div>
          <p class="hint">使用 API Key 作为 Bearer Token 发送 POST 请求到此 URL 来触发推送</p>
        </div>

        <div class="test-section">
          <h3>测试 Webhook 推送</h3>

          <div class="form-group">
            <label class="form-label">推送标题</label>
            <input
              v-model="testPayload.title"
              type="text"
              placeholder="例如: 测试推送"
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label class="form-label">推送内容</label>
            <textarea
              v-model="testPayload.content"
              placeholder="输入推送内容..."
              rows="3"
              class="form-input"
            ></textarea>
          </div>

          <div class="form-group">
            <label class="form-label">推送渠道</label>
            <div class="channel-selector">
              <label v-for="ch in availableChannels" :key="ch" class="channel-checkbox">
                <input type="checkbox" :value="ch" v-model="testPayload.channels" />
                <span class="channel-icon">{{ getChannelIcon(ch) }}</span>
                <span class="channel-name">{{ getChannelName(ch) }}</span>
              </label>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">跳转链接（可选）</label>
            <input
              v-model="testPayload.url"
              type="url"
              placeholder="https://example.com"
              class="form-input"
            />
          </div>

          <div class="form-actions">
            <button
              class="btn btn-primary"
              @click="sendTestPush"
              :disabled="sending || !canSend"
            >
              {{ sending ? '推送中...' : '发送推送' }}
            </button>
          </div>

          <div v-if="pushResult" class="push-result" :class="{ success: pushResult.success }">
            <p class="result-message">{{ pushResult.message }}</p>
            <div v-if="pushResult.results.length > 0" class="result-details">
              <div
                v-for="(r, i) in pushResult.results"
                :key="i"
                class="result-item"
                :class="{ success: r.success }"
              >
                <span class="result-icon">{{ r.success ? '✅' : '❌' }}</span>
                <span class="result-channel">{{ r.channel }}</span>
                <span class="result-text">{{ r.message }}</span>
              </div>
            </div>
          </div>
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
            <button class="btn btn-sm btn-icon" @click="copyExampleCode" title="复制代码">📋</button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useGlobalToast } from '@/composables/useToast';
import { useTranslation } from '@/i18n';
import { getWebhookUrl, webhookPush, getChannelsWithToken } from '@/api';
import type { PushChannel } from '@/types';

const props = defineProps<{
  accessToken: string;
}>();

const { showToast } = useGlobalToast();
const { t } = useTranslation();

const loading = ref(true);
const sending = ref(false);
const webhookUrl = ref('');
const availableChannels = ref<PushChannel[]>([]);

const testPayload = ref({
  title: '',
  content: '',
  channels: [] as PushChannel[],
  url: '',
});

const pushResult = ref<{
  success: boolean;
  message: string;
  results: Array<{ channel: string; success: boolean; message: string }>;
} | null>(null);

const activeExample = ref<'curl' | 'javascript' | 'python'>('curl');

const canSend = computed(() => {
  return (testPayload.value.title || testPayload.value.content) && testPayload.value.channels.length > 0;
});

const exampleCode = computed(() => {
  const url = webhookUrl.value;
  const body = JSON.stringify({
    title: testPayload.value.title || '推送标题',
    content: testPayload.value.content || '推送内容',
    channels: testPayload.value.channels.length > 0 ? testPayload.value.channels : ['wework'],
    url: testPayload.value.url || undefined,
  }, null, 2);

  switch (activeExample.value) {
    case 'curl':
      return `curl -X POST '${url}' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '${JSON.stringify({
    title: '推送标题',
    content: '推送内容',
    channels: ['wework', 'dingtalk'],
  })}'`;
    case 'javascript':
      return `fetch('${url}', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    title: '推送标题',
    content: '推送内容',
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
        'title': '推送标题',
        'content': '推送内容',
        'channels': ['wework', 'dingtalk'],
    }
)
print(response.json())`;
    default:
      return '';
  }
});

const channelIcons: Record<string, string> = {
  wework: '💼',
  dingtalk: '🅰️',
  feishu: '🪶',
  telegram: '✈️',
  bark: '📱',
  ntfy: '📢',
  email: '📧',
  slack: '💬',
  discord: '🎮',
};

function getChannelIcon(channel: string): string {
  return channelIcons[channel] || '📡';
}

function getChannelName(channel: string): string {
  const names: Record<string, string> = {
    wework: '企业微信',
    dingtalk: '钉钉',
    feishu: '飞书',
    telegram: 'Telegram',
    bark: 'Bark',
    ntfy: 'ntfy',
    email: '邮件',
    slack: 'Slack',
    discord: 'Discord',
  };
  return names[channel] || channel;
}

async function loadWebhookUrl() {
  try {
    const data = await getWebhookUrl(props.accessToken);
    webhookUrl.value = data.webhookUrl;
  } catch (err) {
    console.error('获取 Webhook URL 失败:', err);
    showToast('获取 Webhook URL 失败', 'error');
  }
}

async function loadChannels() {
  try {
    const data = await getChannelsWithToken(props.accessToken);
    availableChannels.value = data.channels
      .filter((ch: any) => ch.enabled)
      .map((ch: any) => ch.id as PushChannel);
  } catch (err) {
    console.error('加载渠道列表失败:', err);
  }
}

async function sendTestPush() {
  if (!canSend.value || sending.value) return;

  sending.value = true;
  pushResult.value = null;

  try {
    const result = await webhookPush(props.accessToken, {
      title: testPayload.value.title || undefined,
      content: testPayload.value.content || undefined,
      channels: testPayload.value.channels,
      url: testPayload.value.url || undefined,
    });

    pushResult.value = {
      success: result.success,
      message: result.message,
      results: result.results,
    };

    if (result.success) {
      showToast('推送成功', 'success');
    } else {
      showToast('部分推送失败', 'error');
    }
  } catch (err: any) {
    pushResult.value = {
      success: false,
      message: err.message || '推送失败',
      results: [],
    };
    showToast('推送失败', 'error');
  } finally {
    sending.value = false;
  }
}

async function copyWebhookUrl() {
  if (!webhookUrl.value) return;
  try {
    await navigator.clipboard.writeText(webhookUrl.value);
    showToast('已复制到剪贴板', 'success');
  } catch (err) {
    showToast('复制失败', 'error');
  }
}

async function copyExampleCode() {
  try {
    await navigator.clipboard.writeText(exampleCode.value);
    showToast('代码已复制', 'success');
  } catch (err) {
    showToast('复制失败', 'error');
  }
}

onMounted(async () => {
  loading.value = true;
  await Promise.all([
    loadWebhookUrl(),
    loadChannels(),
  ]);
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
  to { transform: rotate(360deg); }
}

.webhook-url-section,
.test-section,
.example-section {
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

.form-group {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #333);
  margin-bottom: 8px;
}

.form-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 14px;
  background: var(--bg-secondary, #f9f9f9);
  color: var(--text-primary, #333);
  transition: border-color 0.2s, background 0.2s;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: #667eea;
  background: var(--bg-panel, white);
}

textarea.form-input {
  resize: vertical;
  min-height: 80px;
}

.channel-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.channel-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--bg-secondary, #f5f5f5);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.channel-checkbox:hover {
  background: var(--bg-panel, #eef0ff);
  border-color: #667eea;
}

.channel-checkbox input {
  display: none;
}

.channel-checkbox input:checked + .channel-icon + .channel-name {
  color: #667eea;
  font-weight: 600;
}

.channel-checkbox:has(input:checked) {
  background: #eef0ff;
  border-color: #667eea;
}

.channel-icon {
  font-size: 16px;
}

.channel-name {
  font-size: 13px;
  color: var(--text-primary, #333);
}

.form-actions {
  margin-top: 20px;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  height: 44px;
  box-sizing: border-box;
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

.btn-primary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.push-result {
  margin-top: 16px;
  padding: 16px;
  border-radius: 8px;
  background: var(--bg-secondary, #f5f5f5);
}

.push-result.success {
  background: #d1fae5;
  border: 1px solid #a7f3d0;
}

.push-result:not(.success) {
  background: #fee2e2;
  border: 1px solid #fecaca;
}

.result-message {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
}

.push-result.success .result-message {
  color: #065f46;
}

.push-result:not(.success) .result-message {
  color: #991b1b;
}

.result-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.result-item.success .result-text {
  color: #065f46;
}

.result-item:not(.success) .result-text {
  color: #991b1b;
}

.result-icon {
  font-size: 14px;
}

.result-channel {
  font-weight: 500;
  color: var(--text-primary, #333);
  min-width: 80px;
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

  .panel-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .panel-header h2 {
    font-size: 16px;
  }

  .header-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .header-actions .btn {
    flex: 1;
    min-width: 80px;
  }

  .channel-selector {
    gap: 6px;
    flex-wrap: wrap;
  }

  .channel-checkbox {
    padding: 6px 10px;
    font-size: 12px;
  }

  .example-code {
    padding: 12px;
  }

  .example-code code {
    font-size: 11px;
    word-break: break-all;
  }

  .webhook-item {
    padding: 12px;
  }

  .webhook-header {
    flex-direction: column;
    gap: 8px;
  }

  .webhook-info {
    flex-direction: column;
    gap: 4px;
  }

  .webhook-actions {
    flex-direction: column;
    gap: 4px;
    width: 100%;
  }

  .webhook-actions .btn {
    width: 100%;
  }

  .modal {
    width: 95%;
    max-width: 100%;
    margin: 16px;
  }

  .modal-header {
    padding: 12px 16px;
  }

  .modal-body {
    padding: 16px;
  }

  .form-actions {
    flex-direction: column;
    gap: 8px;
  }

  .form-actions .btn {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .panel {
    padding: 12px;
  }

  .panel-header h2 {
    font-size: 14px;
  }

  .btn-sm {
    padding: 5px 10px;
    font-size: 11px;
  }

  .webhook-name {
    font-size: 13px;
  }

  .webhook-url {
    font-size: 11px;
  }

  .webhook-desc {
    font-size: 11px;
  }

  .channel-checkbox {
    font-size: 11px;
    padding: 5px 8px;
  }

  .example-code {
    padding: 10px;
  }

  .example-code code {
    font-size: 10px;
  }

  .modal-header h3 {
    font-size: 14px;
  }

  .webhook-empty p {
    font-size: 12px;
  }
}
</style>
