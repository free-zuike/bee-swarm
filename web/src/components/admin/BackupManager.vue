<script setup lang="ts">
// ============================================
// 备份端管理组件
// ============================================
import { ref, reactive, computed, watch, onMounted } from 'vue';
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

// 备份端列表
const backupEndpoints = ref<BackupEndpoint[]>([]);
const selectedEndpointId = ref<string | null>(null);
const isLoadingEndpoints = ref(false);
const isSavingEndpoint = ref(false);
const isTestingEndpoint = ref(false);
const isDeletingEndpoint = ref(false);
const isBackingUpAll = ref(false);
const isBackingUpSingle = ref(false);
const endpointMessage = ref<{ text: string; type: 'success' | 'error' } | null>(null);

// 当前选中备份端的备份列表
const endpointBackups = ref<Array<{ key: string; size: number; lastModified: string }>>([]);
const isLoadingEndpointBackups = ref(false);

// 编辑中的备份端数据
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

// 计算选中的备份端
const selectedEndpoint = computed(() => {
  if (isCreatingNew.value) return null;
  return backupEndpoints.value.find(e => e.id === selectedEndpointId.value) || null;
});

// 加载备份端列表
function loadBackupEndpoints() {
  isLoadingEndpoints.value = true;
  emit('load-endpoints');
}

// 设置备份端列表（由父组件调用）
function setEndpoints(endpoints: BackupEndpoint[]) {
  backupEndpoints.value = endpoints || [];
  // 如果当前选中的不存在了，重置选择
  if (selectedEndpointId.value && !backupEndpoints.value.find(e => e.id === selectedEndpointId.value)) {
    selectedEndpointId.value = backupEndpoints.value.length > 0 ? backupEndpoints.value[0].id : null;
  }
  // 默认选中第一个
  if (!selectedEndpointId.value && backupEndpoints.value.length > 0) {
    selectedEndpointId.value = backupEndpoints.value[0].id;
  }
  // 同步编辑状态
  if (selectedEndpointId.value && !isCreatingNew.value) {
    const endpoint = backupEndpoints.value.find(e => e.id === selectedEndpointId.value);
    if (endpoint) {
      copyEndpointToEditing(endpoint);
      loadEndpointBackups();
    }
  }
  isLoadingEndpoints.value = false;
}

// 选择备份端
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

// 复制备份端数据到编辑状态
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

// 开始创建新备份端
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

// 取消创建
function cancelCreateEndpoint() {
  isCreatingNew.value = false;
  endpointMessage.value = null;
  if (backupEndpoints.value.length > 0) {
    selectedEndpointId.value = backupEndpoints.value[0].id;
    copyEndpointToEditing(backupEndpoints.value[0]);
  }
}

// 保存备份端（创建或更新）
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

// 删除备份端
function deleteEndpoint() {
  if (!selectedEndpointId.value) return;
  if (!confirm('确定要删除此备份端吗？相关的备份数据不会被删除。')) return;
  isDeletingEndpoint.value = true;
  emit('delete-endpoint', selectedEndpointId.value);
}

// 测试备份端连接
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

// 加载选中备份端的备份列表
function loadEndpointBackups() {
  if (!selectedEndpointId.value) return;
  isLoadingEndpointBackups.value = true;
  emit('list-backups', selectedEndpointId.value);
}

// 设置备份列表（由父组件调用）
function setBackups(backups: Array<{ key: string; size: number; lastModified: string }>) {
  endpointBackups.value = backups || [];
  isLoadingEndpointBackups.value = false;
}

// 从备份端恢复
function restoreFromEndpoint(key: string) {
  if (!selectedEndpointId.value) return;
  if (!confirm('确定要从此备份恢复吗？这将覆盖当前所有数据！')) return;
  emit('restore-backup', selectedEndpointId.value, key);
}

// 删除备份端上的备份
function deleteEndpointBackup(key: string) {
  if (!selectedEndpointId.value) return;
  if (!confirm('确定要删除此备份吗？')) return;
  emit('delete-backup', selectedEndpointId.value, key);
}

// 手动触发所有备份
function doBackupAll() {
  isBackingUpAll.value = true;
  emit('backup-all');
}

// 手动触发单个备份端备份
function doBackupSingle() {
  if (!selectedEndpointId.value) return;
  isBackingUpSingle.value = true;
  endpointMessage.value = null;
  emit('backup-single', selectedEndpointId.value);
}

// 格式化备份端状态
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

// 格式化备份时间
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

// 处理操作结果（由父组件调用）
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

function handleTestResult(success: boolean, message: string) {
  endpointMessage.value = { text: message, type: success ? 'success' : 'error' };
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
  endpointMessage.value = { text: message || '操作失败', type: 'error' };
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

// 组件挂载时加载数据
onMounted(() => {
  loadBackupEndpoints();
});

// 监听 showSettings 变化来加载数据
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
      <h3>💾 数据备份</h3>
      <button class="btn btn-sm btn-primary" @click="doBackupAll" :disabled="isBackingUpAll">
        {{ isBackingUpAll ? '备份中...' : '立即备份全部' }}
      </button>
    </div>
    <p class="hint">配置多个备份端，数据将同时备份到所有启用的地点</p>

    <!-- 多备份端布局 -->
    <div class="backup-endpoints-layout">
      <!-- 左侧：备份端列表 -->
      <div class="endpoints-sidebar">
        <div class="sidebar-header">
          <span class="sidebar-title">备份地点</span>
          <button class="btn-add-endpoint" @click="startCreateEndpoint" title="添加备份地点">
            <span>+</span>
          </button>
        </div>

        <div v-if="isLoadingEndpoints" class="endpoints-loading">
          <div class="loading-spinner-small"></div>
          <span>加载中...</span>
        </div>

        <div v-else-if="backupEndpoints.length === 0 && !isCreatingNew" class="endpoints-empty">
          <p>暂无备份地点</p>
          <button class="btn btn-secondary btn-sm" @click="startCreateEndpoint">添加第一个备份地点</button>
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

          <!-- 新建项 -->
          <div v-if="isCreatingNew" class="endpoint-item active creating">
            <div class="endpoint-icon">➕</div>
            <div class="endpoint-info">
              <div class="endpoint-name">新备份地点</div>
              <div class="endpoint-meta">
                <span class="endpoint-type">配置中...</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：备份端详情 -->
      <div class="endpoints-content">
        <div v-if="!selectedEndpointId && !isCreatingNew" class="endpoint-empty-state">
          <p>请从左侧选择一个备份地点，或添加新的备份地点</p>
        </div>

        <div v-else class="endpoint-form">
          <!-- 基本信息 -->
          <div class="form-section">
            <h4>基本信息</h4>
            <div class="form-row">
              <div class="form-group">
                <label>名称 *</label>
                <input v-model="editingEndpoint.name" placeholder="如：阿里云OSS、坚果云" />
              </div>
              <div class="form-group">
                <label>类型 *</label>
                <select v-model="editingEndpoint.type">
                  <option value="s3">S3 兼容存储</option>
                  <option value="webdav">WebDAV</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group checkbox-group">
                <label class="checkbox-label">
                  <input type="checkbox" v-model="editingEndpoint.enabled" />
                  <span>启用自动备份</span>
                </label>
              </div>
            </div>
          </div>

          <!-- S3 配置 -->
          <div v-if="editingEndpoint.type === 's3'" class="form-section">
            <h4>S3 配置</h4>
            <div class="form-row">
              <div class="form-group">
                <label>Endpoint *</label>
                <input v-model="editingEndpoint.config.endpoint" placeholder="https://s3.example.com" />
              </div>
              <div class="form-group">
                <label>Region</label>
                <input v-model="editingEndpoint.config.region" placeholder="auto" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Access Key ID *</label>
                <input v-model="editingEndpoint.config.accessKeyId" placeholder="AKIA..." />
              </div>
              <div class="form-group">
                <label>Secret Access Key {{ isCreatingNew ? '*' : '(留空保留原值)' }}</label>
                <input v-model="editingEndpoint.config.secretAccessKey" type="password" :placeholder="isCreatingNew ? '请输入密钥' : '已配置（留空保留）'" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Bucket *</label>
                <input v-model="editingEndpoint.config.bucket" placeholder="my-backup-bucket" />
              </div>
              <div class="form-group">
                <label>根目录（可选）</label>
                <input v-model="editingEndpoint.config.path" placeholder="默认: beeswarm" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group checkbox-group">
                <label class="checkbox-label">
                  <input type="checkbox" v-model="editingEndpoint.config.pathStyle" />
                  <span>使用 Path-Style URL（部分 S3 服务商需要）</span>
                </label>
              </div>
            </div>
          </div>

          <!-- WebDAV 配置 -->
          <div v-else class="form-section">
            <h4>WebDAV 配置</h4>
            <div class="form-row">
              <div class="form-group">
                <label>URL *</label>
                <input v-model="editingEndpoint.config.url" placeholder="https://dav.example.com/backup" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>用户名 *</label>
                <input v-model="editingEndpoint.config.username" placeholder="username" />
              </div>
              <div class="form-group">
                <label>密码 {{ isCreatingNew ? '*' : '(留空保留原值)' }}</label>
                <input v-model="editingEndpoint.config.password" type="password" :placeholder="isCreatingNew ? '请输入密码' : '已配置（留空保留）'" />
              </div>
            </div>
          </div>

          <!-- 调度设置 -->
          <div class="form-section">
            <h4>调度设置</h4>
            <div class="form-row">
              <div class="form-group">
                <label>备份间隔（小时）</label>
                <select v-model="editingEndpoint.schedule.interval">
                  <option :value="1">每小时</option>
                  <option :value="6">每6小时</option>
                  <option :value="12">每12小时</option>
                  <option :value="24">每天</option>
                  <option :value="168">每周</option>
                </select>
              </div>
              <div class="form-group">
                <label>开始时间</label>
                <input v-model="editingEndpoint.schedule.startTime" type="time" />
              </div>
              <div class="form-group">
                <label>时区</label>
                <select v-model="editingEndpoint.schedule.timezone">
                  <optgroup label="亚洲">
                    <option value="Asia/Shanghai">中国 (UTC+8)</option>
                    <option value="Asia/Hong_Kong">香港 (UTC+8)</option>
                    <option value="Asia/Taipei">台北 (UTC+8)</option>
                    <option value="Asia/Tokyo">东京 (UTC+9)</option>
                    <option value="Asia/Seoul">首尔 (UTC+9)</option>
                    <option value="Asia/Singapore">新加坡 (UTC+8)</option>
                    <option value="Asia/Kolkata">印度 (UTC+5:30)</option>
                    <option value="Asia/Dubai">迪拜 (UTC+4)</option>
                    <option value="Asia/Bangkok">曼谷 (UTC+7)</option>
                  </optgroup>
                  <optgroup label="美洲">
                    <option value="America/New_York">纽约 (UTC-5/-4)</option>
                    <option value="America/Chicago">芝加哥 (UTC-6/-5)</option>
                    <option value="America/Denver">丹佛 (UTC-7/-6)</option>
                    <option value="America/Los_Angeles">洛杉矶 (UTC-8/-7)</option>
                    <option value="America/Sao_Paulo">圣保罗 (UTC-3)</option>
                    <option value="America/Vancouver">温哥华 (UTC-8/-7)</option>
                  </optgroup>
                  <optgroup label="欧洲">
                    <option value="Europe/London">伦敦 (UTC+0/+1)</option>
                    <option value="Europe/Paris">巴黎 (UTC+1/+2)</option>
                    <option value="Europe/Berlin">柏林 (UTC+1/+2)</option>
                    <option value="Europe/Moscow">莫斯科 (UTC+3)</option>
                  </optgroup>
                  <optgroup label="大洋洲">
                    <option value="Australia/Sydney">悉尼 (UTC+10/+11)</option>
                    <option value="Pacific/Auckland">奥克兰 (UTC+12/+13)</option>
                  </optgroup>
                  <optgroup label="其他">
                    <option value="UTC">UTC</option>
                  </optgroup>
                </select>
                <span class="input-hint">备份将在此时区的开始时间触发</span>
              </div>
            </div>
          </div>

          <!-- 保留策略 -->
          <div class="form-section">
            <h4>保留策略</h4>
            <div class="form-row">
              <div class="form-group">
                <label>保留份数</label>
                <input v-model.number="editingEndpoint.retention" type="number" min="1" max="365" />
                <span class="input-hint">最多保留 {{ editingEndpoint.retention }} 份备份，旧备份将自动删除</span>
              </div>
            </div>
          </div>

          <!-- 消息提示 -->
          <div v-if="endpointMessage" class="endpoint-message" :class="endpointMessage.type">
            {{ endpointMessage.text }}
          </div>

          <!-- 操作按钮 -->
          <div class="endpoint-actions">
            <button v-if="isCreatingNew" class="btn" @click="cancelCreateEndpoint">
              取消
            </button>
            <button v-if="!isCreatingNew" class="btn btn-warning" @click="deleteEndpoint" :disabled="isDeletingEndpoint">
              {{ isDeletingEndpoint ? '删除中...' : '删除' }}
            </button>
            <button v-if="!isCreatingNew" class="btn" @click="doBackupSingle" :disabled="isBackingUpSingle">
              {{ isBackingUpSingle ? '备份中...' : '立即备份' }}
            </button>
            <button class="btn" @click="testEndpoint" :disabled="isTestingEndpoint">
              {{ isTestingEndpoint ? '测试中...' : '测试连接' }}
            </button>
            <button class="btn btn-primary" @click="saveEndpoint" :disabled="isSavingEndpoint">
              {{ isSavingEndpoint ? '保存中...' : (isCreatingNew ? '创建' : '保存') }}
            </button>
          </div>

          <!-- 当前备份端的备份列表 -->
          <div v-if="!isCreatingNew && selectedEndpoint" class="endpoint-backups-section">
            <hr />
            <h4>备份列表</h4>
            <div v-if="isLoadingEndpointBackups" class="backups-loading">
              <div class="loading-spinner-small"></div>
              <span>加载备份列表...</span>
            </div>
            <div v-else-if="endpointBackups.length === 0" class="backups-empty">
              暂无备份
            </div>
            <div v-else class="backup-list">
              <div v-for="b in endpointBackups" :key="b.key" class="backup-item">
                <div class="backup-info">
                  <span class="backup-name">{{ formatBackupName(b.key) }}</span>
                  <span class="backup-meta">{{ formatBackupSize(b.size) }} · {{ formatBackupTime(b.lastModified) }}</span>
                </div>
                <div class="backup-actions-item">
                  <button class="btn btn-sm" @click="restoreFromEndpoint(b.key)">恢复</button>
                  <button class="btn btn-sm btn-warning" @click="deleteEndpointBackup(b.key)">删除</button>
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
  background: #f8f9fa;
  padding: 16px;
  border-radius: 8px;
}

.backup-panel h3 {
  font-size: 16px;
  color: #1a1a2e;
  margin-bottom: 8px;
  padding-bottom: 0;
  border-bottom: none;
}

.hint {
  font-size: 12px;
  color: #999;
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
  color: #1a1a2e;
  margin: 0;
  padding: 0;
  border: none;
}

.backup-endpoints-layout {
  display: flex;
  gap: 20px;
  margin-top: 16px;
  min-height: 400px;
}

/* 左侧边栏 */
.endpoints-sidebar {
  width: 240px;
  flex-shrink: 0;
  background: #f8f9fa;
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
  border-bottom: 1px solid #e0e0e0;
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
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
  color: #9ca3af;
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
}

.endpoint-item:hover {
  background: white;
  border-color: #e0e0e0;
}

.endpoint-item.active {
  background: white;
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
  background: white;
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
  color: #1a1a2e;
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
  color: #9ca3af;
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

/* 右侧内容区 */
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
  color: #9ca3af;
  font-size: 14px;
}

.endpoint-form {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
}

.form-section {
  margin-bottom: 20px;
}

.form-section h4 {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e0e0e0;
}

.form-row {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
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
  color: #4b5563;
  margin-bottom: 6px;
  display: block;
}

.endpoint-form .form-group input,
.endpoint-form .form-group select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  background: white;
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
}

.input-hint {
  display: block;
  font-size: 12px;
  color: #9ca3af;
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
  border-top: 1px solid #e0e0e0;
}

.endpoint-backups-section {
  margin-top: 20px;
}

.endpoint-backups-section h4 {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 12px;
}

.backups-loading,
.backups-empty {
  text-align: center;
  padding: 20px;
  color: #9ca3af;
  font-size: 13px;
}

.loading-spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid #e0e0e0;
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
  background: white;
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
}

.backup-meta {
  font-size: 12px;
  color: #6b7280;
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
  background: #f0f0f0;
  color: #333;
}

.btn-secondary:hover {
  background: #e0e0e0;
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
  border-top: 1px solid #e0e0e0;
  margin: 16px 0;
}

/* 响应式布局 */
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
}
</style>
