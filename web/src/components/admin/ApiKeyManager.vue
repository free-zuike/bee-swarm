<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useTranslation } from '@/i18n';
import { useThemeStore } from '@/stores/theme';
import { useGlobalToast } from '@/composables/useToast';

const t = useTranslation();
const { showToast } = useGlobalToast();
const themeStore = useThemeStore();
const isDark = computed(() => themeStore.isDark);

const props = defineProps<{
  accessToken: string;
}>();

interface ApiKeyItem {
  id: string;
  name: string;
  last4: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

const keys = ref<ApiKeyItem[]>([]);
const loading = ref(true);
const creating = ref(false);
const newKeyResult = ref<{ key: string; name: string; expiresAt: string | null } | null>(null);
const showCreateForm = ref(false);
const newName = ref('');
const newExpiry = ref<number | null>(null);

const expiryOptions = [
  { label: '永不过期', value: null },
  { label: '7 天', value: 7 },
  { label: '30 天', value: 30 },
  { label: '90 天', value: 90 },
];

async function loadKeys() {
  loading.value = true;
  try {
    const { getApiKeys } = await import('@/api');
    const result = await getApiKeys(props.accessToken);
    if (result.success) {
      keys.value = result.keys;
    }
  } catch {
    showToast('加载失败', 'error');
  } finally {
    loading.value = false;
  }
}

async function handleCreate() {
  creating.value = true;
  newKeyResult.value = null;
  try {
    const { createApiKey } = await import('@/api');
    const result = await createApiKey(props.accessToken, newName.value || 'default', newExpiry.value ?? undefined);
    if (result.success) {
      newKeyResult.value = { key: result.key, name: result.name, expiresAt: result.expiresAt };
      showToast(result.message, 'success');
      await loadKeys();
    }
  } catch {
    showToast('创建失败', 'error');
  } finally {
    creating.value = false;
  }
}

async function handleDelete(id: string) {
  try {
    const { deleteApiKey } = await import('@/api');
    const result = await deleteApiKey(props.accessToken, id);
    if (result.success) {
      showToast('已删除', 'success');
      if (newKeyResult.value?.key) {
        newKeyResult.value = null;
      }
      await loadKeys();
    }
  } catch {
    showToast('删除失败', 'error');
  }
}

function copyKey(key: string) {
  navigator.clipboard.writeText(key).then(() => {
    showToast('已复制到剪贴板', 'success');
  });
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

onMounted(loadKeys);
</script>

<template>
  <div class="api-key-manager">
    <h3>🔑 API Key 管理</h3>
    <p class="hint">创建多个 API Key 用于不同场景（MCP、脚本、CI/CD 等），每个可独立设置有效期。</p>

    <!-- 新建 Key 表单 -->
    <div class="settings-card">
      <button v-if="!showCreateForm" class="btn btn-primary" :class="{ dark: isDark }" @click="showCreateForm = true">
        ➕ 创建 API Key
      </button>
      <div v-else class="create-form">
        <div class="form-row">
          <label>名称</label>
          <input v-model="newName" type="text" placeholder="例如: MCP、脚本、测试" class="input-sm" :class="{ dark: isDark }" />
        </div>
        <div class="form-row">
          <label>有效期</label>
          <div class="expiry-options">
            <button
              v-for="opt in expiryOptions"
              :key="opt.value ?? 'never'"
              class="btn btn-sm"
              :class="{ 'btn-primary': newExpiry === opt.value, 'btn-secondary': newExpiry !== opt.value, dark: isDark }"
              @click="newExpiry = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-sm btn-primary" :class="{ dark: isDark, loading: creating }" @click="handleCreate" :disabled="creating">
            {{ creating ? '创建中...' : '确认创建' }}
          </button>
          <button class="btn btn-sm btn-secondary" :class="{ dark: isDark }" @click="showCreateForm = false; newKeyResult = null">
            取消
          </button>
        </div>
      </div>
    </div>

    <!-- 新 Key 展示 -->
    <div v-if="newKeyResult" class="settings-card new-key-card">
      <h4>🆕 新创建的 API Key</h4>
      <p class="hint">请立即复制保存，关闭后将无法再次查看完整 Key。</p>
      <div class="new-key-display">
        <code :class="{ dark: isDark }" class="key-value">{{ newKeyResult.key }}</code>
        <button class="btn btn-sm btn-primary" :class="{ dark: isDark }" @click="copyKey(newKeyResult.key)">📋 复制</button>
      </div>
      <div class="key-meta">
        <span>名称: {{ newKeyResult.name }}</span>
        <span>过期: {{ newKeyResult.expiresAt ? formatTime(newKeyResult.expiresAt) : '永不过期' }}</span>
      </div>
    </div>

    <!-- Key 列表 -->
    <div class="settings-card">
      <h4>已创建的 Key ({{ keys.length }})</h4>
      <div v-if="loading" class="loading-text">{{ t('label.loading') }}</div>
      <div v-else-if="keys.length === 0" class="empty-text">暂无 API Key</div>
      <div v-else class="key-list">
        <div v-for="k in keys" :key="k.id" class="key-item" :class="{ dark: isDark, expired: isExpired(k.expiresAt) }">
          <div class="key-info">
            <span class="key-name">{{ k.name }}</span>
            <span class="key-last4">...{{ k.last4 }}</span>
            <span class="key-expiry" :class="{ expired: isExpired(k.expiresAt) }">
              {{ k.expiresAt ? (isExpired(k.expiresAt) ? '已过期' : formatTime(k.expiresAt)) : '永不过期' }}
            </span>
            <span class="key-used" v-if="k.lastUsedAt">上次使用: {{ formatTime(k.lastUsedAt) }}</span>
          </div>
          <button class="btn btn-sm btn-danger" :class="{ dark: isDark }" @click="handleDelete(k.id)">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.api-key-manager h3 {
  font-size: 18px;
  margin-bottom: 8px;
}

.hint {
  font-size: 13px;
  color: #666;
  margin-bottom: 16px;
  line-height: 1.5;
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

.create-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.form-row label {
  font-size: 13px;
  color: #555;
  min-width: 60px;
}

.input-sm {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
}

.input-sm.dark {
  background: #2a2a2a;
  border-color: #3c3c3c;
  color: #e0e0e0;
}

.expiry-options {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.new-key-card {
  border-color: #34a853;
  background: #e6f4ea;
}

.mcp-panel.dark .new-key-card {
  background: #1a3a2a;
  border-color: #34a853;
}

.new-key-display {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
}

.key-value {
  flex: 1;
  padding: 10px 14px;
  background: #fff;
  border: 1px solid #34a853;
  border-radius: 6px;
  font-size: 14px;
  word-break: break-all;
  font-family: monospace;
}

.key-value.dark {
  background: #2d2d2d;
  color: #e0e0e0;
}

.key-meta {
  display: flex;
  gap: 20px;
  font-size: 12px;
  color: #666;
}

.key-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.key-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #fafafa;
}

.key-item.dark {
  border-color: #3c3c3c;
  background: #1e1e1e;
}

.key-item.expired {
  opacity: 0.5;
}

.key-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.key-name {
  font-weight: 600;
  font-size: 14px;
  color: #333;
}

.key-item.dark .key-name {
  color: #e0e0e0;
}

.key-last4 {
  font-family: monospace;
  font-size: 13px;
  color: #888;
}

.key-expiry {
  font-size: 12px;
  color: #34a853;
  padding: 2px 8px;
  background: #e6f4ea;
  border-radius: 4px;
}

.key-expiry.expired {
  color: #d93025;
  background: #fce8e6;
}

.key-item.dark .key-expiry {
  background: #1a3a2a;
}

.key-item.dark .key-expiry.expired {
  background: #3a1a1a;
}

.key-used {
  font-size: 11px;
  color: #999;
}

.loading-text,
.empty-text {
  text-align: center;
  padding: 20px;
  color: #888;
  font-size: 13px;
}

.btn {
  cursor: pointer;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  padding: 8px 16px;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

.btn-primary {
  background: #6366f1;
  color: #fff;
}

.btn-primary:hover { background: #5a5fe6; }
.btn-secondary { background: #f0f0f0; color: #333; }
.btn-secondary.dark { background: #3c3c3c; color: #e0e0e0; }
.btn-secondary:hover { background: #e0e0e0; }
.btn-danger { background: #d93025; color: #fff; }
.btn-danger:hover { background: #c5221f; }
.loading { opacity: 0.7; pointer-events: none; }
</style>