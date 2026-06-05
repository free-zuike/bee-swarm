import type { Env } from '../types';

export type UserRole = 'admin' | 'user' | 'viewer';

export interface AIProviderConfig {
  api_key?: string;
  api_url?: string;
  model_name?: string;
}

export interface CustomAIProvider {
  id: string;
  name: string;
  icon: string;
}

export interface UserSettings {
  cache_ttl_backup?: number;
  cache_ttl_channels?: number;
  cache_ttl_templates?: number;
  cache_ttl_groups?: number;
  cache_ttl_scheduled?: number;
  ai_model?: string;
  ai_enabled?: boolean;
  ai_provider?: string;
  custom_ai_providers?: CustomAIProvider[];
  ai_provider_configs?: Record<string, AIProviderConfig>;
  ai_api_key?: string;
  ai_api_url?: string;
  ai_model_name?: string;
}

export interface User {
  id: string;
  email: string;
  password: string;
  token?: string | null;
  token_expires_at?: number | null;
  refresh_token?: string | null;
  refresh_token_expires_at?: number | null;
  apikey?: string | null;
  apikey_expires_at?: number | null;
  role?: UserRole;
  disabled?: number;
  disabled_reason?: string | null;
  avatar_url?: string | null;
  use_avatar_as_popup?: number;
  cache_settings?: string | null;
  ai_settings?: string | null;
  password_reset_token?: string | null;
  password_reset_expires_at?: number | null;
  created_at: string;
  updated_at: string;
  // 新独立列
  ai_enabled?: number;
  ai_provider?: string;
  ai_model?: string;
  ai_api_key?: string;
  ai_api_url?: string;
  ai_model_name?: string;
  cache_ttl_backup?: number;
  cache_ttl_channels?: number;
  cache_ttl_templates?: number;
  cache_ttl_groups?: number;
  cache_ttl_scheduled?: number;
}

export interface CacheSettings {
  cache_ttl_backup?: number;
  cache_ttl_channels?: number;
  cache_ttl_templates?: number;
  cache_ttl_groups?: number;
  cache_ttl_scheduled?: number;
}

export interface AITool {
  id: string;
  name: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    description: string;
    required: boolean;
  }>;
  enabled: boolean;
}

export interface AISettings {
  ai_model?: string;
  ai_enabled?: boolean;
  ai_provider?: string;
  ai_api_key?: string;
  ai_api_url?: string;
  ai_model_name?: string;
  custom_ai_providers?: CustomAIProvider[];
  ai_provider_configs?: Record<string, AIProviderConfig>;
  ai_tools?: AITool[];
}

export class UserService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  private checkDB(): void {
    if (!this.env.DB) {
      throw new Error('D1 数据库未配置，请检查 wrangler.toml 中的 D1 绑定配置');
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    this.checkDB();
    const result = await this.env.DB.prepare('SELECT * FROM users WHERE email = ?')
      .bind(email)
      .first<User>();
    return result || null;
  }

  async findById(id: string): Promise<User | null> {
    this.checkDB();
    const result = await this.env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(id)
      .first<User>();
    return result || null;
  }

  async findByToken(token: string): Promise<User | null> {
    this.checkDB();
    const result = await this.env.DB.prepare('SELECT * FROM users WHERE token = ?')
      .bind(token)
      .first<User>();
    return result || null;
  }

  async findByRefreshToken(refreshToken: string): Promise<User | null> {
    this.checkDB();
    const result = await this.env.DB.prepare('SELECT * FROM users WHERE refresh_token = ?')
      .bind(refreshToken)
      .first<User>();
    return result || null;
  }

  async findByApiKey(apikey: string): Promise<User | null> {
    this.checkDB();
    const result = await this.env.DB.prepare('SELECT * FROM users WHERE apikey = ?')
      .bind(apikey)
      .first<User>();
    return result || null;
  }

  async createUser(email: string, hashedPassword: string, role: UserRole = 'user'): Promise<User> {
    this.checkDB();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const defaultTTL = 5 * 60 * 1000;

    await this.env.DB.prepare(
      `INSERT INTO users (
        id, email, password, role, created_at, updated_at,
        ai_enabled, ai_provider, ai_model,
        cache_ttl_backup, cache_ttl_channels, cache_ttl_templates, cache_ttl_groups, cache_ttl_scheduled
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        email,
        hashedPassword,
        role,
        now,
        now,
        1,
        'workers-ai',
        'workers-ai',
        defaultTTL,
        defaultTTL,
        defaultTTL,
        defaultTTL,
        defaultTTL
      )
      .run();

    const user = await this.findById(id);
    if (!user) {
      throw new Error('创建用户失败');
    }
    return user;
  }

  async updateUser(
    id: string,
    updates: Partial<Omit<User, 'id' | 'email' | 'created_at'>>
  ): Promise<User | null> {
    this.checkDB();
    const now = new Date().toISOString();
    const fields = Object.keys(updates);
    if (fields.length === 0) {
      return this.findById(id);
    }

    const setClause = fields.map((f) => `${f} = ?`).join(', ');
    const values = [...Object.values(updates), now, id];

    await this.env.DB.prepare(`UPDATE users SET ${setClause}, updated_at = ? WHERE id = ?`)
      .bind(...values)
      .run();

    return this.findById(id);
  }

  async getCacheSettings(userId: string): Promise<CacheSettings> {
    this.checkDB();
    try {
      const result = await this.env.DB.prepare(
        `SELECT 
          cache_ttl_backup, cache_ttl_channels, cache_ttl_templates, 
          cache_ttl_groups, cache_ttl_scheduled, cache_settings 
        FROM users WHERE id = ?`
      )
        .bind(userId)
        .first<User>();

      if (!result) {
        return this.getDefaultCacheSettings();
      }

      // 优先使用独立列
      const defaultSettings = this.getDefaultCacheSettings();
      const settings: CacheSettings = {
        cache_ttl_backup: result.cache_ttl_backup ?? defaultSettings.cache_ttl_backup,
        cache_ttl_channels: result.cache_ttl_channels ?? defaultSettings.cache_ttl_channels,
        cache_ttl_templates: result.cache_ttl_templates ?? defaultSettings.cache_ttl_templates,
        cache_ttl_groups: result.cache_ttl_groups ?? defaultSettings.cache_ttl_groups,
        cache_ttl_scheduled: result.cache_ttl_scheduled ?? defaultSettings.cache_ttl_scheduled,
      };

      // 如果独立列没有值但 JSON 字段有值，迁移数据
      if (!result.cache_ttl_backup && result.cache_settings) {
        try {
          const jsonSettings = JSON.parse(result.cache_settings) as CacheSettings;
          const needsMigration = jsonSettings.cache_ttl_backup !== undefined;
          if (needsMigration) {
            await this.migrateCacheSettingsToColumns(userId, jsonSettings);
          }
        } catch {
          // ignore
        }
      }

      return settings;
    } catch (error) {
      console.warn('[UserService] Failed to get cache settings, returning defaults:', error);
      return this.getDefaultCacheSettings();
    }
  }

  async getAISettings(userId: string): Promise<AISettings> {
    this.checkDB();
    try {
      const result = await this.env.DB.prepare(
        `SELECT 
          ai_enabled, ai_provider, ai_model, ai_api_key, ai_api_url, ai_model_name, ai_settings 
        FROM users WHERE id = ?`
      )
        .bind(userId)
        .first<User>();

      if (!result) {
        return this.getDefaultAISettings();
      }

      const defaultSettings = this.getDefaultAISettings();
      const settings: AISettings = {
        ai_enabled: (result.ai_enabled ?? defaultSettings.ai_enabled) === 1,
        ai_provider: result.ai_provider ?? defaultSettings.ai_provider,
        ai_model: result.ai_model ?? defaultSettings.ai_model,
        ai_api_key: result.ai_api_key ?? defaultSettings.ai_api_key,
        ai_api_url: result.ai_api_url ?? defaultSettings.ai_api_url,
        ai_model_name: result.ai_model_name ?? defaultSettings.ai_model_name,
        custom_ai_providers: [],
        ai_provider_configs: {},
        ai_tools: this.getDefaultAITools(),
      };

      // 如果独立列没有值但 JSON 字段有值，迁移数据
      if (!result.ai_provider && result.ai_settings) {
        try {
          const jsonSettings = JSON.parse(result.ai_settings) as AISettings;
          const needsMigration = jsonSettings.ai_provider !== undefined;
          if (needsMigration) {
            await this.migrateAISettingsToColumns(userId, jsonSettings);
          }
        } catch {
          // ignore
        }
      }

      // 从 JSON 字段读取复杂对象（自定义提供商和配置）
      if (result.ai_settings) {
        try {
          const jsonSettings = JSON.parse(result.ai_settings) as AISettings;
          settings.custom_ai_providers = jsonSettings.custom_ai_providers ?? [];
          settings.ai_provider_configs = jsonSettings.ai_provider_configs ?? {};
          settings.ai_tools = jsonSettings.ai_tools ?? this.getDefaultAITools();
        } catch {
          // ignore
        }
      }

      return settings;
    } catch (error) {
      console.warn('[UserService] Failed to get AI settings, returning defaults:', error);
      return this.getDefaultAISettings();
    }
  }

  async getUserSettings(userId: string): Promise<UserSettings> {
    const cacheSettings = await this.getCacheSettings(userId);
    const aiSettings = await this.getAISettings(userId);
    return { ...cacheSettings, ...aiSettings };
  }

  async migrateCacheSettingsToColumns(userId: string, settings: CacheSettings): Promise<void> {
    try {
      await this.env.DB.prepare(
        `UPDATE users SET 
          cache_ttl_backup = ?, cache_ttl_channels = ?, cache_ttl_templates = ?, 
          cache_ttl_groups = ?, cache_ttl_scheduled = ?, updated_at = ? 
        WHERE id = ?`
      )
        .bind(
          settings.cache_ttl_backup ?? this.getDefaultCacheSettings().cache_ttl_backup,
          settings.cache_ttl_channels ?? this.getDefaultCacheSettings().cache_ttl_channels,
          settings.cache_ttl_templates ?? this.getDefaultCacheSettings().cache_ttl_templates,
          settings.cache_ttl_groups ?? this.getDefaultCacheSettings().cache_ttl_groups,
          settings.cache_ttl_scheduled ?? this.getDefaultCacheSettings().cache_ttl_scheduled,
          new Date().toISOString(),
          userId
        )
        .run();
      console.log('[UserService] Migrated cache settings to columns for user:', userId);
    } catch (error) {
      console.warn('[UserService] Failed to migrate cache settings:', error);
    }
  }

  async migrateAISettingsToColumns(userId: string, settings: AISettings): Promise<void> {
    try {
      await this.env.DB.prepare(
        `UPDATE users SET 
          ai_enabled = ?, ai_provider = ?, ai_model = ?, 
          ai_api_key = ?, ai_api_url = ?, ai_model_name = ?, updated_at = ? 
        WHERE id = ?`
      )
        .bind(
          settings.ai_enabled ? 1 : 0,
          settings.ai_provider ?? 'workers-ai',
          settings.ai_model ?? 'workers-ai',
          settings.ai_api_key ?? '',
          settings.ai_api_url ?? '',
          settings.ai_model_name ?? '',
          new Date().toISOString(),
          userId
        )
        .run();
      console.log('[UserService] Migrated AI settings to columns for user:', userId);
    } catch (error) {
      console.warn('[UserService] Failed to migrate AI settings:', error);
    }
  }

  getDefaultCacheSettings(): CacheSettings {
    return {
      cache_ttl_backup: 5 * 60 * 1000,
      cache_ttl_channels: 5 * 60 * 1000,
      cache_ttl_templates: 5 * 60 * 1000,
      cache_ttl_groups: 5 * 60 * 1000,
      cache_ttl_scheduled: 5 * 60 * 1000,
    };
  }

  getDefaultAISettings(): AISettings {
    return {
      ai_model: 'workers-ai',
      ai_enabled: true,
      ai_provider: 'workers-ai',
      ai_api_key: '',
      ai_api_url: '',
      ai_model_name: '',
      custom_ai_providers: [],
      ai_provider_configs: {},
      ai_tools: this.getDefaultAITools(),
    };
  }

  getDefaultAITools(): AITool[] {
    return [
      {
        id: 'listTemplates',
        name: 'listTemplates',
        description: '获取模板列表',
        parameters: [],
        enabled: true,
      },
      {
        id: 'listGroups',
        name: 'listGroups',
        description: '获取分组列表',
        parameters: [],
        enabled: true,
      },
      {
        id: 'listScheduledTasks',
        name: 'listScheduledTasks',
        description: '获取定时任务列表',
        parameters: [],
        enabled: true,
      },
      {
        id: 'runBackup',
        name: 'runBackup',
        description: '执行备份',
        parameters: [],
        enabled: true,
      },
      {
        id: 'listChannels',
        name: 'listChannels',
        description: '获取已配置的渠道列表',
        parameters: [],
        enabled: true,
      },
    ];
  }

  getUserAITools(settings: AISettings): AITool[] {
    const defaultTools = this.getDefaultAITools();
    const userTools = settings.ai_tools || [];

    const toolMap = new Map<string, AITool>();

    for (const tool of defaultTools) {
      toolMap.set(tool.id, tool);
    }

    for (const tool of userTools) {
      if (tool.name.startsWith('custom_')) {
        toolMap.set(tool.id, tool);
      } else {
        const existing = toolMap.get(tool.id);
        if (existing) {
          existing.enabled = tool.enabled;
        }
      }
    }

    return Array.from(toolMap.values()).filter((t) => t.enabled);
  }

  getDefaultSettings(): UserSettings {
    return { ...this.getDefaultCacheSettings(), ...this.getDefaultAISettings() };
  }

  async saveCacheSettings(userId: string, settings: CacheSettings): Promise<void> {
    this.checkDB();
    const now = new Date().toISOString();
    const settingsJson = JSON.stringify(settings);

    try {
      await this.env.DB.prepare(
        `UPDATE users SET 
          cache_ttl_backup = ?, cache_ttl_channels = ?, cache_ttl_templates = ?, 
          cache_ttl_groups = ?, cache_ttl_scheduled = ?, 
          cache_settings = ?, updated_at = ? 
        WHERE id = ?`
      )
        .bind(
          settings.cache_ttl_backup ?? this.getDefaultCacheSettings().cache_ttl_backup,
          settings.cache_ttl_channels ?? this.getDefaultCacheSettings().cache_ttl_channels,
          settings.cache_ttl_templates ?? this.getDefaultCacheSettings().cache_ttl_templates,
          settings.cache_ttl_groups ?? this.getDefaultCacheSettings().cache_ttl_groups,
          settings.cache_ttl_scheduled ?? this.getDefaultCacheSettings().cache_ttl_scheduled,
          settingsJson,
          now,
          userId
        )
        .run();
    } catch (error) {
      console.warn('[UserService] Failed to save cache settings:', error);
    }
  }

  async saveAISettings(userId: string, settings: AISettings): Promise<void> {
    this.checkDB();
    const now = new Date().toISOString();
    const settingsJson = JSON.stringify(settings);

    try {
      await this.env.DB.prepare(
        `UPDATE users SET 
          ai_enabled = ?, ai_provider = ?, ai_model = ?, 
          ai_api_key = ?, ai_api_url = ?, ai_model_name = ?, 
          ai_settings = ?, updated_at = ? 
        WHERE id = ?`
      )
        .bind(
          settings.ai_enabled ? 1 : 0,
          settings.ai_provider ?? 'workers-ai',
          settings.ai_model ?? 'workers-ai',
          settings.ai_api_key ?? '',
          settings.ai_api_url ?? '',
          settings.ai_model_name ?? '',
          settingsJson,
          now,
          userId
        )
        .run();
    } catch (error) {
      console.warn('[UserService] Failed to save AI settings:', error);
    }
  }

  async saveUserSettings(userId: string, settings: UserSettings): Promise<void> {
    const cacheSettings: CacheSettings = {
      cache_ttl_backup: settings.cache_ttl_backup,
      cache_ttl_channels: settings.cache_ttl_channels,
      cache_ttl_templates: settings.cache_ttl_templates,
      cache_ttl_groups: settings.cache_ttl_groups,
      cache_ttl_scheduled: settings.cache_ttl_scheduled,
    };

    const aiSettings: AISettings = {
      ai_model: settings.ai_model,
      ai_enabled: settings.ai_enabled,
      ai_provider: settings.ai_provider,
      ai_api_key: settings.ai_api_key,
      ai_api_url: settings.ai_api_url,
      ai_model_name: settings.ai_model_name,
      custom_ai_providers: settings.custom_ai_providers,
      ai_provider_configs: settings.ai_provider_configs,
      ai_tools: (settings as any).ai_tools,
    };

    await this.saveCacheSettings(userId, cacheSettings);
    await this.saveAISettings(userId, aiSettings);
  }

  async deleteUser(id: string): Promise<boolean> {
    this.checkDB();
    const result = await this.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    return result.success && (result.meta?.changes || 0) > 0;
  }

  async generatePasswordResetToken(email: string): Promise<string | null> {
    this.checkDB();
    const user = await this.findByEmail(email);
    if (!user) {
      return null;
    }

    const resetToken = crypto.randomUUID().replace(/-/g, '');
    const resetExpiresAt = Date.now() + 24 * 60 * 60 * 1000;

    await this.updateUser(user.id, {
      password_reset_token: resetToken,
      password_reset_expires_at: resetExpiresAt,
    });

    return resetToken;
  }

  async verifyPasswordResetToken(token: string): Promise<User | null> {
    this.checkDB();
    const result = await this.env.DB.prepare('SELECT * FROM users WHERE password_reset_token = ?')
      .bind(token)
      .first<User>();

    if (!result) {
      return null;
    }

    const now = Date.now();
    const expiresAt = (result as any).password_reset_expires_at;
    if (!expiresAt || expiresAt < now) {
      return null;
    }

    return result;
  }

  async resetPasswordWithToken(token: string, newPassword: string): Promise<boolean> {
    this.checkDB();
    const user = await this.verifyPasswordResetToken(token);
    if (!user) {
      return false;
    }

    await this.updateUser(user.id, {
      password: newPassword,
      password_reset_token: null,
      password_reset_expires_at: null,
    });

    return true;
  }
}
