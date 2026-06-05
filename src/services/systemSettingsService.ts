import type { Env } from '../types';

export interface SystemSettings {
  turnstile_enabled?: boolean;
  turnstile_site_key?: string;
  turnstile_secret_key?: string;
  cleanup_enabled?: boolean;
  cleanup_push_history_days?: number;
  cleanup_audit_log_days?: number;
  cleanup_batch_size?: number;
  cors_allowed_origins?: string[];
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
    await this.env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`
    ).run();
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
      const results = await this.env.DB.prepare('SELECT key, value FROM system_settings').all<{
        key: string;
        value: string;
      }>();
      const settings: SystemSettings = {};

      for (const row of results.results || []) {
        try {
          settings[row.key as keyof SystemSettings] = JSON.parse(row.value);
        } catch {
          settings[row.key as keyof SystemSettings] = row.value as any;
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
  }> {
    const settings = await this.getAllSettings();

    // 默认值
    return {
      enabled: settings.cleanup_enabled ?? true,
      pushHistoryDays: settings.cleanup_push_history_days ?? 30,
      auditLogDays: settings.cleanup_audit_log_days ?? 90,
      batchSize: settings.cleanup_batch_size ?? 100,
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
}
