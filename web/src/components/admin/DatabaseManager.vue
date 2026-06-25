<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useThemeStore } from '@/stores/theme';
import { useTranslation } from '@/i18n';
import { useGlobalToast } from '@/composables/useToast';
import {
  getDatabaseStats,
  cleanupDatabase,
  archiveDatabase,
  getArchives,
  restoreArchive,
  getDatabaseTables,
  deleteDatabaseTable,
  cleanupOrphanTables,
} from '@/api';
import type { DatabaseStats, ArchiveInfo, DatabaseTable } from '@/api';

const t = useTranslation();
const { showToast } = useGlobalToast();
const themeStore = useThemeStore();
const isDark = computed(() => themeStore.isDark);

const props = defineProps<{
  accessToken: string;
  cleanupPushHistoryDays?: number;
  cleanupAuditLogDays?: number;
}>();

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}

// ==================== 数据库管理相关 ====================
const databaseStats = ref<DatabaseStats>({
  pushHistoryCount: 0,
  auditLogsCount: 0,
  usersCount: 0,
  estimatedSize: '0 KB',
});
const archives = ref<ArchiveInfo[]>([]);
const databaseTables = ref<DatabaseTable[]>([]);
const isLoadingStats = ref(false);
const isCleaningUp = ref(false);
const isArchiving = ref(false);
const isRestoring = ref(false);
const isLoadingTables = ref(false);
const isDeletingTable = ref(false);
const isCleaningTables = ref(false);

async function loadDatabaseStats() {
  try {
    const result = await getDatabaseStats(props.accessToken);
    if (result.success) {
      databaseStats.value = result.stats;
    }
  } catch {
    // ignore
  }
}
  } catch (err) {
    showToast(getErrorMessage(err, t('msg.load_stats_failed')), 'error');
  } finally {
    isLoadingStats.value = false;
  }
}

async function loadArchives() {
  try {
    const result = await getArchives(props.accessToken);
    if (result.success) {
      archives.value = result.archives;
    }
  } catch {
    // ignore
  }
}
  } catch (err) {
    showToast(getErrorMessage(err, t('msg.load_archives_failed')), 'error');
  }
}

async function handleCleanup() {
  if (isCleaningUp.value) return;
  const pushDays = props.cleanupPushHistoryDays || 30;
  const auditDays = props.cleanupAuditLogDays || 90;
  if (
    !confirm(
      t('confirm.cleanup_database', { pushDays: String(pushDays), auditDays: String(auditDays) })
    )
  ) {
    return;
  }

  isCleaningUp.value = true;
  try {
    const result = await cleanupDatabase(props.accessToken, {
      pushHistoryRetentionDays: props.cleanupPushHistoryDays,
      auditLogRetentionDays: props.cleanupAuditLogDays,
    });
    if (result.success) {
      showToast(
        t('msg.cleanup_result', {
          pushDeleted: String(result.pushHistoryDeleted),
          auditDeleted: String(result.auditLogsDeleted),
        }),
        'success'
      );
      await loadDatabaseStats();
    } else {
      showToast(getErrorMessage(result, t('msg.cleanup_failed')), 'error');
    }
  } catch (err) {
    showToast(getErrorMessage(err, t('msg.cleanup_failed')), 'error');
  } finally {
    isCleaningUp.value = false;
  }
}

async function handleArchive() {
  if (isArchiving.value) return;
  const archiveAfterDays = 30;
  if (!confirm(t('confirm.archive_database', { days: String(archiveAfterDays) }))) {
    return;
  }

  isArchiving.value = true;
  try {
    const result = await archiveDatabase(props.accessToken, { archiveAfterDays });
    if (result.success) {
      showToast(t('msg.archive_result', { count: String(result.archived) }), 'success');
      await loadDatabaseStats();
      await loadArchives();
    } else {
      showToast(getErrorMessage(result, t('msg.archive_failed')), 'error');
    }
  } catch (err) {
    showToast(getErrorMessage(err, t('msg.archive_failed')), 'error');
  } finally {
    isArchiving.value = false;
  }
}

async function handleRestore(archiveKey: string) {
  if (isRestoring.value) return;
  if (!confirm(t('confirm.restore_archive'))) {
    return;
  }

  isRestoring.value = true;
  try {
    const result = await restoreArchive(props.accessToken, archiveKey);
    if (result.success) {
      showToast(t('msg.restore_result', { count: String(result.restored) }), 'success');
      await loadDatabaseStats();
    } else {
      showToast(getErrorMessage(result, t('msg.restore_failed')), 'error');
    }
  } catch (err) {
    showToast(getErrorMessage(err, t('msg.restore_failed')), 'error');
  } finally {
    isRestoring.value = false;
  }
}

async function loadDatabaseTables() {
  isLoadingTables.value = true;
  try {
    const result = await getDatabaseTables(props.accessToken);
    if (result.success) {
      databaseTables.value = result.tables;
    } else {
      showToast(getErrorMessage(result, t('msg.load_tables_failed')), 'error');
    }
  } catch (err) {
    showToast(getErrorMessage(err, t('msg.load_tables_failed')), 'error');
  } finally {
    isLoadingTables.value = false;
  }
}

async function handleDeleteTable(tableName: string) {
  if (isDeletingTable.value) return;
  if (!confirm(t('confirm.delete_table', { table: tableName }))) {
    return;
  }

  isDeletingTable.value = true;
  try {
    const result = await deleteDatabaseTable(props.accessToken, tableName);
    if (result.success) {
      showToast(t('msg.table_deleted', { table: tableName }), 'success');
      await loadDatabaseTables();
    } else {
      showToast(result.error || t('msg.delete_table_failed'), 'error');
    }
  } catch (err) {
    showToast(getErrorMessage(err, t('msg.delete_table_failed')), 'error');
  } finally {
    isDeletingTable.value = false;
  }
}

async function handleCleanupTables() {
  if (isCleaningTables.value) return;
  if (!confirm(t('confirm.cleanup_tables'))) {
    return;
  }

  isCleaningTables.value = true;
  try {
    const result = await cleanupOrphanTables(props.accessToken);
    if (result.success) {
      if (result.deletedTables.length > 0) {
        showToast(
          t('msg.tables_deleted', { count: String(result.deletedTables.length) }),
          'success'
        );
      } else {
        showToast(t('msg.no_tables_to_delete'), 'success');
      }
      await loadDatabaseTables();
    } else {
      showToast(getErrorMessage(result, t('msg.cleanup_failed')), 'error');
    }
  } catch (err) {
    showToast(getErrorMessage(err, t('msg.cleanup_failed')), 'error');
  } finally {
    isCleaningTables.value = false;
  }
}

onMounted(() => {
  loadDatabaseStats();
  loadArchives();
});
</script>

<template>
  <div class="settings-panel" :class="{ dark: isDark }">
    <h3>🗃️ {{ t('label.database_management') }}</h3>

    <!-- 数据库统计 -->
    <div class="settings-card">
      <h4>📊 {{ t('label.database_stats') }}</h4>
      <div class="stats-grid" v-if="!isLoadingStats">
        <div class="stat-item">
          <span class="stat-value">{{ databaseStats.pushHistoryCount.toLocaleString() }}</span>
          <span class="stat-label">{{ t('label.push_history_count') }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ databaseStats.auditLogsCount.toLocaleString() }}</span>
          <span class="stat-label">{{ t('label.audit_logs_count') }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ databaseStats.usersCount.toLocaleString() }}</span>
          <span class="stat-label">{{ t('label.users_count') }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ databaseStats.estimatedSize }}</span>
          <span class="stat-label">{{ t('label.estimated_size') }}</span>
        </div>
      </div>
      <div v-else class="loading">{{ t('msg.loading_dots') }}</div>
      <button class="btn btn-secondary" @click="loadDatabaseStats" :disabled="isLoadingStats">
        🔄 {{ t('label.refresh_stats') }}
      </button>
    </div>

    <!-- 手动清理（使用系统设置中的配置） -->
    <div class="settings-card">
      <h4>🧹 {{ t('label.manual_cleanup') }}</h4>
      <div class="setting-hint">{{ t('hint.manual_cleanup') }}</div>
      <button class="btn btn-warning" @click="handleCleanup" :disabled="isCleaningUp">
        {{ isCleaningUp ? t('msg.cleaning_dots') : '🗑️ ' + t('button.cleanup_now') }}
      </button>
    </div>

    <!-- 数据归档 -->
    <div class="settings-card">
      <h4>📦 {{ t('label.data_archive') }}</h4>
      <div class="setting-hint">
        {{ t('hint.data_archive') }}
      </div>
      <button class="btn btn-primary" @click="handleArchive" :disabled="isArchiving">
        {{ isArchiving ? t('msg.archiving_dots') : '📦 ' + t('button.archive_to_r2') }}
      </button>
    </div>

    <!-- 归档列表 -->
    <div class="settings-card" v-if="archives.length > 0">
      <h4>📁 {{ t('label.archive_list') }}</h4>
      <div class="archive-list">
        <div v-for="archive in archives" :key="archive.key" class="archive-item">
          <div class="archive-info">
            <span class="archive-key">{{ archive.key }}</span>
            <span class="archive-meta"
              >{{ (archive.size / 1024).toFixed(1) }} KB | {{ archive.archivedAt }}</span
            >
          </div>
          <button class="btn btn-small" @click="handleRestore(archive.key)" :disabled="isRestoring">
            {{ t('label.restore') }}
          </button>
        </div>
      </div>
    </div>

    <!-- 数据库表管理 -->
    <div class="settings-card">
      <h4>📋 {{ t('label.table_management') }}</h4>
      <div class="setting-hint">
        {{ t('hint.table_management') }}
      </div>
      <div class="table-actions">
        <button class="btn btn-secondary" @click="loadDatabaseTables" :disabled="isLoadingTables">
          {{ isLoadingTables ? t('msg.loading_dots') : '🔄 ' + t('button.refresh_tables') }}
        </button>
        <button
          class="btn btn-warning"
          @click="handleCleanupTables"
          :disabled="isCleaningTables || isLoadingTables"
        >
          {{ isCleaningTables ? t('msg.cleaning_dots') : '🧹 ' + t('button.cleanup_tables') }}
        </button>
      </div>
      <div class="table-list" v-if="!isLoadingTables">
        <div
          v-for="table in databaseTables"
          :key="table.name"
          class="table-item"
          :class="{ 'table-safe': table.isSafe, 'table-deletable': table.shouldDelete }"
        >
          <div class="table-info">
            <span class="table-name">{{ table.name }}</span>
            <span class="table-meta">
              <span v-if="table.rowCount !== undefined"
                >{{ table.rowCount.toLocaleString() }} {{ t('label.rows') }}</span
              >
              <span v-if="table.isSafe" class="badge badge-safe">{{ t('label.safe') }}</span>
              <span v-if="table.shouldDelete" class="badge badge-deletable">{{
                t('label.deletable')
              }}</span>
            </span>
          </div>
          <button
            v-if="!table.isSafe"
            class="btn btn-small btn-danger"
            @click="handleDeleteTable(table.name)"
            :disabled="isDeletingTable"
          >
            {{ t('button.delete') }}
          </button>
        </div>
      </div>
      <div v-else class="loading">{{ t('msg.loading_dots') }}</div>
    </div>
  </div>
</template>

<style scoped>
/* ==================== 数据库管理样式 ==================== */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 10px;
  text-align: center;
}

.dark .stat-item {
  background: var(--bg-secondary, #2a2a3a);
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #667eea;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary, #666);
}

.dark .stat-label {
  color: var(--text-secondary, #999);
}

.settings-panel {
  animation: fadeIn 0.2s ease;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 12px;
  padding: 16px;
  min-height: fit-content;
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

.settings-panel.dark .settings-card {
  background: var(--bg-panel, #2d2d2d);
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

.setting-hint {
  font-size: 12px;
  color: var(--text-secondary, #666);
  padding: 12px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 8px;
  margin-top: 12px;
}

.settings-panel.dark .setting-hint {
  background: var(--bg-secondary, #2a2a3a);
  color: var(--text-secondary, #999);
}

.settings-card .btn-secondary {
  margin-top: 12px;
  padding: 10px 20px;
  background: var(--bg-secondary, #f5f5f5);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.settings-card .btn-secondary:hover {
  background: var(--bg-secondary, #ebebeb);
}

.dark .settings-card .btn-secondary {
  background: var(--bg-secondary, #2a2a3a);
  border-color: var(--border-color, #4c4c4c);
  color: var(--text-primary, #e0e0e0);
}

.dark .settings-card .btn-secondary:hover {
  background: var(--bg-secondary, #3a3a4a);
}

.settings-card .btn-primary {
  margin-top: 16px;
  width: 100%;
  padding: 12px 24px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 8px;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  border: none;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
}

.settings-card .btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
}

.settings-card .btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-warning {
  margin-top: 16px;
  width: 100%;
  padding: 12px 24px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 8px;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-warning:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
}

.btn-warning:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-small {
  padding: 6px 12px;
  font-size: 12px;
  background: var(--bg-secondary, #f5f5f5);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.dark .btn-small {
  background: var(--bg-secondary, #2a2a3a);
  border-color: var(--border-color, #4c4c4c);
  color: var(--text-primary, #e0e0e0);
}

.archive-list {
  max-height: 300px;
  overflow-y: auto;
}

.archive-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 8px;
  margin-bottom: 8px;
}

.dark .archive-item {
  background: var(--bg-secondary, #2a2a3a);
}

.archive-item:last-child {
  margin-bottom: 0;
}

.archive-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.archive-key {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #1a1a2e);
  word-break: break-all;
}

.dark .archive-key {
  color: var(--text-primary, #e0e0e0);
}

.archive-meta {
  font-size: 11px;
  color: var(--text-secondary, #666);
}

.dark .archive-meta {
  color: var(--text-secondary, #999);
}

.loading {
  text-align: center;
  padding: 20px;
  color: var(--text-secondary, #666);
}

/* ==================== 数据库表管理样式 ==================== */
.table-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.table-actions .btn-secondary {
  margin-top: 0;
  width: auto;
}

.table-list {
  max-height: 400px;
  overflow-y: auto;
}

.table-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-secondary, #f5f5f5);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  margin-bottom: 8px;
  transition: all 0.2s;
}

.table-item:hover {
  border-color: var(--border-color, #d0d0d0);
  background: var(--bg-tertiary, #e8e8e8);
}

.table-item.table-safe {
  border-left: 3px solid #10b981;
}

.table-item.table-deletable {
  border-left: 3px solid #f59e0b;
}

.dark .table-item {
  background: var(--bg-secondary, #2a2a3a);
  border-color: var(--border-color, #4c4c4c);
}

.dark .table-item:hover {
  background: var(--bg-tertiary, #3a3a4a);
  border-color: var(--border-color, #5c5c5c);
}

.table-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.table-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
  word-break: break-all;
}

.dark .table-name {
  color: var(--text-primary, #e0e0e0);
}

.table-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.badge {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.badge-safe {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.badge-deletable {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
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
