<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { useThemeStore } from '@/stores/theme';
import { useTranslation } from '@/i18n';
import { useGlobalToast } from '@/composables/useToast';
import { getSystemSettings, saveSystemSettings } from '@/api';
import type { SystemSettings } from '@/api';

const props = defineProps<{
  accessToken: string;
}>();

const emit = defineEmits<{
  (e: 'save-success'): void;
  (e: 'save-error', error: string): void;
  (e: 'update', settings: SystemSettings): void;
}>();

const t = useTranslation();
const themeStore = useThemeStore();
const isDark = computed(() => themeStore.isDark);
const { showToast } = useGlobalToast();

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}

const systemSettings = reactive<SystemSettings>({
  turnstile_enabled: false,
  turnstile_site_key: '',
  turnstile_secret_key: '',
  cleanup_enabled: true,
  cleanup_push_history_days: 30,
  cleanup_audit_log_days: 90,
  cleanup_batch_size: 100,
  cors_allowed_origins: [],
  smtp_host: '',
  smtp_port: '',
  smtp_username: '',
  smtp_password: '',
  mail_from: '',
});

const newCORSOrigin = ref('');
const isSavingSystemSettings = ref(false);

async function loadSystemSettings() {
  try {
    const result = await getSystemSettings(props.accessToken);
    if (result.success) {
      Object.assign(systemSettings, {
        turnstile_enabled: result.settings.turnstile_enabled ?? false,
        turnstile_site_key: result.settings.turnstile_site_key ?? '',
        turnstile_secret_key: result.settings.turnstile_secret_key ?? '',
        cleanup_enabled: result.settings.cleanup_enabled ?? true,
        cleanup_push_history_days: result.settings.cleanup_push_history_days ?? 30,
        cleanup_audit_log_days: result.settings.cleanup_audit_log_days ?? 90,
        cleanup_batch_size: result.settings.cleanup_batch_size ?? 100,
        cors_allowed_origins: result.settings.cors_allowed_origins ?? [],
        smtp_host: result.settings.smtp_host ?? '',
        smtp_port: result.settings.smtp_port ?? '',
        smtp_username: result.settings.smtp_username ?? '',
        smtp_password: result.settings.smtp_password ?? '',
        mail_from: result.settings.mail_from ?? '',
      });
      emit('update', { ...systemSettings });
    }
  } catch {
    // ignore
  }
}

async function handleSaveSystemSettings() {
  if (isSavingSystemSettings.value) return;
  isSavingSystemSettings.value = true;
  try {
    await saveSystemSettings(props.accessToken, systemSettings);
    showToast(t('msg.system_settings_saved'), 'success');
    emit('save-success');
    emit('update', { ...systemSettings });
  } catch (err) {
    const msg = getErrorMessage(err, t('msg.save_system_settings_failed'));
    showToast(msg, 'error');
    emit('save-error', msg);
  } finally {
    isSavingSystemSettings.value = false;
  }
}

function addCORSOrigin() {
  const origin = newCORSOrigin.value.trim();
  if (!origin) {
    showToast(t('msg.invalid_origin'), 'error');
    return;
  }
  if (systemSettings.cors_allowed_origins?.includes(origin)) {
    showToast(t('msg.origin_exists'), 'error');
    return;
  }
  systemSettings.cors_allowed_origins?.push(origin);
  newCORSOrigin.value = '';
}

function removeCORSOrigin(index: number) {
  systemSettings.cors_allowed_origins?.splice(index, 1);
}

onMounted(() => {
  loadSystemSettings();
});
</script>

<template>
  <div class="settings-panel" :class="{ dark: isDark }">
    <h3>⚙️ {{ t('label.system_settings') }}</h3>

    <!-- Turnstile 人机验证设置 -->
    <div class="settings-card">
      <h4>{{ t('label.turnstile') }}</h4>
      <div class="setting-item">
        <label>{{ t('label.turnstile_enabled') }}</label>
        <label class="toggle">
          <input type="checkbox" v-model="systemSettings.turnstile_enabled" />
          <span class="slider"></span>
        </label>
      </div>
      <div class="setting-item" v-if="systemSettings.turnstile_enabled">
        <label>{{ t('label.turnstile_site_key') }}</label>
        <input
          type="text"
          v-model="systemSettings.turnstile_site_key"
          :placeholder="t('placeholder.turnstile_site_key')"
          class="input-sm"
        />
      </div>
      <div class="setting-item" v-if="systemSettings.turnstile_enabled">
        <label>{{ t('label.turnstile_secret_key') }}</label>
        <input
          type="password"
          v-model="systemSettings.turnstile_secret_key"
          :placeholder="t('placeholder.turnstile_secret_key')"
          class="input-sm"
        />
      </div>
      <div class="setting-hint" v-if="systemSettings.turnstile_enabled">
        {{ t('hint.turnstile') }}
      </div>
    </div>

    <!-- 自动清理设置 -->
    <div class="settings-card">
      <h4>🧹 {{ t('label.auto_cleanup') }}</h4>
      <div class="setting-item">
        <label>{{ t('label.cleanup_enabled') }}</label>
        <label class="toggle">
          <input type="checkbox" v-model="systemSettings.cleanup_enabled" />
          <span class="slider"></span>
        </label>
      </div>
      <div class="setting-item" v-if="systemSettings.cleanup_enabled">
        <label>{{ t('label.cleanup_push_history_days') }}</label>
        <input
          type="number"
          v-model.number="systemSettings.cleanup_push_history_days"
          min="1"
          max="365"
          class="input-sm"
        />
      </div>
      <div class="setting-item" v-if="systemSettings.cleanup_enabled">
        <label>{{ t('label.cleanup_audit_log_days') }}</label>
        <input
          type="number"
          v-model.number="systemSettings.cleanup_audit_log_days"
          min="1"
          max="365"
          class="input-sm"
        />
      </div>
      <div class="setting-hint" v-if="systemSettings.cleanup_enabled">
        {{ t('hint.auto_cleanup') }}
      </div>
    </div>

    <!-- CORS 配置 -->
    <div class="settings-card">
      <h4>🔒 {{ t('label.cors_settings') }}</h4>
      <div class="setting-item">
        <label>{{ t('label.cors_allowed_origins') }}</label>
        <div class="cors-list">
          <div
            v-for="(origin, index) in systemSettings.cors_allowed_origins"
            :key="index"
            class="cors-item"
          >
            <span>{{ origin }}</span>
            <button class="btn btn-sm btn-danger" @click="removeCORSOrigin(index)">×</button>
          </div>
          <div v-if="systemSettings.cors_allowed_origins?.length === 0" class="empty-state">
            {{ t('msg.no_cors_origins') }}
          </div>
        </div>
      </div>
      <div class="setting-item">
        <label>{{ t('label.add_origin') }}</label>
        <div class="input-group">
          <input
            type="text"
            v-model="newCORSOrigin"
            placeholder="https://example.com"
            @keyup.enter="addCORSOrigin"
          />
          <button class="btn btn-sm btn-primary" @click="addCORSOrigin">
            {{ t('label.add') }}
          </button>
        </div>
      </div>
      <div class="setting-hint">
        {{ t('hint.cors') }}
      </div>
    </div>

    <!-- 邮件 SMTP 设置 -->
    <div class="settings-card">
      <h4>📧 {{ t('smtp.title') }}</h4>
      <div class="setting-hint" style="margin-bottom: 16px">
        {{ t('smtp.hint') }}
      </div>

      <div class="setting-item">
        <label>{{ t('smtp.host') }}</label>
        <input v-model="systemSettings.smtp_host" type="text" placeholder="smtp.qq.com" />
      </div>

      <div class="setting-item">
        <label>{{ t('smtp.port') }}</label>
        <input v-model="systemSettings.smtp_port" type="text" placeholder="587" />
      </div>

      <div class="setting-item">
        <label>{{ t('smtp.username') }}</label>
        <input v-model="systemSettings.smtp_username" type="text" placeholder="your-email@qq.com" />
      </div>

      <div class="setting-item">
        <label>{{ t('smtp.password') }}</label>
        <input
          v-model="systemSettings.smtp_password"
          type="password"
          :placeholder="t('smtp.password_placeholder')"
        />
      </div>

      <div class="setting-item">
        <label>{{ t('smtp.from') }}</label>
        <input
          v-model="systemSettings.mail_from"
          type="email"
          placeholder="noreply@your-domain.com"
        />
      </div>

      <div class="setting-hint">
        <strong>{{ t('smtp.config_guide') }}</strong
        ><br />
        {{ t('smtp.qq') }}<br />
        {{ t('smtp.163') }}<br />
        {{ t('smtp.gmail') }}<br />
        {{ t('smtp.outlook') }}
      </div>
    </div>

    <button
      class="btn btn-primary"
      @click="handleSaveSystemSettings"
      :disabled="isSavingSystemSettings"
    >
      {{ isSavingSystemSettings ? t('msg.saving_dots') : t('button.save_settings') }}
    </button>
  </div>
</template>

<style scoped>
.settings-panel {
  animation: fadeIn 0.2s ease;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 12px;
  padding: 16px;
  min-height: fit-content;
}

.settings-panel.dark {
  background: var(--bg-dark-secondary, #1e1e2e);
}

.settings-card {
  background: var(--bg-panel, #ffffff);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border-color, #e8e8e8);
  margin-bottom: 16px;
}

.settings-card:last-of-type {
  margin-bottom: 16px;
}

.settings-panel.dark .settings-card {
  background: var(--bg-panel, #2d2d2d);
}

.settings-panel h3 {
  margin: 0 0 20px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
}

.settings-panel.dark h3 {
  color: var(--text-dark-primary, #ffffff);
}

.settings-card h4 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
  margin-bottom: 16px;
}

.settings-panel.dark .settings-card h4 {
  color: var(--text-dark-primary, #ffffff);
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0;
  border-bottom: 1px solid var(--border-color, #e8e8e8);
  gap: 20px;
}

.setting-item:last-of-type {
  border-bottom: none;
}

.setting-item label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #1a1a2e);
  flex-shrink: 0;
}

.setting-item .toggle {
  margin-left: auto;
}

.setting-item .input-sm,
.setting-item input {
  flex: 1;
  max-width: 320px;
  padding: 10px 14px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 14px;
  background: var(--bg-primary, #ffffff);
  color: var(--text-primary, #1a1a2e);
  transition: all 0.2s;
}

.setting-item .input-sm:focus,
.setting-item input:focus {
  outline: none;
  border-color: var(--primary-color, #6366f1);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.settings-panel.dark .setting-item label {
  color: var(--text-dark-primary, #ffffff);
}

.settings-panel.dark .setting-item .input-sm,
.settings-panel.dark .setting-item input {
  background: var(--bg-dark-primary, #16162a);
  border-color: var(--border-dark-color, #333);
  color: var(--text-dark-primary, #ffffff);
}

.settings-panel.dark .setting-item input::placeholder {
  color: var(--text-dark-secondary, #666);
}

.setting-hint {
  font-size: 12px;
  color: var(--text-secondary, #666);
  padding: 12px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 8px;
  margin-top: 12px;
}

.settings-panel.dark .setting-hint {
  background: var(--bg-dark-secondary, #1e1e2e);
  color: var(--text-dark-secondary, #999);
}

.setting-item .toggle {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
}

.setting-item .toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.setting-item .toggle .slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: 0.3s;
  border-radius: 26px;
}

.setting-item .toggle .slider:before {
  position: absolute;
  content: '';
  height: 20px;
  width: 20px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
}

.setting-item .toggle input:checked + .slider {
  background: linear-gradient(135deg, #667eea, #764ba2);
}

.setting-item .toggle input:checked + .slider:before {
  transform: translateX(22px);
}

.cors-list {
  max-height: 160px;
  overflow-y: auto;
  padding: 8px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 8px;
  border: 1px solid var(--border-color, #e0e0e0);
}

.settings-panel.dark .cors-list {
  background: var(--bg-secondary, #3c3c3c);
  border-color: var(--border-color, #4c4c4c);
}

.cors-list::-webkit-scrollbar {
  width: 6px;
}

.cors-list::-webkit-scrollbar-track {
  background: transparent;
}

.cors-list::-webkit-scrollbar-thumb {
  background: var(--border-color, #ccc);
  border-radius: 3px;
}

.cors-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--bg-panel, white);
  border-radius: 6px;
  margin-bottom: 6px;
  border: 1px solid var(--border-color, #e0e0e0);
}

.settings-panel.dark .cors-item {
  background: var(--bg-panel, #2d2d2d);
  border-color: var(--border-color, #3c3c3c);
}

.cors-item:last-child {
  margin-bottom: 0;
}

.cors-item span {
  font-size: 13px;
  color: var(--text-primary, #1a1a2e);
  word-break: break-all;
  flex: 1;
}

.settings-panel.dark .cors-item span {
  color: var(--text-primary, #e0e0e0);
}

.cors-item .btn-danger {
  margin-left: 8px;
  padding: 4px 8px;
  font-size: 14px;
  line-height: 1;
}

.empty-state {
  text-align: center;
  padding: 16px;
  color: var(--text-secondary, #999);
  font-size: 13px;
}

.input-group {
  display: flex;
  gap: 8px;
}

.input-group input {
  flex: 1;
  padding: 10px 14px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  background: var(--bg-panel, white);
  color: var(--text-primary, #1a1a2e);
}

.settings-panel.dark .input-group input {
  background: var(--bg-panel, #2d2d2d);
  border-color: var(--border-color, #4c4c4c);
  color: var(--text-primary, #e0e0e0);
}

.input-group input:focus {
  border-color: #667eea;
}

.input-group .btn-sm {
  padding: 10px 16px;
  font-size: 14px;
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
  line-height: 20px;
}

.btn-sm {
  padding: 8px 18px;
  font-size: 13px;
  height: 36px;
  line-height: 20px;
  box-sizing: border-box;
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

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-danger:hover {
  background: #dc2626;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
