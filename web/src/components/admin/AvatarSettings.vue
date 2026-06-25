<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useThemeStore } from '@/stores/theme';
import { usePermission } from '@/composables/usePermission';
import { useTranslation } from '@/i18n';
import { useGlobalToast } from '@/composables/useToast';
import { updateAvatar, uploadAvatar } from '@/api';

const props = defineProps<{
  accessToken: string;
}>();

const emit = defineEmits<{
  'avatar-updated': [url: string];
}>();

const t = useTranslation();
const themeStore = useThemeStore();
const { currentRole } = usePermission();
const { showToast } = useGlobalToast();
const isDark = computed(() => themeStore.isDark);

const userAvatar = ref('');
const avatarInput = ref('');
const useAvatarAsPopup = ref(0);
const isSaving = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const showAvatarModal = ref(false);

const roleIcon = computed(() => {
  switch (currentRole.value) {
    case 'admin':
      return '👑';
    case 'user':
      return '👤';
    case 'viewer':
      return '👁️';
    default:
      return '👤';
  }
});

watch(
  () => props.accessToken,
  (token) => {
    if (token) {
      loadUserAvatar();
    }
  },
  { immediate: true }
);

function closeAvatarModal() {
  showAvatarModal.value = false;
}

function triggerFileUpload() {
  if (fileInput.value) {
    fileInput.value.value = '';
  }
  fileInput.value?.click();
}

async function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    selectedFile.value = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      avatarInput.value = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }
}

async function loadUserAvatar() {
  try {
    const { getCurrentUser } = await import('@/api');
    const user = await getCurrentUser(props.accessToken);
    userAvatar.value = user.avatar_url || '';
    if (user.use_avatar_as_popup !== undefined) {
      useAvatarAsPopup.value = user.use_avatar_as_popup;
    }
    emit('avatar-updated', userAvatar.value);
  } catch {
    // ignore
  }
}

async function handleSaveAvatar() {
  isSaving.value = true;
  try {
    let newAvatarUrl = userAvatar.value;

    if (selectedFile.value) {
      const uploadResult = await uploadAvatar(props.accessToken, selectedFile.value);
      newAvatarUrl = uploadResult.avatar_url;
    } else if (avatarInput.value && avatarInput.value.startsWith('http')) {
      newAvatarUrl = avatarInput.value;
    } else if (avatarInput.value) {
      newAvatarUrl = avatarInput.value;
    }

    const updateResult = await updateAvatar(props.accessToken, {
      avatar_url: newAvatarUrl,
      use_avatar_as_popup: useAvatarAsPopup.value,
    });

    userAvatar.value = updateResult.avatar_url;
    useAvatarAsPopup.value = updateResult.use_avatar_as_popup;
    selectedFile.value = null;

    emit('avatar-updated', userAvatar.value);
    showToast(t('message.avatar_saved'), 'success');
    closeAvatarModal();
  } catch (_error) {
    showToast(t('message.save_failed'), 'error');
  } finally {
    isSaving.value = false;
  }
}

async function deleteAvatar() {
  isSaving.value = true;
  try {
    await updateAvatar(props.accessToken, {
      avatar_url: '',
      use_avatar_as_popup: useAvatarAsPopup.value,
    });

    userAvatar.value = '';
    avatarInput.value = '';
    selectedFile.value = null;

    emit('avatar-updated', '');
    showToast(t('message.avatar_deleted'), 'success');
  } catch (_error) {
    showToast(t('message.save_failed'), 'error');
  } finally {
    isSaving.value = false;
  }
}

function handleAvatarError() {
  userAvatar.value = '';
}

defineExpose({
  userAvatar,
  loadUserAvatar,
  closeAvatarModal,
});
</script>

<template>
  <!-- 头像设置弹窗 -->
  <Teleport to="body">
    <div v-if="showAvatarModal" class="modal-overlay" @click.self="closeAvatarModal">
      <div class="modal-content" :class="{ dark: isDark }">
        <div class="modal-header">
          <h3>{{ t('label.avatar_settings') }}</h3>
          <button class="modal-close" @click="closeAvatarModal">✕</button>
        </div>
        <div class="modal-body">
          <!-- 当前头像预览 -->
          <div class="avatar-preview-section">
            <div class="avatar-preview">
              <img v-if="avatarInput" :src="avatarInput" class="preview-image" />
              <span v-else class="preview-placeholder">{{ roleIcon }}</span>
            </div>
          </div>

          <!-- 文件上传 -->
          <div class="form-group">
            <label>{{ t('label.upload_avatar') }}</label>
            <div class="upload-area" :class="{ dark: isDark }" @click="triggerFileUpload">
              <input
                ref="fileInput"
                type="file"
                accept="image/*"
                class="file-input"
                @change="handleFileUpload"
              />
              <span class="upload-icon">📤</span>
              <span class="upload-text">{{ t('label.click_to_upload') }}</span>
              <span class="upload-hint">{{ t('hint.avatar_format') }}</span>
            </div>
          </div>

          <!-- 头像URL输入 -->
          <div class="form-group">
            <label>{{ t('label.avatar_url') }}</label>
            <input
              v-model="avatarInput"
              type="url"
              class="form-input"
              :class="{ dark: isDark }"
              :placeholder="t('placeholder.avatar_url')"
            />
          </div>

          <!-- 悬浮窗设置 -->
          <div class="form-group">
            <label class="checkbox-label">
              <input v-model="useAvatarAsPopup" type="checkbox" :true-value="1" :false-value="0" />
              <span>{{ t('label.use_avatar_as_popup') }}</span>
            </label>
          </div>

          <!-- 操作按钮 -->
          <div class="modal-actions">
            <button
              v-if="userAvatar"
              class="btn btn-danger"
              :class="{ dark: isDark }"
              @click="deleteAvatar"
            >
              {{ t('button.delete_avatar') }}
            </button>
            <button class="btn btn-secondary" :class="{ dark: isDark }" @click="closeAvatarModal">
              {{ t('button.cancel') }}
            </button>
            <button class="btn btn-primary" :disabled="isSaving" @click="handleSaveAvatar">
              {{ isSaving ? t('label.saving') : t('button.save') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 头像设置面板 -->
  <div class="settings-panel" :class="{ dark: isDark }">
    <h3>🖼️ {{ t('label.avatar_settings') }}</h3>
    <div class="settings-card">
      <!-- 当前头像预览 -->
      <div class="avatar-preview-section">
        <div class="avatar-preview">
          <img v-if="avatarInput" :src="avatarInput" class="preview-image" />
          <img
            v-else-if="userAvatar"
            :src="userAvatar"
            class="preview-image"
            @error="handleAvatarError"
          />
          <span v-else class="preview-placeholder">{{ roleIcon }}</span>
        </div>
      </div>

      <!-- 文件上传 -->
      <div class="form-group">
        <label>{{ t('label.upload_avatar') }}</label>
        <div class="upload-area" :class="{ dark: isDark }" @click="triggerFileUpload">
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            class="file-input"
            @change="handleFileUpload"
          />
          <span class="upload-icon">📤</span>
          <span class="upload-text">{{ t('label.click_to_upload') }}</span>
          <span class="upload-hint">{{ t('hint.avatar_format') }}</span>
        </div>
      </div>

      <!-- 头像URL输入 -->
      <div class="form-group">
        <label>{{ t('label.avatar_url') }}</label>
        <input
          v-model="avatarInput"
          type="url"
          class="form-input"
          :class="{ dark: isDark }"
          :placeholder="t('placeholder.avatar_url')"
        />
      </div>

      <!-- 悬浮窗设置 -->
      <div class="form-group">
        <label class="checkbox-label">
          <input v-model="useAvatarAsPopup" type="checkbox" :true-value="1" :false-value="0" />
          <span>{{ t('label.use_avatar_as_popup') }}</span>
        </label>
      </div>

      <!-- 操作按钮 -->
      <div
        style="
          display: flex;
          flex-direction: row;
          align-items: stretch;
          justify-content: space-between;
          gap: 12px;
          margin-top: 24px;
          width: 100%;
        "
      >
        <!-- 删除按钮 -->
        <button
          v-if="userAvatar"
          type="button"
          :style="{
            flex: '1',
            height: '48px !important',
            minHeight: '48px !important',
            maxHeight: '48px !important',
            padding: '0 24px !important',
            fontSize: '15px !important',
            fontWeight: '600 !important',
            display: 'flex !important',
            alignItems: 'center !important',
            justifyContent: 'center !important',
            borderRadius: '8px !important',
            border: 'none !important',
            cursor: 'pointer !important',
            boxSizing: 'border-box !important',
            lineHeight: '48px !important',
            background: '#ef4444 !important',
            color: 'white !important',
          }"
          :class="{ dark: isDark }"
          @click="deleteAvatar"
        >
          {{ t('button.delete_avatar') }}
        </button>
        <!-- 保存按钮 -->
        <button
          type="button"
          :disabled="isSaving"
          :style="{
            flex: '1',
            height: '48px !important',
            minHeight: '48px !important',
            maxHeight: '48px !important',
            padding: '0 24px !important',
            fontSize: '15px !important',
            fontWeight: '600 !important',
            display: 'flex !important',
            alignItems: 'center !important',
            justifyContent: 'center !important',
            borderRadius: '8px !important',
            border: 'none !important',
            cursor: isSaving ? 'not-allowed !important' : 'pointer !important',
            boxSizing: 'border-box !important',
            lineHeight: '48px !important',
            background: isSaving ? '#94a3b8 !important' : '#3b82f6 !important',
            color: 'white !important',
            opacity: isSaving ? '0.6 !important' : '1 !important',
          }"
          :class="{ dark: isDark }"
          @click="handleSaveAvatar"
        >
          {{ isSaving ? t('label.saving') : t('button.save') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ==================== 弹窗样式 ==================== */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  animation: fadeIn 0.2s ease;
}

.modal-content {
  background: var(--bg-panel, white);
  border-radius: 16px;
  width: 90%;
  max-width: 400px;
  overflow: hidden;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.modal-content.dark {
  background: var(--bg-panel, #2d2d2d);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
}

.modal-header h3 {
  font-size: 18px;
  color: var(--text-primary, #1a1a2e);
  margin: 0;
}

.modal-content.dark .modal-header h3 {
  color: var(--text-primary, #e0e0e0);
}

.modal-close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--text-secondary, #999);
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.2s;
}

.modal-close:hover {
  background: var(--bg-secondary, #f0f0f0);
}

.modal-content.dark .modal-close:hover {
  background: var(--bg-secondary, #3c3c3c);
}

.modal-body {
  padding: 24px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #1a1a2e);
  margin-bottom: 8px;
}

.modal-content.dark .form-group label {
  color: var(--text-primary, #e0e0e0);
}

.form-input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 14px;
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #333);
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: #667eea;
}

.form-input.dark {
  background: var(--bg-primary, #1e1e1e);
  color: var(--text-primary, #e0e0e0);
  border-color: var(--border-color, #3c3c3c);
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input[type='checkbox'] {
  width: 18px;
  height: 18px;
}

/* ==================== 头像预览样式 ==================== */
.avatar-preview-section {
  text-align: center;
  margin-bottom: 24px;
}

.avatar-preview {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: var(--bg-secondary, #f5f5f5);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.modal-content.dark .avatar-preview {
  background: var(--bg-secondary, #3c3c3c);
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-placeholder {
  font-size: 40px;
}

/* ==================== 文件上传区域样式 ==================== */
.upload-area {
  position: relative;
  border: 2px dashed var(--border-color, #e0e0e0);
  border-radius: 8px;
  padding: 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--bg-secondary, #fafafa);
}

.upload-area:hover {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.05);
}

.upload-area.dark {
  background: var(--bg-secondary, #3c3c3c);
  border-color: var(--border-color, #4c4c4c);
}

.upload-area.dark:hover {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.1);
}

.file-input {
  display: none;
}

.upload-icon {
  font-size: 32px;
  display: block;
  margin-bottom: 8px;
}

.upload-text {
  display: block;
  font-size: 14px;
  color: var(--text-primary, #333);
  margin-bottom: 4px;
}

.upload-area.dark .upload-text {
  color: var(--text-primary, #e0e0e0);
}

.upload-hint {
  display: block;
  font-size: 12px;
  color: var(--text-secondary, #999);
}

/* ==================== 设置面板样式 ==================== */
.settings-panel {
  padding: 24px;
}

.settings-panel h3 {
  font-size: 18px;
  color: var(--text-primary, #1a1a2e);
  margin: 0 0 20px 0;
}

.settings-panel.dark h3 {
  color: var(--text-primary, #e0e0e0);
}

.settings-card {
  background: var(--bg-primary, #ffffff);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 12px;
  padding: 24px;
}

.settings-panel.dark .settings-card {
  background: var(--bg-primary, #1e1e1e);
  border-color: var(--border-color, #333);
}

/* 头像设置样式 */
.settings-card .avatar-preview-section {
  margin-bottom: 20px;
}

.settings-card .avatar-preview {
  width: 128px;
  height: 128px;
  border-radius: 50%;
  background: var(--bg-primary, #ffffff);
  border: 2px solid var(--border-color, #e0e0e0);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.settings-card .avatar-preview.dark {
  background: var(--bg-dark-primary, #16162a);
  border-color: var(--border-dark-color, #333);
}

.settings-card .preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.settings-card .preview-placeholder {
  font-size: 48px;
}

.settings-card .upload-area {
  border: 2px dashed var(--border-color, #e0e0e0);
  border-radius: 8px;
  padding: 32px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--bg-primary, #ffffff);
}

.settings-card .upload-area:hover {
  border-color: var(--primary-color, #6366f1);
  background: var(--bg-hover, #f0f0ff);
}

.settings-card .upload-area.dark {
  background: var(--bg-dark-primary, #16162a);
  border-color: var(--border-dark-color, #333);
}

.settings-card .upload-area.dark:hover {
  border-color: var(--primary-color, #6366f1);
  background: var(--bg-dark-hover, #2a2a3e);
}

.settings-card .file-input {
  display: none;
}

.settings-card .upload-icon {
  font-size: 32px;
  display: block;
  margin-bottom: 8px;
}

.settings-card .upload-text {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #1a1a2e);
  margin-bottom: 4px;
}

.settings-card .upload-hint {
  display: block;
  font-size: 12px;
  color: var(--text-secondary, #666);
}

.settings-card .form-group {
  margin-bottom: 16px;
}

.settings-card .form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #1a1a2e);
}

.settings-card .form-group.dark label {
  color: var(--text-dark-primary, #ffffff);
}

.settings-card .form-input {
  width: 100%;
  max-width: 400px;
  padding: 10px 12px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 14px;
  background: var(--bg-primary, #ffffff);
  color: var(--text-primary, #1a1a2e);
}

.settings-card .form-input.dark {
  background: var(--bg-dark-primary, #16162a);
  border-color: var(--border-dark-color, #333);
  color: var(--text-dark-primary, #ffffff);
}

.settings-card .checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.settings-card .checkbox-label input[type='checkbox'] {
  width: 18px;
  height: 18px;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
