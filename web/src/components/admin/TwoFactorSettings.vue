<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useTranslation } from '@/i18n';
import { useGlobalToast } from '@/composables/useToast';

const t = useTranslation();
const { showToast } = useGlobalToast();

const props = defineProps<{
  token: string;
}>();

const isEnabled = ref(false);
const isLoading = ref(true);
const isSettingUp = ref(false);
const setupSecret = ref('');
const setupQRCode = ref('');
const setupOtpauthUrl = ref('');
const verifyCode = ref('');
const disableCode = ref('');
const showSetup = ref(false);
const showDisable = ref(false);

onMounted(async () => {
  await loadStatus();
});

async function loadStatus() {
  try {
    const { get2FAStatus } = await import('@/api');
    const status = await get2FAStatus(props.token);
    isEnabled.value = status.enabled;
    isLoading.value = false;
  } catch {
    showToast(t('twofa.loading_failed'), 'error');
    isLoading.value = false;
  }
}

async function startSetup() {
  isSettingUp.value = true;
  try {
    const { setup2FA } = await import('@/api');
    const result = await setup2FA(props.token);
    setupSecret.value = result.secret;
    setupQRCode.value = result.qrCode;
    setupOtpauthUrl.value = result.otpauthUrl;
    showSetup.value = true;
  } catch {
    showToast(t('twofa.setup_failed'), 'error');
  } finally {
    isSettingUp.value = false;
  }
}

async function confirmSetup() {
  if (!verifyCode.value || verifyCode.value.length !== 6) {
    showToast(t('twofa.enter_code'), 'error');
    return;
  }

  try {
    const { verify2FASetup } = await import('@/api');
    await verify2FASetup(props.token, verifyCode.value);
    showToast(t('twofa.enabled_success'), 'success');
    isEnabled.value = true;
    showSetup.value = false;
    verifyCode.value = '';
    setupSecret.value = '';
    setupQRCode.value = '';
    setupOtpauthUrl.value = '';
  } catch {
    showToast(t('twofa.invalid_code'), 'error');
  }
}

async function confirmDisable() {
  if (!disableCode.value || disableCode.value.length !== 6) {
    showToast(t('twofa.enter_code'), 'error');
    return;
  }

  try {
    const { disable2FA } = await import('@/api');
    await disable2FA(props.token, disableCode.value);
    showToast(t('twofa.disabled_success'), 'success');
    isEnabled.value = false;
    showDisable.value = false;
    disableCode.value = '';
  } catch {
    showToast(t('twofa.invalid_code'), 'error');
  }
}

function copySecret() {
  navigator.clipboard
    .writeText(setupSecret.value)
    .then(() => {
      showToast(t('label.copied') || '已复制到剪贴板', 'success');
    })
    .catch(() => {
      showToast(t('message.copy_failed') || '复制失败', 'error');
    });
}

function cancelSetup() {
  showSetup.value = false;
  verifyCode.value = '';
  setupSecret.value = '';
  setupQRCode.value = '';
  setupOtpauthUrl.value = '';
}
</script>

<template>
  <div class="twofa-settings">
    <div class="twofa-header">
      <h3>🔐 {{ t('twofa.title') }}</h3>
      <span class="twofa-status" :class="{ enabled: isEnabled }">
        {{ isEnabled ? t('twofa.status_enabled') : t('twofa.status_disabled') }}
      </span>
    </div>

    <div v-if="isLoading" class="twofa-loading">{{ t('label.loading') }}</div>

    <div v-else-if="!isEnabled && !showSetup" class="twofa-content">
      <p class="twofa-desc">{{ t('twofa.step1_desc') }}</p>
      <button class="btn btn-primary" @click="startSetup" :disabled="isSettingUp">
        {{ isSettingUp ? t('label.loading') : t('twofa.enable') }}
      </button>
    </div>

    <!-- 设置流程 -->
    <div v-if="showSetup" class="twofa-setup">
      <div class="twofa-steps">
        <div class="step">
          <div class="step-num">1</div>
          <div class="step-content">
            <strong>{{ t('twofa.step1_title') }}</strong>
            <p>{{ t('twofa.step1_desc') }}</p>
          </div>
        </div>
        <div class="step">
          <div class="step-num">2</div>
          <div class="step-content">
            <strong>{{ t('twofa.step2_title') }}</strong>
            <p>{{ t('twofa.step2_desc') }}</p>
            <div v-if="setupQRCode" class="qr-code">
              <img :src="setupQRCode" alt="TOTP QR Code" />
            </div>
            <div class="secret-display">
              <span class="secret-label">{{ t('twofa.secret_label') }}</span>
              <code class="secret-value">{{ setupSecret }}</code>
              <button class="btn-copy" @click="copySecret">{{ t('twofa.copy') }}</button>
            </div>
          </div>
        </div>
        <div class="step">
          <div class="step-num">3</div>
          <div class="step-content">
            <strong>{{ t('twofa.step3_title') }}</strong>
            <p>{{ t('twofa.step3_desc') }}</p>
            <div class="verify-input">
              <input
                v-model="verifyCode"
                type="text"
                :placeholder="t('twofa.enter_code')"
                maxlength="6"
                autocomplete="one-time-code"
                class="code-input"
              />
              <button
                class="btn btn-primary"
                @click="confirmSetup"
                :disabled="verifyCode.length !== 6"
              >
                {{ t('twofa.verify_and_enable') }}
              </button>
            </div>
          </div>
        </div>
      </div>
      <button class="btn btn-secondary" @click="cancelSetup">{{ t('twofa.cancel') }}</button>
    </div>

    <!-- 已启用状态 -->
    <div v-if="isEnabled && !showDisable" class="twofa-content">
      <p class="twofa-desc enabled-text">{{ t('twofa.enabled_desc') }}</p>
      <button class="btn btn-danger" @click="showDisable = true">{{ t('twofa.disable') }}</button>
    </div>

    <!-- 禁用流程 -->
    <div v-if="showDisable" class="twofa-disable">
      <p class="twofa-desc">{{ t('twofa.disable_desc') }}</p>
      <div class="verify-input">
        <input
          v-model="disableCode"
          type="text"
          :placeholder="t('twofa.enter_code')"
          maxlength="6"
          autocomplete="one-time-code"
          class="code-input"
        />
        <button class="btn btn-danger" @click="confirmDisable" :disabled="disableCode.length !== 6">
          {{ t('twofa.confirm_disable') }}
        </button>
      </div>
      <button
        class="btn btn-secondary"
        @click="
          showDisable = false;
          disableCode = '';
        "
      >
        {{ t('twofa.cancel') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.twofa-settings {
  background: var(--bg-panel, white);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.twofa-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.twofa-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary, #1a1a2e);
}

.twofa-status {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 12px;
  background: #f0f0f0;
  color: var(--text-secondary, #666);
}

.twofa-status.enabled {
  background: #d4edda;
  color: #155724;
}

.twofa-loading {
  text-align: center;
  padding: 20px;
  color: var(--text-secondary, #999);
}

.twofa-desc {
  color: var(--text-secondary, #666);
  font-size: 14px;
  margin-bottom: 16px;
  line-height: 1.6;
}

.twofa-desc.enabled-text {
  color: #155724;
}

.twofa-content {
  padding: 8px 0;
}

.twofa-setup {
  padding: 8px 0;
}

.twofa-steps {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-bottom: 16px;
}

.step {
  display: flex;
  gap: 12px;
}

.step-num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #667eea;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.step-content {
  flex: 1;
}

.step-content strong {
  display: block;
  font-size: 14px;
  color: var(--text-primary, #1a1a2e);
  margin-bottom: 4px;
}

.step-content p {
  font-size: 13px;
  color: var(--text-secondary, #666);
  margin: 0;
  line-height: 1.5;
}

.qr-code {
  margin: 12px 0;
  text-align: center;
  display: flex;
  justify-content: center;
  align-items: center;
}

.qr-code img {
  width: 180px;
  height: 180px;
  object-fit: contain;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  background: white;
}

.secret-display {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
  padding: 8px 12px;
  background: var(--bg-secondary, #f8f9fa);
  border-radius: 6px;
}

.secret-label {
  font-size: 12px;
  color: var(--text-secondary, #999);
}

.secret-value {
  font-family: monospace;
  font-size: 14px;
  color: var(--text-primary, #333);
  flex: 1;
  word-break: break-all;
}

.btn-copy {
  background: var(--bg-secondary, #f0f0f0);
  border: none;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-primary, #333);
}

.btn-copy:hover {
  background: var(--border-color, #e0e0e0);
}

.verify-input {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
}

.code-input {
  width: 140px;
  padding: 10px 14px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 16px;
  font-family: monospace;
  letter-spacing: 4px;
  text-align: center;
}

.code-input:focus {
  outline: none;
  border-color: #667eea;
}

.twofa-disable {
  padding: 8px 0;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
}

.btn-secondary {
  background: var(--bg-secondary, #f0f0f0);
  color: var(--text-primary, #333);
  margin-top: 12px;
}

.btn-secondary:hover {
  background: var(--border-color, #e0e0e0);
}

.btn-danger {
  background: #e74c3c;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #c0392b;
}
</style>
