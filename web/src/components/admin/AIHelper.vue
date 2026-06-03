<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useTranslation } from '@/i18n';
import { useGlobalToast } from '@/composables/useToast';
import { checkAIAvailable, executeAICommand } from '@/api';

const props = defineProps<{
  accessToken: string;
}>();

const emit = defineEmits<{
  refresh: [];
}>();

const { showToast } = useGlobalToast();
const t = useTranslation();

const aiAvailable = ref(false);
const aiLoading = ref(false);
const userQuery = ref('');
const chatHistory = ref<Array<{ type: 'user' | 'ai'; content: string; data?: unknown }>>([]);
const showPanel = ref(false);

const quickCommands = [
  { label: '列出所有模板', query: '列出所有模板' },
  { label: '创建模板', query: '创建一个名为"系统通知"的模板，标题为"系统更新提醒"，内容为"系统将于今晚22:00进行维护升级"' },
  { label: '创建分组', query: '创建一个名为"紧急通知"的分组，包含telegram和bark渠道' },
  { label: '执行备份', query: '执行备份' },
  { label: '列出定时任务', query: '列出所有定时任务' },
  { label: '列出渠道', query: '列出所有渠道' },
];

async function checkAI() {
  try {
    const result = await checkAIAvailable(props.accessToken);
    aiAvailable.value = result.available;
  } catch (error) {
    console.error('Failed to check AI availability:', error);
    aiAvailable.value = false;
  }
}

async function handleSubmit() {
  if (!userQuery.value.trim()) {
    showToast(t('error.required', { field: t('label.query') }), 'error');
    return;
  }

  const query = userQuery.value.trim();
  chatHistory.value.push({ type: 'user', content: query });
  userQuery.value = '';

  aiLoading.value = true;
  try {
    const result = await executeAICommand(props.accessToken, query);
    chatHistory.value.push({
      type: 'ai',
      content: result.result,
      data: result.data,
    });
    if (result.success && result.data) {
      emit('refresh');
    }
    if (!result.success && result.error) {
      showToast(result.error, 'error');
    }
  } catch (error) {
    console.error('AI command execution failed:', error);
    chatHistory.value.push({
      type: 'ai',
      content: t('msg.ai_execute_failed'),
    });
    showToast(t('msg.ai_execute_failed'), 'error');
  } finally {
    aiLoading.value = false;
  }
}

function useQuickCommand(query: string) {
  userQuery.value = query;
}

function clearHistory() {
  chatHistory.value = [];
}

onMounted(() => {
  checkAI();
});
</script>

<template>
  <div class="ai-helper">
    <button
      v-if="aiAvailable"
      class="ai-toggle-btn"
      :class="{ active: showPanel }"
      @click="showPanel = !showPanel"
    >
      🤖 {{ t('button.ai_helper') }}
    </button>

    <div v-if="showPanel && aiAvailable" class="ai-panel-container">
      <div class="ai-panel-header">
        <h3>🤖 {{ t('label.ai_helper') }}</h3>
        <button class="close-btn" @click="showPanel = false">×</button>
      </div>

      <div class="ai-quick-commands">
        <span class="quick-label">{{ t('label.quick_actions') }}:</span>
        <div class="quick-buttons">
          <button
            v-for="cmd in quickCommands"
            :key="cmd.label"
            class="quick-btn"
            @click="useQuickCommand(cmd.query)"
          >
            {{ cmd.label }}
          </button>
        </div>
      </div>

      <div class="ai-chat-container">
        <div v-if="chatHistory.length === 0" class="ai-empty-state">
          <p>{{ t('hint.ai_helper_welcome') }}</p>
          <p class="example">{{ t('hint.ai_helper_example') }}</p>
        </div>

        <div v-else class="chat-messages">
          <div
            v-for="(msg, index) in chatHistory"
            :key="index"
            class="chat-message"
            :class="msg.type"
          >
            <div class="message-avatar">{{ msg.type === 'user' ? '👤' : '🤖' }}</div>
            <div class="message-content">
              <p>{{ msg.content }}</p>
              <pre v-if="msg.data" class="message-data">{{ JSON.stringify(msg.data, null, 2) }}</pre>
            </div>
          </div>
        </div>
      </div>

      <div class="ai-input-container">
        <input
          v-model="userQuery"
          type="text"
          :placeholder="t('placeholder.ai_query')"
          @keyup.enter="handleSubmit"
          :disabled="aiLoading"
        />
        <button class="send-btn" :disabled="aiLoading" @click="handleSubmit">
          {{ aiLoading ? '...' : '🚀' }}
        </button>
      </div>

      <div class="ai-footer">
        <button class="footer-btn" @click="clearHistory">
          {{ t('button.clear_history') }}
        </button>
        <span class="ai-status">✅ {{ t('label.ai_available') }}</span>
      </div>
    </div>

    <div v-if="showPanel && !aiAvailable" class="ai-panel-container ai-unavailable">
      <div class="ai-unavailable-content">
        <p>❌ {{ t('label.ai_not_available') }}</p>
        <p class="hint">{{ t('hint.ai_not_available') }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-helper {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 1000;
}

.ai-toggle-btn {
  padding: 12px 20px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  border-radius: 50px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  transition: all 0.3s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-toggle-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
}

.ai-toggle-btn.active {
  border-radius: 12px 12px 0 0;
}

.ai-panel-container {
  position: absolute;
  bottom: 56px;
  right: 0;
  width: 420px;
  max-height: 500px;
  background: var(--bg-panel, white);
  border-radius: 12px 12px 0 0;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.ai-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
}

.ai-panel-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary, #1a1a2e);
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--text-secondary, #999);
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  color: var(--text-primary, #1a1a2e);
}

.ai-quick-commands {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
}

.quick-label {
  font-size: 12px;
  color: var(--text-secondary, #999);
  display: block;
  margin-bottom: 8px;
}

.quick-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.quick-btn {
  padding: 4px 10px;
  background: var(--bg-secondary, #f5f5f5);
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-secondary, #666);
  transition: all 0.2s;
}

.quick-btn:hover {
  background: #667eea;
  color: white;
}

.ai-chat-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  max-height: 280px;
}

.ai-empty-state {
  text-align: center;
  padding: 24px 0;
  color: var(--text-secondary, #999);
}

.ai-empty-state p {
  margin: 8px 0;
  font-size: 14px;
}

.ai-empty-state .example {
  font-size: 12px;
  color: #bbb;
}

.chat-messages {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-message {
  display: flex;
  gap: 10px;
}

.chat-message.user .message-avatar {
  background: #667eea;
}

.chat-message.ai .message-avatar {
  background: #10b981;
}

.message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.message-content {
  flex: 1;
  background: var(--bg-secondary, #f5f5f5);
  padding: 10px 12px;
  border-radius: 8px;
}

.message-content p {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-primary, #1a1a2e);
}

.message-data {
  margin-top: 8px;
  padding: 8px;
  background: var(--bg-panel, white);
  border-radius: 4px;
  font-size: 11px;
  overflow-x: auto;
  max-height: 120px;
  overflow-y: auto;
  color: var(--text-secondary, #666);
}

.ai-input-container {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color, #f0f0f0);
}

.ai-input-container input {
  flex: 1;
  padding: 10px 14px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  background: var(--bg-panel, white);
  color: var(--text-primary, #1a1a2e);
}

.ai-input-container input:focus {
  border-color: #667eea;
}

.send-btn {
  padding: 10px 16px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.send-btn:hover:not(:disabled) {
  background: #5a6fd6;
}

.send-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ai-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  border-top: 1px solid var(--border-color, #f0f0f0);
  font-size: 12px;
}

.footer-btn {
  background: none;
  border: none;
  color: var(--text-secondary, #999);
  cursor: pointer;
}

.footer-btn:hover {
  color: var(--text-primary, #1a1a2e);
}

.ai-status {
  color: #10b981;
}

.ai-unavailable {
  padding: 16px;
}

.ai-unavailable-content {
  text-align: center;
}

.ai-unavailable-content p {
  margin: 8px 0;
  color: var(--text-secondary, #999);
}

.ai-unavailable-content .hint {
  font-size: 12px;
}

@media (max-width: 480px) {
  .ai-panel-container {
    width: calc(100vw - 48px);
    max-height: 400px;
  }

  .ai-helper {
    bottom: 16px;
    right: 16px;
  }
}
</style>