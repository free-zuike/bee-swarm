<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { t } from '@/i18n';
import type { BackupEndpoint } from '@/api';

const props = defineProps<{
  accessToken: string;
}>();

const emit = defineEmits<{
  'load-endpoints': [];
  'add-endpoint': [endpoint: Omit<BackupEndpoint, 'id'>];
  'update-endpoint': [id: string, endpoint: Omit<BackupEndpoint, 'id'>];
  'delete-endpoint': [id: string];
  'test-endpoint': [id: string | null, endpoint: Partial<BackupEndpoint>];
  'list-backups': [id: string];
  'restore-backup': [id: string, key: string];
  'delete-backup': [id: string, key: string];
  'backup-all': [];
  'backup-single': [id: string];
}>();

const backupEndpoints = ref<BackupEndpoint[]>([]);
const selectedEndpointId = ref<string | null>(null);
const isLoadingEndpoints = ref(false);
const isSavingEndpoint = ref(false);
const isTestingEndpoint = ref(false);
const isDeletingEndpoint = ref(false);
const isBackingUpAll = ref(false);
const isBackingUpSingle = ref(false);
const endpointMessage = ref<{ text: string; type: 'success' | 'error' } | null>(null);

const endpointBackups = ref<Array<{ key: string; size: number; lastModified: string }>>([]);
const isLoadingEndpointBackups = ref(false);

const editingEndpoint = reactive<Partial<BackupEndpoint>>({
  name: '',
  type: 's3',
  enabled: true,
  config: {},
  schedule: {
    enabled: false,
    interval: 24,
    startTime: '02:00',
    timezone: 'Asia/Shanghai'
  },
  retention: 30
});

const isCreatingNew = ref(false);

const selectedEndpoint = computed(() => {
  if (isCreatingNew.value) return null;
  return backupEndpoints.value.find(e => e.id === selectedEndpointId.value) || null;
});

function loadBackupEndpoints() {
  isLoadingEndpoints.value = true;
  emit('load-endpoints');
}

function setEndpoints(endpoints: BackupEndpoint[]) {
  backupEndpoints.value = endpoints || [];
  if (selectedEndpointId.value && !backupEndpoints.value.find(e => e.id === selectedEndpointId.value)) {
    selectedEndpointId.value = backupEndpoints.value.length > 0 ? backupEndpoints.value[0].id : null;
  }
  if (!selectedEndpointId.value && backupEndpoints.value.length > 0) {
    selectedEndpointId.value = backupEndpoints.value[0].id;
  }
  if (selectedEndpointId.value && !isCreatingNew.value) {
    const endpoint = backupEndpoints.value.find(e => e.id === selectedEndpointId.value);
    if (endpoint) {
      copyEndpointToEditing(endpoint);
      loadEndpointBackups();
    }
  }
  isLoadingEndpoints.value = false;
}

function selectEndpoint(id: string) {
  selectedEndpointId.value = id;
  isCreatingNew.value = false;
  endpointMessage.value = null;
  loadEndpointBackups();
  const endpoint = backupEndpoints.value.find(e => e.id === id);
  if (endpoint) {
    copyEndpointToEditing(endpoint);
  }
}

function copyEndpointToEditing(endpoint: BackupEndpoint) {
  editingEndpoint.name = endpoint.name;
  editingEndpoint.type = endpoint.type;
  editingEndpoint.enabled = endpoint.enabled;
  editingEndpoint.config = { ...endpoint.config };
  if (editingEndpoint.config) {
    delete editingEndpoint.config.secretAccessKey;
    delete editingEndpoint.config.password;
  }
  editingEndpoint.schedule = { ...endpoint.schedule };
  editingEndpoint.retention = endpoint.retention;
}

function startCreateEndpoint() {
  isCreatingNew.value = true;
  selectedEndpointId.value = null;
  endpointMessage.value = null;
  endpointBackups.value = [];
  editingEndpoint.name = '';
  editingEndpoint.type = 's3';
  editingEndpoint.enabled = true;
  editingEndpoint.config = {};
  editingEndpoint.schedule = {
    enabled: false,
    interval: 24,
    startTime: '02:00',
    timezone: 'Asia/Shanghai'
  };
  editingEndpoint.retention = 30;
}

function cancelCreateEndpoint() {
  isCreatingNew.value = false;
  endpointMessage.value = null;
  if (backupEndpoints.value.length > 0) {
    selectedEndpointId.value = backupEndpoints.value[0].id;
    copyEndpointToEditing(backupEndpoints.value[0]);
  }
}

async function saveEndpoint() {
  if (!editingEndpoint.name?.trim()) {
    endpointMessage.value = { text: '请输入备份端名称', type: 'error' };
    return;
  }

  isSavingEndpoint.value = true;
  endpointMessage.value = null;

  const endpointData: Omit<BackupEndpoint, 'id'> = {
    name: editingEndpoint.name.trim(),
    type: editingEndpoint.type || 's3',
    enabled: editingEndpoint.enabled ?? true,
    config: { ...editingEndpoint.config },
    schedule: { ...editingEndpoint.schedule },
    retention: editingEndpoint.retention || 30
  };

  if (endpointData.config) {
    if (endpointData.config.endpoint) {
      endpointData.config.endpoint = endpointData.config.endpoint.replace(/[`\s]/g, '');
    }
    if (endpointData.config.url) {
      endpointData.config.url = endpointData.config.url.replace(/[`\s]/g, '');
    }
  }

  if (isCreatingNew.value) {
    emit('add-endpoint', endpointData);
  } else if (selectedEndpointId.value) {
    emit('update-endpoint', selectedEndpointId.value, endpointData);
  }
}

function deleteEndpoint() {
  if (!selectedEndpointId.value) return;
  if (!confirm('确定要删除此备份端吗？相关的备份数据不会被删除。')) return;
  isDeletingEndpoint.value = true;
  emit('delete-endpoint', selectedEndpointId.value);
}

async function testEndpoint() {
  if (!selectedEndpointId.value && !isCreatingNew.value) return;

  isTestingEndpoint.value = true;
  endpointMessage.value = null;

  const configCleaned = { ...editingEndpoint.config };
  if (configCleaned.endpoint) {
    configCleaned.endpoint = configCleaned.endpoint.replace(/[`\s]/g, '');
  }
  if (configCleaned.url) {
    configCleaned.url = configCleaned.url.replace(/[`\s]/g, '');
  }

  const endpointToTest = {
    type: editingEndpoint.type,
    config: configCleaned
  };

  emit('test-endpoint', isCreatingNew.value ? null : selectedEndpointId.value, endpointToTest);
}

function loadEndpointBackups() {
  if (!selectedEndpointId.value) return;
  isLoadingEndpointBackups.value = true;
  emit('list-backups', selectedEndpointId.value);
}

function setBackups(backups: Array<{ key: string; size: number; lastModified: string }>) {
  endpointBackups.value = backups || [];
  isLoadingEndpointBackups.value = false;
}

function restoreFromEndpoint(key: string) {
  if (!selectedEndpointId.value) return;
  if (!confirm('确定要从此备份恢复吗？这将覆盖当前所有数据！')) return;
  emit('restore-backup', selectedEndpointId.value, key);
}

function deleteEndpointBackup(key: string) {
  if (!selectedEndpointId.value) return;
  if (!confirm('确定要删除此备份吗？')) return;
  emit('delete-backup', selectedEndpointId.value, key);
}

function doBackupAll() {
  isBackingUpAll.value = true;
  emit('backup-all');
}

function doBackupSingle() {
  if (!selectedEndpointId.value) return;
  isBackingUpSingle.value = true;
  endpointMessage.value = null;
  emit('backup-single', selectedEndpointId.value);
}

function getEndpointStatusText(endpoint: BackupEndpoint): string {
  if (!endpoint.enabled) return '已禁用';
  if (!endpoint.lastBackup) return '未备份';
  return endpoint.lastBackup.status === 'success' ? '正常' : '失败';
}

function getEndpointStatusClass(endpoint: BackupEndpoint): string {
  if (!endpoint.enabled) return 'status-disabled';
  if (!endpoint.lastBackup) return 'status-pending';
  return endpoint.lastBackup.status === 'success' ? 'status-success' : 'status-error';
}

function formatLastBackupTime(endpoint: BackupEndpoint): string {
  if (!endpoint.lastBackup?.time) return '从未';
  const date = new Date(endpoint.lastBackup.time);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString('zh-CN');
}

function formatBackupName(key: string): string {
  const match = key.match(/backups\/(.+)\.json/);
  return match ? match[1].replace(/-/g, ' ') : key;
}

function formatBackupSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatBackupTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN');
}

function handleAddResult(endpoint: BackupEndpoint, message: string) {
  backupEndpoints.value.push(endpoint);
  selectedEndpointId.value = endpoint.id;
  isCreatingNew.value = false;
  endpointMessage.value = { text: message || '备份端创建成功', type: 'success' };
  copyEndpointToEditing(endpoint);
  isSavingEndpoint.value = false;
}

function handleUpdateResult(endpoint: BackupEndpoint, message: string) {
  const index = backupEndpoints.value.findIndex(e => e.id === selectedEndpointId.value);
  if (index !== -1) {
    backupEndpoints.value[index] = endpoint;
  }
  endpointMessage.value = { text: message || '备份端更新成功', type: 'success' };
  copyEndpointToEditing(endpoint);
  isSavingEndpoint.value = false;
}

function handleDeleteResult(message: string) {
  backupEndpoints.value = backupEndpoints.value.filter(e => e.id !== selectedEndpointId.value);
  selectedEndpointId.value = backupEndpoints.value.length > 0 ? backupEndpoints.value[0].id : null;
  if (selectedEndpointId.value) {
    const endpoint = backupEndpoints.value.find(e => e.id === selectedEndpointId.value);
    if (endpoint) copyEndpointToEditing(endpoint);
  }
  endpointMessage.value = { text: message || '备份端已删除', type: 'success' };
  isDeletingEndpoint.value = false;
}

function handleTestResult(success: boolean, result: any) {
  let displayText = '';
  if (typeof result === 'string') {
    displayText = result;
  } else if (result && result.message) {
    const msgKey = result.message;
    if (msgKey === 'msg.s3_connection_success') {
      displayText = t('msg.s3_connection_success');
    } else if (msgKey === 'msg.webdav_connection_success') {
      displayText = t('msg.webdav_connection_success');
    } else if (msgKey === 'msg.too_many_requests') {
      displayText = t('msg.too_many_requests', { status: result.statusCode });
    } else if (msgKey === 'msg.connection_failed') {
      displayText = t('msg.connection_failed', { status: result.statusCode });
    } else if (msgKey === 'msg.unsupported_backup_type') {
      displayText = t('msg.unsupported_backup_type');
    } else if (msgKey === 'msg.connection_error') {
      displayText = t('msg.connection_error', { message: result.errorMessage || '' });
    } else if (msgKey === 'msg.backup_success') {
      displayText = t('msg.backup_success', { endpointName: result.endpointName || '' });
    } else if (msgKey === 'msg.backup_failed') {
      displayText = t('msg.backup_failed', { endpointName: result.endpointName || '', message: result.errorMessage || '' });
    } else if (msgKey === 'msg.restore_success') {
      displayText = t('msg.restore_success', { count: result.count || 0 });
    } else if (msgKey === 'msg.restore_failed') {
      displayText = t('msg.restore_failed', { message: result.errorMessage || '' });
    } else if (msgKey === 'msg.restore_failed_rollback') {
      displayText = t('msg.restore_failed_rollback', { message: result.errorMessage || '' });
    } else if (msgKey === 'msg.restore_invalid_format') {
      displayText = t('msg.restore_invalid_format');
    } else if (msgKey === 'msg.restore_download_failed') {
      displayText = t('msg.restore_download_failed', { status: result.statusCode });
    } else if (msgKey === 'msg.delete_backup_success') {
      displayText = t('msg.delete_backup_success');
    } else if (msgKey === 'msg.delete_backup_failed') {
      displayText = t('msg.delete_backup_failed', { status: result.statusCode });
    } else if (msgKey === 'msg.delete_endpoint_success') {
      displayText = t('msg.delete_endpoint_success');
    } else if (msgKey === 'msg.create_endpoint_success') {
      displayText = t('msg.create_endpoint_success');
    } else if (msgKey === 'msg.update_endpoint_success') {
      displayText = t('msg.update_endpoint_success');
    } else if (msgKey === 'msg.operation_failed') {
      displayText = t('msg.operation_failed');
    } else if (msgKey === 'msg.backup_no_endpoints') {
      displayText = t('msg.backup_no_endpoints');
    } else if (msgKey === 'msg.delete_failed') {
      displayText = t('msg.delete_failed', { message: result.errorMessage || '' });
    } else if (msgKey === 'msg.list_backups_failed') {
      displayText = t('msg.list_backups_failed');
    } else if (msgKey === 'msg.list_backups_webdav_failed') {
      displayText = t('msg.list_backups_webdav_failed');
    } else if (msgKey === 'msg.list_backups_error') {
      displayText = t('msg.list_backups_error');
    } else {
      displayText = t(msgKey);
    }
  }
  endpointMessage.value = { text: displayText, type: success ? 'success' : 'error' };
  isTestingEndpoint.value = false;
}

function handleBackupAllResult(message: string, type: 'success' | 'error') {
  endpointMessage.value = { text: message, type };
  isBackingUpAll.value = false;
}

function handleBackupSingleResult(message: string, type: 'success' | 'error') {
  endpointMessage.value = { text: message, type };
  isBackingUpSingle.value = false;
}

function handleError(message: string, operation: 'save' | 'delete' | 'test' | 'backup') {
  let displayText = message || t('msg.operation_failed');
  if (displayText.startsWith('msg.')) {
    displayText = t(displayText);
  }
  endpointMessage.value = { text: displayText, type: 'error' };
  switch (operation) {
    case 'save':
      isSavingEndpoint.value = false;
      break;
    case 'delete':
      isDeletingEndpoint.value = false;
      break;
    case 'test':
      isTestingEndpoint.value = false;
      break;
    case 'backup':
      isBackingUpAll.value = false;
      isBackingUpSingle.value = false;
      break;
  }
}

onMounted(() => {
  loadBackupEndpoints();
});

function onShow() {
  loadBackupEndpoints();
}

defineExpose({
  setEndpoints,
  setBackups,
  handleAddResult,
  handleUpdateResult,
  handleDeleteResult,
  handleTestResult,
  handleBackupAllResult,
  handleBackupSingleResult,
  handleError,
  onShow,
  selectEndpoint,
});
</script>

<template>
  <div class="backup-panel">
    <div class="backup-header">
      <h3>💾 {{ t('label.backup') }}</h3>
      <button class="btn btn-sm btn-primary" @click="doBackupAll" :disabled="isBackingUpAll">
        {{ isBackingUpAll ? t('label.backing_up') : t('button.backup_all') }}
      </button>
    </div>
    <p class="hint">{{ t('hint.backup') }}</p>

    <div class="backup-endpoints-layout">
      <div class="endpoints-sidebar">
        <div class="sidebar-header">
          <span class="sidebar-title">{{ t('label.backup_endpoints') }}</span>
          <button class="btn-add-endpoint" @click="startCreateEndpoint" :title="t('button.add_endpoint')">
            <span>+</span>
          </button>
        </div>

        <div v-if="isLoadingEndpoints" class="endpoints-loading">
          <div class="loading-spinner-small"></div>
          <span>{{ t('label.loading') }}</span>
        </div>

        <div v-else-if="backupEndpoints.length === 0 && !isCreatingNew" class="endpoints-empty">
          <p>{{ t('label.no_backup_endpoints') }}</p>
          <button class="btn btn-secondary btn-sm" @click="startCreateEndpoint">{{ t('button.add_first_endpoint') }}</button>
        </div>

        <div v-else class="endpoints-list">
          <div
            v-for="endpoint in backupEndpoints"
            :key="endpoint.id"
            class="endpoint-item"
            :class="{ active: selectedEndpointId === endpoint.id && !isCreatingNew }"
            @click="selectEndpoint(endpoint.id)"
          >
            <div class="endpoint-icon">
              {{ endpoint.type === 's3' ? '🪣' : '📁' }}
            </div>
            <div class="endpoint-info">
              <div class="endpoint-name">{{ endpoint.name }}</div>
              <div class="endpoint-meta">
                <span class="endpoint-type">{{ endpoint.type.toUpperCase() }}</span>
                <span class="endpoint-time">{{ formatLastBackupTime(endpoint) }}</span>
              </div>
            </div>
            <div class="endpoint-status">
              <span class="status-dot" :class="getEndpointStatusClass(endpoint)"></span>
            </div>
          </div>

          <div v-if="isCreatingNew" class="endpoint-item active creating">
            <div class="endpoint-icon">➕</div>
            <div class="endpoint-info">
              <div class="endpoint-name">{{ t('label.new_backup_endpoint') }}</div>
              <div class="endpoint-meta">
                <span class="endpoint-type">{{ t('label.configuring') }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="endpoints-content">
        <div v-if="!selectedEndpointId && !isCreatingNew" class="endpoint-empty-state">
          <p>{{ t('label.select_or_add_endpoint') }}</p>
        </div>

        <div v-else class="endpoint-form">
          <div class="form-section">
            <h4>{{ t('label.basic_info') }}</h4>
            <div class="form-row">
              <div class="form-group">
                <label>{{ t('label.name') }} *</label>
                <input v-model="editingEndpoint.name" :placeholder="t('placeholder.backup_name')" />
              </div>
              <div class="form-group">
                <label>{{ t('label.type') }} *</label>
                <select v-model="editingEndpoint.type">
                  <option value="s3">{{ t('label.s3_compatible') }}</option>
                  <option value="webdav">WebDAV</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group checkbox-group">
                <label class="checkbox-label">
                  <input type="checkbox" v-model="editingEndpoint.enabled" />
                  <span>{{ t('label.enable_auto_backup') }}</span>
                </label>
              </div>
            </div>
          </div>

          <div v-if="editingEndpoint.type === 's3'" class="form-section">
            <h4>{{ t('label.s3_config') }}</h4>
            <div class="form-row">
              <div class="form-group">
                <label>{{ t('label.s3_endpoint') }}</label>
                <input v-model="editingEndpoint.config.endpoint" placeholder="https://s3.example.com" />
              </div>
              <div class="form-group">
                <label>{{ t('label.s3_region') }}</label>
                <input v-model="editingEndpoint.config.region" placeholder="auto" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>{{ t('label.s3_access_key') }}</label>
                <input v-model="editingEndpoint.config.accessKeyId" placeholder="AKIA..." />
              </div>
              <div class="form-group">
                <label>{{ t('label.secret_access_key') }} {{ isCreatingNew ? '*' : `(${t('label.keep_original')})` }}</label>
                <input v-model="editingEndpoint.config.secretAccessKey" type="password" :placeholder="isCreatingNew ? t('placeholder.access_key') : t('placeholder.configured')" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>{{ t('label.s3_bucket') }}</label>
                <input v-model="editingEndpoint.config.bucket" placeholder="my-backup-bucket" />
              </div>
              <div class="form-group">
                <label>{{ t('label.root_path') }}</label>
                <input v-model="editingEndpoint.config.path" :placeholder="t('placeholder.default_path')" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group checkbox-group">
                <label class="checkbox-label">
                  <input type="checkbox" v-model="editingEndpoint.config.pathStyle" />
                  <span>{{ t('label.path_style_url') }}</span>
                </label>
              </div>
            </div>
          </div>

          <div v-else class="form-section">
            <h4>{{ t('label.webdav_config') }}</h4>
            <div class="form-row">
              <div class="form-group">
                <label>{{ t('label.webdav_url') }}</label>
                <input v-model="editingEndpoint.config.url" placeholder="https://dav.example.com/backup" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>{{ t('label.username') }} *</label>
                <input v-model="editingEndpoint.config.username" placeholder="username" />
              </div>
              <div class="form-group">
                <label>{{ t('label.password') }} {{ isCreatingNew ? '*' : `(${t('label.keep_original')})` }}</label>
                <input v-model="editingEndpoint.config.password" type="password" :placeholder="isCreatingNew ? t('placeholder.password') : t('placeholder.configured')" />
              </div>
            </div>
          </div>

          <div class="form-section">
            <h4>{{ t('label.schedule_settings') }}</h4>
            <div class="form-row">
              <div class="form-group">
                <label>{{ t('label.backup_interval') }}</label>
                <select v-model="editingEndpoint.schedule.interval">
                  <option :value="1">{{ t('interval.hourly') }}</option>
                  <option :value="6">{{ t('interval.every_6_hours') }}</option>
                  <option :value="12">{{ t('interval.every_12_hours') }}</option>
                  <option :value="24">{{ t('interval.daily') }}</option>
                  <option :value="168">{{ t('interval.weekly') }}</option>
                </select>
              </div>
              <div class="form-group">
                <label>{{ t('label.start_time') }}</label>
                <input v-model="editingEndpoint.schedule.startTime" type="time" />
              </div>
              <div class="form-group">
                <label>{{ t('label.timezone') }}</label>
                <select v-model="editingEndpoint.schedule.timezone">
                  <optgroup :label="t('timezone.asia')">
                    <option value="Asia/Shanghai">{{ t('timezone.china') }}</option>
                    <option value="Asia/Hong_Kong">{{ t('timezone.hongkong') }}</option>
                    <option value="Asia/Taipei">{{ t('timezone.taipei') }}</option>
                    <option value="Asia/Tokyo">{{ t('timezone.tokyo') }}</option>
                    <option value="Asia/Seoul">{{ t('timezone.seoul') }}</option>
                    <option value="Asia/Singapore">{{ t('timezone.singapore') }}</option>
                    <option value="Asia/Kolkata">{{ t('timezone.india') }}</option>
                    <option value="Asia/Dubai">{{ t('timezone.dubai') }}</option>
                    <option value="Asia/Bangkok">{{ t('timezone.bangkok') }}</option>
                  </optgroup>
                  <optgroup :label="t('timezone.america')">
                    <option value="America/New_York">{{ t('timezone.newyork') }}</option>
                    <option value="America/Chicago">{{ t('timezone.chicago') }}</option>
                    <option value="America/Denver">{{ t('timezone.denver') }}</option>
                    <option value="America/Los_Angeles">{{ t('timezone.losangeles') }}</option>
                    <option value="America/Sao_Paulo">{{ t('timezone.saopaulo') }}</option>
                    <option value="America/Vancouver">{{ t('timezone.vancouver') }}</option>
                  </optgroup>
                  <optgroup :label="t('timezone.europe')">
                    <option value="Europe/London">{{ t('timezone.london') }}</option>
                    <option value="Europe/Paris">{{ t('timezone.paris') }}</option>
                    <option value="Europe/Berlin">{{ t('timezone.berlin') }}</option>
                    <option value="Europe/Moscow">{{ t('timezone.moscow') }}</option>
                  </optgroup>
                  <optgroup :label="t('timezone.oceania')">
                    <option value="Australia/Sydney">{{ t('timezone.sydney') }}</option>
                    <option value="Pacific/Auckland">{{ t('timezone.auckland') }}</option>
                  </optgroup>
                  <optgroup :label="t('timezone.other')">
                    <option value="UTC">UTC</option>
                  </optgroup>
                </select>
                <span class="input-hint">{{ t('hint.timezone_backup') }}</span>
              </div>
            </div>
          </div>

          <div class="form-section">
            <h4>{{ t('label.retention_policy') }}</h4>
            <div class="form-row">
              <div class="form-group">
                <label>{{ t('label.retention_count') }}</label>
                <input v-model.number="editingEndpoint.retention" type="number" min="1" max="365" />
                <span class="input-hint">{{ t('hint.retention_count', { count: editingEndpoint.retention }) }}</span>
              </div>
            </div>
          </div>

          <div v-if="endpointMessage" class="endpoint-message" :class="endpointMessage.type">
            {{ endpointMessage.text }}
          </div>

          <div class="endpoint-actions">
            <button v-if="isCreatingNew" class="btn" @click="cancelCreateEndpoint">
              {{ t('button.cancel') }}
            </button>
            <button v-if="!isCreatingNew" class="btn btn-warning" @click="deleteEndpoint" :disabled="isDeletingEndpoint">
              {{ isDeletingEndpoint ? t('label.deleting') : t('button.delete') }}
            </button>
            <button v-if="!isCreatingNew" class="btn" @click="doBackupSingle" :disabled="isBackingUpSingle">
              {{ isBackingUpSingle ? t('label.backing_up') : t('button.backup_now') }}
            </button>
            <button class="btn" @click="testEndpoint" :disabled="isTestingEndpoint">
              {{ isTestingEndpoint ? t('label.testing') : t('button.test_connection') }}
            </button>
            <button class="btn btn-primary" @click="saveEndpoint" :disabled="isSavingEndpoint">
              {{ isSavingEndpoint ? t('label.saving') : (isCreatingNew ? t('button.create') : t('button.save')) }}
            </button>
          </div>

          <div v-if="!isCreatingNew && selectedEndpoint" class="endpoint-backups-section">
            <hr />
            <h4>{{ t('label.backup_list') }}</h4>
            <div v-if="isLoadingEndpointBackups" class="backups-loading">
              <div class="loading-spinner-small"></div>
              <span>{{ t('label.loading_backups') }}</span>
            </div>
            <div v-else-if="endpointBackups.length === 0" class="backups-empty">
              {{ t('label.no_backups') }}
            </div>
            <div v-else class="backup-list">
              <div v-for="b in endpointBackups" :key="b.key" class="backup-item">
                <div class="backup-info">
                  <span class="backup-name">{{ formatBackupName(b.key) }}</span>
                  <span class="backup-meta">{{ formatBackupSize(b.size) }} · {{ formatBackupTime(b.lastModified) }}</span>
                </div>
                <div class="backup-actions-item">
                  <button class="btn btn-sm" @click="restoreFromEndpoint(b.key)">{{ t('button.restore') }}</button>
                  <button class="btn btn-sm btn-warning" @click="deleteEndpointBackup(b.key)">{{ t('button.delete') }}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backup-panel {
  background: var(--bg-secondary, #f8f9fa);
  padding: 16px;
  border-radius: 8px;
}

.backup-panel h3 {
  font-size: 16px;
  color: var(--text-primary, #1a1a2e);
  margin-bottom: 8px;
  padding-bottom: 0;
  border-bottom: none;
}

.hint {
  font-size: 12px;
  color: var(--text-secondary, #999);
  margin-top: 4px;
}

.backup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.backup-header h3 {
  font-size: 16px;
  color: var(--text-primary, #1a1a2e);
  margin: 0;
  padding: 0;
  border: none;
  height: 24px;
  line-height: 24px;
  box-sizing: border-box;
}

.backup-endpoints-layout {
  display: flex;
  gap: 20px;
  margin-top: 16px;
  min-height: 400px;
}

.endpoints-sidebar {
  width: 240px;
  flex-shrink: 0;
  background: var(--bg-secondary, #f8f9fa);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  height: 36px;
  box-sizing: border-box;
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #374151);
}

.btn-add-endpoint {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  background: #667eea;
  color: white;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-add-endpoint:hover {
  background: #5a6fd6;
  transform: scale(1.05);
}

.endpoints-loading,
.endpoints-empty {
  text-align: center;
  padding: 24px 12px;
  color: var(--text-secondary, #9ca3af);
  font-size: 13px;
}

.endpoints-empty p {
  margin-bottom: 12px;
}

.endpoints-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  max-height: 400px;
}

.endpoint-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
  background: var(--bg-panel, white);
  height: 56px;
  box-sizing: border-box;
}

.endpoint-item:hover {
  background: var(--bg-secondary, white);
  border-color: var(--border-color, #e0e0e0);
}

.endpoint-item.active {
  background: var(--bg-panel, white);
  border-color: #667eea;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
}

.endpoint-item.creating {
  background: #f0f0ff;
  border-color: #667eea;
  border-style: dashed;
}

.endpoint-icon {
  font-size: 20px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-panel, white);
  border-radius: 8px;
  flex-shrink: 0;
}

.endpoint-info {
  flex: 1;
  min-width: 0;
}

.endpoint-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #1a1a2e);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.endpoint-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}

.endpoint-type {
  font-size: 11px;
  color: #667eea;
  background: #f0f0ff;
  padding: 1px 6px;
  border-radius: 4px;
}

.endpoint-time {
  font-size: 11px;
  color: var(--text-secondary, #9ca3af);
}

.endpoint-status {
  flex-shrink: 0;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: block;
}

.status-dot.status-success {
  background: #10b981;
}

.status-dot.status-error {
  background: #ef4444;
}

.status-dot.status-disabled {
  background: #9ca3af;
}

.status-dot.status-pending {
  background: #f59e0b;
}

.endpoints-content {
  flex: 1;
  min-width: 0;
}

.endpoint-empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 300px;
  color: var(--text-secondary, #9ca3af);
  font-size: 14px;
}

.endpoint-form {
  background: var(--bg-panel, #f8f9fa);
  border-radius: 8px;
  padding: 20px;
}

.form-section {
  margin-bottom: 20px;
}

.form-section h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #374151);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  height: 30px;
  line-height: 22px;
  box-sizing: border-box;
  white-space: nowrap;
  overflow: hidden;
}

.form-row {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  min-height: 70px;
}

.form-row .form-group {
  flex: 1;
  margin-bottom: 0;
}

.form-row .form-group.checkbox-group {
  flex: none;
  display: flex;
  align-items: center;
}

.endpoint-form .form-group label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #4b5563);
  margin-bottom: 6px;
  display: block;
  height: 20px;
  line-height: 20px;
  box-sizing: border-box;
  white-space: nowrap;
  overflow: hidden;
}

.endpoint-form .form-group input,
.endpoint-form .form-group select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-color, #d1d5db);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg-panel, white);
  color: var(--text-primary, #1a1a2e);
  box-sizing: border-box;
}

.endpoint-form .form-group input:focus,
.endpoint-form .form-group select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  height: auto !important;
  line-height: 1.4 !important;
  overflow: visible !important;
  white-space: normal !important;
}

.input-hint {
  display: block;
  font-size: 12px;
  color: var(--text-secondary, #9ca3af);
  margin-top: 4px;
}

.endpoint-message {
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 16px;
}

.endpoint-message.success {
  background: #d1fae5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}

.endpoint-message.error {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.endpoint-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color, #e0e0e0);
}

.endpoint-backups-section {
  margin-top: 20px;
}

.endpoint-backups-section h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #374151);
  margin-bottom: 12px;
}

.backups-loading,
.backups-empty {
  text-align: center;
  padding: 20px;
  color: var(--text-secondary, #9ca3af);
  font-size: 13px;
}

.loading-spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
  margin-right: 8px;
  vertical-align: middle;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.backup-list {
  margin-top: 12px;
}

.backup-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: var(--bg-panel, white);
  border-radius: 8px;
  margin-bottom: 6px;
}

.backup-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.backup-name {
  font-weight: 500;
  font-size: 14px;
  color: var(--text-primary, #1a1a2e);
}

.backup-meta {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
}

.backup-actions-item {
  display: flex;
  gap: 6px;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  background: var(--bg-secondary, #f0f0f0);
  color: var(--text-primary, #333);
}

.btn:hover {
  background: var(--border-color, #e0e0e0);
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

.btn-secondary {
  background: var(--bg-secondary, #f0f0f0);
  color: var(--text-primary, #333);
}

.btn-secondary:hover {
  background: var(--border-color, #e0e0e0);
}

.btn-warning {
  background-color: #f59e0b;
  color: white;
}

.btn-warning:hover {
  background-color: #d97706;
}

.btn-sm {
  padding: 8px 18px;
  font-size: 13px;
}

hr {
  border: none;
  border-top: 1px solid var(--border-color, #e0e0e0);
  margin: 16px 0;
}

@media (max-width: 768px) {
  .backup-endpoints-layout {
    flex-direction: column;
  }

  .endpoints-sidebar {
    width: 100%;
    max-height: 200px;
  }

  .endpoints-list {
    max-height: 150px;
  }

  .form-row {
    flex-direction: column;
    gap: 12px;
  }

  .endpoint-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }

  .endpoint-actions .btn {
    flex: 1;
    min-width: 100px;
    max-width: 150px;
  }

  .endpoint-actions .btn:last-child {
    min-width: 120px;
  }

  .backup-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .backup-actions-item {
    width: 100%;
    justify-content: flex-end;
  }

  .backup-actions-item .btn {
    flex: none;
    min-width: 70px;
    padding: 6px 12px;
    font-size: 12px;
  }
}

@media (max-width: 480px) {
  .endpoint-actions .btn {
    flex: 1 1 calc(50% - 4px);
    min-width: 0;
    font-size: 12px;
    padding: 10px 14px;
  }

  .endpoint-actions .btn:last-child {
    flex: 1 1 100%;
    min-width: 100%;
  }

  .backup-actions-item {
    gap: 4px;
  }

  .backup-actions-item .btn {
    min-width: 60px;
    padding: 5px 10px;
    font-size: 11px;
  }
}
</style>
