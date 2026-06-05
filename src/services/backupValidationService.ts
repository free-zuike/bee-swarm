// ============================================
// 备份验证服务
// 确保备份数据的完整性和可恢复性
// ============================================

import type { Env } from '../types';

/**
 * 备份验证状态
 */
export type BackupValidationStatus = 'valid' | 'invalid' | 'partial' | 'unknown';

/**
 * 验证结果
 */
export interface ValidationResult {
  status: BackupValidationStatus;
  backupId: string;
  checks: ValidationCheck[];
  summary: ValidationSummary;
}

/**
 * 单个验证检查
 */
export interface ValidationCheck {
  name: string;
  passed: boolean;
  message: string;
  details?: any;
}

/**
 * 验证摘要
 */
export interface ValidationSummary {
  totalTables: number;
  passedTables: number;
  failedTables: number;
  totalRecords: number;
  checksumMatch: boolean;
  backupDate: string;
  estimatedRestoreTime: string;
}

/**
 * 备份验证服务类
 */
export class BackupValidationService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * 验证备份文件
   */
  async validateBackup(backupContent: string): Promise<ValidationResult> {
    const checks: ValidationCheck[] = [];
    let totalRecords = 0;
    let totalTables = 0;
    let passedTables = 0;
    let checksumMatch = false;

    try {
      // 检查1: 验证 JSON 格式
      const jsonCheck = await this.checkJsonFormat(backupContent);
      checks.push(jsonCheck);

      if (!jsonCheck.passed) {
        return this.buildResult('invalid', checks, totalTables, passedTables, totalRecords, checksumMatch);
      }

      const backupData = JSON.parse(backupContent);

      // 检查2: 验证备份格式版本
      const versionCheck = this.checkBackupVersion(backupData);
      checks.push(versionCheck);

      // 检查3: 验证必需字段
      const fieldsCheck = this.checkRequiredFields(backupData);
      checks.push(fieldsCheck);

      // 检查4: 验证 checksum
      const checksumCheck = await this.verifyChecksum(backupData, backupContent);
      checks.push(checksumCheck);
      checksumMatch = checksumCheck.passed;

      // 检查5: 验证表结构
      const tablesCheck = await this.validateTableStructure(backupData);
      checks.push(tablesCheck);

      // 检查6: 验证数据完整性
      const dataCheck = await this.validateDataIntegrity(backupData);
      checks.push(dataCheck);

      // 统计信息
      const tables = backupData.tables || [];
      totalTables = tables.length;
      
      tables.forEach((table: any) => {
        const records = table.data?.length || 0;
        totalRecords += records;
        if (records > 0) {
          passedTables++;
        }
      });

      // 根据检查结果确定状态
      const failedChecks = checks.filter((c) => !c.passed);
      const hasCriticalFailure = failedChecks.some(
        (c) => ['JSON格式验证', '必需字段检查', '表结构验证'].includes(c.name)
      );

      let status: BackupValidationStatus = 'valid';
      if (hasCriticalFailure) {
        status = 'invalid';
      } else if (failedChecks.length > 0) {
        status = 'partial';
      }

      return this.buildResult(status, checks, totalTables, passedTables, totalRecords, checksumMatch, backupData.created_at);
    } catch (error) {
      checks.push({
        name: '验证异常',
        passed: false,
        message: `验证过程中发生错误: ${(error as Error).message}`,
      });

      return this.buildResult('invalid', checks, totalTables, passedTables, totalRecords, checksumMatch);
    }
  }

  /**
   * 验证 JSON 格式
   */
  private async checkJsonFormat(content: string): Promise<ValidationCheck> {
    try {
      JSON.parse(content);
      return {
        name: 'JSON格式验证',
        passed: true,
        message: 'JSON 格式有效',
      };
    } catch (error) {
      return {
        name: 'JSON格式验证',
        passed: false,
        message: `JSON 解析失败: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 验证备份版本
   */
  private checkBackupVersion(backupData: any): ValidationCheck {
    const version = backupData.version || '1.0';
    
    // 支持的版本
    const supportedVersions = ['1.0', '1.1', '2.0'];
    
    if (supportedVersions.includes(version)) {
      return {
        name: '备份版本检查',
        passed: true,
        message: `备份版本 ${version} 受支持`,
        details: { version },
      };
    }

    return {
      name: '备份版本检查',
      passed: false,
      message: `备份版本 ${version} 不受支持，支持的版本: ${supportedVersions.join(', ')}`,
      details: { version, supportedVersions },
    };
  }

  /**
   * 验证必需字段
   */
  private checkRequiredFields(backupData: any): ValidationCheck {
    const requiredFields = ['version', 'created_at', 'tables'];
    
    const missingFields = requiredFields.filter((field) => !(field in backupData));
    
    if (missingFields.length === 0) {
      return {
        name: '必需字段检查',
        passed: true,
        message: '所有必需字段都存在',
      };
    }

    return {
      name: '必需字段检查',
      passed: false,
      message: `缺少必需字段: ${missingFields.join(', ')}`,
      details: { missingFields },
    };
  }

  /**
   * 验证 checksum
   */
  private async verifyChecksum(backupData: any, originalContent: string): Promise<ValidationCheck> {
    const storedChecksum = backupData.checksum;
    
    if (!storedChecksum) {
      return {
        name: 'Checksum 验证',
        passed: false,
        message: '备份中没有包含 checksum',
      };
    }

    try {
      // 重新计算 checksum
      const computedChecksum = await this.computeChecksum(originalContent);
      
      if (computedChecksum === storedChecksum) {
        return {
          name: 'Checksum 验证',
          passed: true,
          message: 'Checksum 验证通过',
          details: { computedChecksum, storedChecksum },
        };
      }

      return {
        name: 'Checksum 验证',
        passed: false,
        message: 'Checksum 不匹配，备份可能已损坏或被篡改',
        details: { computedChecksum, storedChecksum },
      };
    } catch (error) {
      return {
        name: 'Checksum 验证',
        passed: false,
        message: `计算 checksum 失败: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 验证表结构
   */
  private async validateTableStructure(backupData: any): Promise<ValidationCheck> {
    const tables = backupData.tables || [];
    
    if (!Array.isArray(tables)) {
      return {
        name: '表结构验证',
        passed: false,
        message: 'tables 字段必须是数组',
      };
    }

    const requiredTableFields = ['name', 'schema', 'data'];
    const invalidTables: string[] = [];

    tables.forEach((table: any, index: number) => {
      const missingFields = requiredTableFields.filter((field) => !(field in table));
      if (missingFields.length > 0) {
        invalidTables.push(`表 ${index}: ${table.name || '(无名)'} 缺少字段: ${missingFields.join(', ')}`);
      }
    });

    if (invalidTables.length === 0) {
      return {
        name: '表结构验证',
        passed: true,
        message: `所有 ${tables.length} 个表结构有效`,
        details: { tableCount: tables.length },
      };
    }

    return {
      name: '表结构验证',
      passed: false,
      message: `发现 ${invalidTables.length} 个表结构无效`,
      details: { invalidTables },
    };
  }

  /**
   * 验证数据完整性
   */
  private async validateDataIntegrity(backupData: any): Promise<ValidationCheck> {
    const tables = backupData.tables || [];
    let issues: string[] = [];

    for (const table of tables) {
      const data = table.data || [];
      const schema = table.schema || [];

      // 检查数据记录数
      if (data.length === 0 && table.name !== 'push_history') {
        issues.push(`表 ${table.name} 没有数据记录`);
      }

      // 检查每条记录是否符合 schema
      for (let i = 0; i < Math.min(data.length, 100); i++) {
        const record = data[i];
        const missingFields = schema
          .filter((col: any) => col.notNull)
          .map((col: any) => col.name)
          .filter((name: string) => !(name in record));

        if (missingFields.length > 0) {
          issues.push(`表 ${table.name} 记录 ${i} 缺少必填字段: ${missingFields.join(', ')}`);
          break;
        }
      }
    }

    if (issues.length === 0) {
      return {
        name: '数据完整性验证',
        passed: true,
        message: '数据完整性验证通过',
      };
    }

    return {
      name: '数据完整性验证',
      passed: issues.length < tables.length,
      message: `发现 ${issues.length} 个数据完整性问题`,
      details: { issues: issues.slice(0, 10) },
    };
  }

  /**
   * 计算 checksum
   */
  private async computeChecksum(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    
    // 使用 SubtleCrypto 计算 SHA-256
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const hash = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }

    // 后备方案：简单的字符串哈希
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(64, '0').substring(0, 64);
  }

  /**
   * 构建验证结果
   */
  private buildResult(
    status: BackupValidationStatus,
    checks: ValidationCheck[],
    totalTables: number,
    passedTables: number,
    totalRecords: number,
    checksumMatch: boolean,
    backupDate?: string
  ): ValidationResult {
    // 估算恢复时间（假设每条记录约 1ms）
    const estimatedSeconds = Math.max(1, Math.ceil(totalRecords / 1000));
    const estimatedRestoreTime = estimatedSeconds < 60
      ? `${estimatedSeconds} 秒`
      : `${Math.ceil(estimatedSeconds / 60)} 分钟`;

    return {
      status,
      backupId: `backup_${Date.now()}`,
      checks,
      summary: {
        totalTables,
        passedTables,
        failedTables: totalTables - passedTables,
        totalRecords,
        checksumMatch,
        backupDate: backupDate || '未知',
        estimatedRestoreTime,
      },
    };
  }

  /**
   * 批量验证多个备份
   */
  async batchValidateBackups(backupContents: string[]): Promise<ValidationResult[]> {
    const results = await Promise.all(
      backupContents.map((content) => this.validateBackup(content))
    );
    return results;
  }

  /**
   * 验证备份与当前数据库的兼容性
   */
  async validateCompatibility(backupContent: string): Promise<{
    compatible: boolean;
    issues: string[];
    requiredMigrations: string[];
  }> {
    const issues: string[] = [];
    const requiredMigrations: string[] = [];

    try {
      const backupData = JSON.parse(backupContent);
      const backupVersion = backupData.version || '1.0';
      
      // 检查版本兼容性
      const currentVersion = '2.0';
      
      if (backupVersion !== currentVersion) {
        issues.push(`备份版本 ${backupVersion} 与当前版本 ${currentVersion} 不同`);
        
        // 检查是否需要迁移
        if (backupVersion === '1.0') {
          requiredMigrations.push('v1.0-to-v2.0');
        }
      }

      // 检查表兼容性
      const backupTables = backupData.tables || [];
      const expectedTables = ['users', 'channel_configs', 'push_templates', 'push_history'];
      
      const backupTableNames = backupTables.map((t: any) => t.name);
      const missingTables = expectedTables.filter((t) => !backupTableNames.includes(t));
      
      if (missingTables.length > 0) {
        issues.push(`缺少必需的表: ${missingTables.join(', ')}`);
      }

      return {
        compatible: issues.length === 0,
        issues,
        requiredMigrations,
      };
    } catch (error) {
      return {
        compatible: false,
        issues: [`无法解析备份内容: ${(error as Error).message}`],
        requiredMigrations: [],
      };
    }
  }

  /**
   * 创建备份验证报告
   */
  async generateValidationReport(backupContent: string): Promise<string> {
    const result = await this.validateBackup(backupContent);
    const compatResult = await this.validateCompatibility(backupContent);

    let report = `# 备份验证报告\n\n`;
    report += `## 基本信息\n\n`;
    report += `- 验证时间: ${new Date().toISOString()}\n`;
    report += `- 备份日期: ${result.summary.backupDate}\n`;
    report += `- 备份状态: ${result.status === 'valid' ? '✅ 有效' : result.status === 'partial' ? '⚠️ 部分有效' : '❌ 无效'}\n\n`;

    report += `## 验证摘要\n\n`;
    report += `- 数据表数量: ${result.summary.totalTables}\n`;
    report += `- 通过验证: ${result.summary.passedTables}\n`;
    report += `- 记录总数: ${result.summary.totalRecords}\n`;
    report += `- Checksum 匹配: ${result.summary.checksumMatch ? '是' : '否'}\n`;
    report += `- 预计恢复时间: ${result.summary.estimatedRestoreTime}\n\n`;

    report += `## 详细检查结果\n\n`;
    result.checks.forEach((check) => {
      report += `${check.passed ? '✅' : '❌'} ${check.name}: ${check.message}\n`;
      if (check.details) {
        report += `  详情: ${JSON.stringify(check.details, null, 2)}\n`;
      }
    });

    report += `\n## 兼容性检查\n\n`;
    report += `- 与当前版本兼容: ${compatResult.compatible ? '是' : '否'}\n`;
    if (compatResult.issues.length > 0) {
      report += `- 问题: ${compatResult.issues.join(', ')}\n`;
    }
    if (compatResult.requiredMigrations.length > 0) {
      report += `- 需要迁移: ${compatResult.requiredMigrations.join(', ')}\n`;
    }

    return report;
  }
}
