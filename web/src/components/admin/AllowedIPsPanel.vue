<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useThemeStore } from '@/stores/theme';
import { useTranslation } from '@/i18n';
import { useGlobalToast } from '@/composables/useToast';
import { getAllowedIPs, addAllowedIP, removeAllowedIP } from '@/api';

const props = defineProps<{
  accessToken: string;
}>();

const t = useTranslation();
const themeStore = useThemeStore();
const isDark = computed(() => themeStore.isDark);
const { showToast } = useGlobalToast();

const ips = ref<string[]>([]);
const newIP = ref('');
const loading = ref(false);
const adding = ref(false);

async function loadIPs() {
  loading.value = true;
  try {
    const result = await getAllowedIPs(props.accessToken);
    if (result.success) {
      ips.value = result.ips || [];
    }
  } catch (err) {
    console.error('Failed to load allowed IPs:', err);
  } finally {
    loading.value = false;
  }
}

async function handleAdd() {
  const ip = newIP.value.trim();
  if (!ip) return;

  adding.value = true;
  try {
    const result = await addAllowedIP(props.accessToken, ip);
    if (result.success) {
      ips.value = result.ips || [];
      newIP.value = '';
      showToast(t('msg.save_success'), 'success');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : t('msg.operation_failed');
    showToast(msg, 'error');
  } finally {
    adding.value = false;
  }
}

async function handleRemove(ip: string) {
  try {
    const result = await removeAllowedIP(props.accessToken, ip);
    if (result.success) {
      ips.value = result.ips || [];
      showToast(t('msg.delete_success') || '已删除', 'success');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : t('msg.operation_failed');
    showToast(msg, 'error');
  }
}

onMounted(() => {
  loadIPs();
});
</script>

<template>
  <div class="settings-panel" :class="{ dark: isDark }">
    <h3>🌐 {{ t('label.ip_whitelist') || 'IP 白名单' }}</h3>
    <div class="settings-card">
      <p class="hint">
        {{ t('hint.ip_whitelist') || '配置 IP 白名单后，仅白名单中的 IP 可以登录。留空则不限制。' }}
      </p>

      <div class="add-form">
        <input
          v-model="newIP"
          type="text"
          :placeholder="t('placeholder.enter_ip') || '输入 IP 地址，如 192.168.1.1'"
          class="ip-input"
          :class="{ dark: isDark }"
          @keyup.enter="handleAdd"
        />
        <button
          class="btn btn-sm btn-primary"
          :class="{ dark: isDark }"
          :disabled="adding || !newIP.trim()"
          @click="handleAdd"
        >
          {{ adding ? '...' : '+ ' + (t('button.add') || '添加') }}
        </button>
      </div>

      <div v-if="loading" class="loading-state">
        <span>{{ t('label.loading') }}...</span>
      </div>

      <div v-else-if="ips.length === 0" class="empty-state">
        <p>{{ t('label.no_ip_whitelist') || '未配置 IP 白名单（所有 IP 均可登录）' }}</p>
      </div>

      <div v-else class="ip-list">
        <div v-for="ip in ips" :key="ip" class="ip-item" :class="{ dark: isDark }">
          <span class="ip-address">{{ ip }}</span>
          <button class="btn btn-sm btn-danger" :class="{ dark: isDark }" @click="handleRemove(ip)">
            ✕
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-panel {
  padding: 0;
}

.settings-panel h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 16px;
}

.settings-card {
  background: var(--bg-secondary, #f8f9fa);
  border-radius: 8px;
  padding: 20px;
  transition: background 0.3s;
}

.hint {
  font-size: 13px;
  color: var(--text-secondary, #999);
  margin-bottom: 16px;
  line-height: 1.5;
}

.add-form {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.ip-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  background: var(--bg-panel, white);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: all 0.2s;
}

.ip-input:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
}

.ip-input.dark {
  background: var(--bg-panel, #2d2d2d);
  border-color: var(--border-color, #404040);
  color: var(--text-primary, #e0e0e0);
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 20px;
  color: var(--text-secondary, #999);
  font-size: 14px;
}

.ip-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ip-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--bg-panel, white);
  border: 1px solid var(--border-color, #e8e8e8);
  border-radius: 6px;
  transition: all 0.2s;
}

.ip-item.dark {
  background: var(--bg-panel, #2d2d2d);
  border-color: var(--border-color, #404040);
}

.ip-item:hover {
  border-color: #667eea;
}

.ip-address {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 14px;
  color: var(--text-primary);
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-danger {
  background: transparent;
  color: #ff4d4f;
  border: 1px solid #ff4d4f;
  min-width: 32px;
}

.btn-danger:hover {
  background: #ff4d4f;
  color: white;
}
</style>
