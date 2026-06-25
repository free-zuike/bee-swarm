import type { Env } from '../types';

export interface SystemSettings {
  turnstile_enabled?: boolean;
  turnstile_site_key?: string;
  turnstile_secret_key?: string;
  cleanup_enabled?: boolean;
  cleanup_push_history_days?: number;
  cleanup_audit_log_days?: number;
  cleanup_batch_size?: number;
  cleanup_auto_delete_orphan_tables?: boolean;
  cors_allowed_origins?: string[];
  smtp_host?: string;
  smtp_port?: string;
  smtp_username?: string;
  smtp_password?: string;
  mail_from?: string;
}

export class SystemSettingsService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  private checkDB(): void {
    if (!this.env.DB) {
      throw new Error('D1 数据库未配置');
    }
  }

  /** 确保系统设置表存在 */
  async ensureTable(): Promise<void> {
    this.checkDB();
    try {
      await this.env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS system_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`
      ).run();
    } catch {
      // 表可能已存在，忽略错误
    }
  }

  /** 获取单个设置 */
  async getSetting(key: string): Promise<string | null> {
    this.checkDB();
    try {
      const result = await this.env.DB.prepare('SELECT value FROM system_settings WHERE key = ?')
        .bind(key)
        .first<{ value: string }>();
      return result?.value || null;
    } catch {
      return null;
    }
  }

  /** 设置单个设置 */
  async setSetting(key: string, value: string): Promise<void> {
    this.checkDB();
    const now = new Date().toISOString();
    await this.env.DB.prepare(
      `INSERT INTO system_settings (key, value, updated_at) 
       VALUES (?, ?, ?) 
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
      .bind(key, value, now)
      .run();
  }

  /** 获取所有系统设置 */
  async getAllSettings(): Promise<SystemSettings> {
    this.checkDB();
    try {
      // 先确保表存在
      await this.ensureTable();

      const results = await this.env.DB.prepare('SELECT key, value FROM system_settings').all<{
        key: string;
        value: string;
      }>();
      const settings: SystemSettings = {};

      for (const row of results.results || []) {
        try {
          (settings as Record<string, unknown>)[row.key] = JSON.parse(row.value);
        } catch {
          (settings as Record<string, unknown>)[row.key] = row.value;
        }
      }

      return settings;
    } catch {
      return {};
    }
  }

  /** 批量保存系统设置 */
  async saveSettings(settings: Partial<SystemSettings>): Promise<void> {
    this.checkDB();
    for (const [key, value] of Object.entries(settings)) {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      await this.setSetting(key, stringValue);
    }
  }

  /** 获取 Turnstile 配置 */
  async getTurnstileConfig(): Promise<{ enabled: boolean; siteKey?: string; secretKey?: string }> {
    const settings = await this.getAllSettings();

    // 如果未在数据库中配置，回退到环境变量
    const enabled = settings.turnstile_enabled ?? !!this.env.TURNSTILE_SECRET_KEY;
    const siteKey = settings.turnstile_site_key || this.env.TURNSTILE_SITE_KEY;
    const secretKey = settings.turnstile_secret_key || this.env.TURNSTILE_SECRET_KEY;

    return {
      enabled,
      siteKey: enabled ? siteKey : undefined,
      secretKey: enabled ? secretKey : undefined,
    };
  }

  /** 获取清理配置 */
  async getCleanupConfig(): Promise<{
    enabled: boolean;
    pushHistoryDays: number;
    auditLogDays: number;
    batchSize: number;
    autoDeleteOrphanTables: boolean;
  }> {
    const settings = await this.getAllSettings();

    // 默认值
    return {
      enabled: settings.cleanup_enabled ?? true,
      pushHistoryDays: settings.cleanup_push_history_days ?? 30,
      auditLogDays: settings.cleanup_audit_log_days ?? 90,
      batchSize: settings.cleanup_batch_size ?? 100,
      autoDeleteOrphanTables: settings.cleanup_auto_delete_orphan_tables ?? false,
    };
  }

  /** 获取 CORS 允许的来源列表 */
  async getCORSConfig(): Promise<string[]> {
    const settings = await this.getAllSettings();

    // 合并数据库配置和环境变量配置
    const dbOrigins = settings.cors_allowed_origins || [];
    const envOrigins = this.env.ALLOWED_ORIGINS?.split(',').filter(Boolean) || [];

    // 去重并返回
    const allOrigins = [...new Set([...dbOrigins, ...envOrigins])];

    return allOrigins;
  }

  /** 获取 SMTP 配置（优先使用数据库配置，回退到环境变量） */
  async getSMTPConfig(): Promise<{
    host?: string;
    port?: string;
    username?: string;
    password?: string;
    mailFrom?: string;
  }> {
    try {
      await this.ensureTable();
      const settings = await this.getAllSettings();

      return {
        host: settings.smtp_host || this.env.SMTP_HOST,
        port: settings.smtp_port || this.env.SMTP_PORT,
        username: settings.smtp_username || this.env.SMTP_USERNAME,
        password: settings.smtp_password || this.env.SMTP_PASSWORD,
        mailFrom: settings.mail_from || this.env.MAIL_FROM,
      };
    } catch {
      // 数据库不可用时回退到环境变量
      return {
        host: this.env.SMTP_HOST,
        port: this.env.SMTP_PORT,
        username: this.env.SMTP_USERNAME,
        password: this.env.SMTP_PASSWORD,
        mailFrom: this.env.MAIL_FROM,
      };
    }
  }
}
