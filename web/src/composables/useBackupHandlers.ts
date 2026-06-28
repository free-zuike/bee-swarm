import { useTranslation } from '@/i18n';
import {
  getBackupEndpoints,
  addBackupEndpoint,
  updateBackupEndpoint,
  deleteBackupEndpoint,
  testBackupEndpoint,
  listBackupsFromEndpoint,
  restoreBackupFromEndpoint,
  deleteBackupFromEndpoint,
  downloadBackupFromEndpoint,
  backupAll,
  backupSingleEndpoint,
} from '@/api';
import type { BackupEndpoint } from '@/types';
import type { Ref } from 'vue';
import type BackupManager from '@/components/admin/BackupManager.vue';

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}

export interface BackupHandlersOptions {
  accessToken: Ref<string>;
  backupManagerRef: Ref<InstanceType<typeof BackupManager> | null>;
  loadChannels: () => Promise<void>;
  loadHistory: (page?: number) => Promise<void>;
}

export function useBackupHandlers({
  accessToken,
  backupManagerRef,
  loadChannels,
  loadHistory,
}: BackupHandlersOptions) {
  const t = useTranslation();

  async function handleLoadEndpoints() {
    try {
      const data = await getBackupEndpoints(accessToken.value, true);
      backupManagerRef.value?.setEndpoints(data.endpoints || []);
    } catch (err: unknown) {
      console.error(t('msg.list_backups_failed') + ':', err);
      backupManagerRef.value?.handleError(
        getErrorMessage(err, t('msg.list_backups_failed')),
        'save'
      );
    }
  }

  async function handleAddEndpoint(endpoint: Omit<BackupEndpoint, 'id'>) {
    try {
      const result = await addBackupEndpoint(accessToken.value, endpoint);
      if (result.success) {
        await handleLoadEndpoints();
        backupManagerRef.value?.selectEndpoint(result.endpoint.id);
        backupManagerRef.value?.handleAddResult(result.endpoint, t('msg.create_endpoint_success'));
      }
    } catch (err: unknown) {
      backupManagerRef.value?.handleError(getErrorMessage(err, t('msg.operation_failed')), 'save');
    }
  }

  async function handleUpdateEndpoint(id: string, endpoint: Omit<BackupEndpoint, 'id'>) {
    try {
      const result = await updateBackupEndpoint(accessToken.value, id, endpoint);
      if (result.success) {
        backupManagerRef.value?.handleUpdateResult(
          result.endpoint,
          t('msg.update_endpoint_success')
        );
      }
    } catch (err: unknown) {
      backupManagerRef.value?.handleError(getErrorMessage(err, t('msg.operation_failed')), 'save');
    }
  }

  async function handleDeleteEndpoint(id: string) {
    try {
      await deleteBackupEndpoint(accessToken.value, id);
      backupManagerRef.value?.handleDeleteResult(t('msg.delete_endpoint_success'));
    } catch (err: unknown) {
      backupManagerRef.value?.handleError(
        getErrorMessage(err, t('msg.delete_failed', { message: '' })),
        'delete'
      );
    }
  }

  async function handleTestEndpoint(id: string | null, endpoint: Partial<BackupEndpoint>) {
    try {
      const result = await testBackupEndpoint(accessToken.value, id || 'new', {
        type: endpoint.type,
        config: endpoint.config as unknown as Record<string, unknown>,
      });
      backupManagerRef.value?.handleTestResult(result.success, result);
    } catch (err: unknown) {
      backupManagerRef.value?.handleError(getErrorMessage(err, t('msg.test_failed')));
    }
  }

  async function handleListBackups(id: string) {
    try {
      const data = await listBackupsFromEndpoint(accessToken.value, id, true);
      backupManagerRef.value?.setBackups(data.backups || []);
    } catch (err: unknown) {
      console.error('加载备份列表失败:', err);
      backupManagerRef.value?.setBackups([]);
    }
  }

  async function handleRestoreBackup(id: string, key: string) {
    try {
      const result = await restoreBackupFromEndpoint(accessToken.value, id, key);
      backupManagerRef.value?.handleTestResult(result.success, result);
      if (result.success) {
        await loadChannels();
        await loadHistory();
        await handleLoadEndpoints();
      }
    } catch (err: unknown) {
      backupManagerRef.value?.handleError(getErrorMessage(err, 'msg.restore_failed'));
    }
  }

  async function handleDeleteBackup(id: string, key: string) {
    try {
      await deleteBackupFromEndpoint(accessToken.value, id, key);
      const data = await listBackupsFromEndpoint(accessToken.value, id);
      backupManagerRef.value?.setBackups(data.backups || []);
      backupManagerRef.value?.handleTestResult(true, { message: 'msg.delete_backup_success' });
    } catch (err: unknown) {
      backupManagerRef.value?.handleError(getErrorMessage(err, 'msg.delete_failed'));
    }
  }

  async function handleDownloadBackup(id: string, key: string) {
    try {
      await downloadBackupFromEndpoint(accessToken.value, id, key);
    } catch (err: unknown) {
      backupManagerRef.value?.handleError(getErrorMessage(err, 'msg.download_failed'));
    }
  }

  async function handleBatchDeleteBackups(items: Array<{ endpointId: string; key: string }>) {
    try {
      let successCount = 0;
      let failCount = 0;

      for (const item of items) {
        try {
          await deleteBackupFromEndpoint(accessToken.value, item.endpointId, item.key);
          successCount++;
        } catch {
          failCount++;
        }
      }

      backupManagerRef.value?.handleBatchDeleteComplete();

      if (failCount === 0) {
        backupManagerRef.value?.handleTestResult(true, {
          message: 'msg.batch_delete_success',
          count: successCount,
        });
      } else {
        backupManagerRef.value?.handleTestResult(successCount > 0, {
          message: 'msg.batch_delete_partial',
          success: successCount,
          failed: failCount,
        });
      }
    } catch (err: unknown) {
      backupManagerRef.value?.handleError(getErrorMessage(err, t('msg.batch_delete_failed')));
    }
  }

  async function handleBackupAll() {
    try {
      const result = await backupAll(accessToken.value);
      const successCount = result.results.filter((r) => r.success).length;
      const totalCount = result.results.length;

      if (successCount === totalCount) {
        backupManagerRef.value?.handleBackupAllResult(
          t('msg.backup_completed', { count: String(totalCount) }),
          'success'
        );
      } else {
        const failed = result.results.filter((r) => !r.success);
        const details = failed
          .map((r) => {
            const endpointName = r.endpointName || t('common.unknown');
            const errorInfo = r.errorMessage ? ` (${r.errorMessage})` : '';
            return `${endpointName}: ${r.message}${errorInfo}`;
          })
          .join('; ');
        backupManagerRef.value?.handleBackupAllResult(
          t('msg.backup_partial', { success: String(successCount), total: String(totalCount) }) +
            ' — ' +
            details,
          'error'
        );
      }

      await handleLoadEndpoints();
    } catch (err: unknown) {
      backupManagerRef.value?.handleError(getErrorMessage(err, t('msg.operation_failed')));
    }
  }

  async function handleBackupSingle(id: string) {
    try {
      const result = await backupSingleEndpoint(accessToken.value, id);
      if (result.success) {
        backupManagerRef.value?.handleBackupSingleResult(
          t('msg.backup_success', { endpointName: result.endpointName || t('common.unknown') }),
          'success'
        );
      } else {
        backupManagerRef.value?.handleBackupSingleResult(
          t('msg.backup_failed', {
            endpointName: result.endpointName || t('common.unknown'),
            message: result.message,
          }),
          'error'
        );
      }
      await handleLoadEndpoints();
    } catch (err: unknown) {
      backupManagerRef.value?.handleError(getErrorMessage(err, t('msg.operation_failed')));
    }
  }

  return {
    handleLoadEndpoints,
    handleAddEndpoint,
    handleUpdateEndpoint,
    handleDeleteEndpoint,
    handleTestEndpoint,
    handleListBackups,
    handleRestoreBackup,
    handleDeleteBackup,
    handleDownloadBackup,
    handleBatchDeleteBackups,
    handleBackupAll,
    handleBackupSingle,
  };
}
