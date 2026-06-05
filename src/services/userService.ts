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
  // 自定义AI提供商列表
  custom_ai_providers?: CustomAIProvider[];
  // 每个AI提供商独立的配置
  ai_provider_configs?: Record<string, AIProviderConfig>;
  // 兼容性字段（保持与旧版本兼容）
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

  /** 通过邮箱查找用户 */
  async findByEmail(email: string): Promise<User | null> {
    this.checkDB();
    const result = await this.env.DB.prepare('SELECT * FROM users WHERE email = ?')
      .bind(email)
      .first<User>();
    return result || null;
  }

  /** 通过ID查找用户 */
  async findById(id: string): Promise<User | null> {
    this.checkDB();
    const result = await this.env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(id)
      .first<User>();
    return result || null;
  }

  /** 通过Token查找用户 */
  async findByToken(token: string): Promise<User | null> {
    this.checkDB();
    const result = await this.env.DB.prepare('SELECT * FROM users WHERE token = ?')
      .bind(token)
      .first<User>();
    return result || null;
  }

  /** 通过RefreshToken查找用户 */
  async findByRefreshToken(refreshToken: string): Promise<User | null> {
    this.checkDB();
    const result = await this.env.DB.prepare('SELECT * FROM users WHERE refresh_token = ?')
      .bind(refreshToken)
      .first<User>();
    return result || null;
  }

  /** 通过API Key查找用户 */
  async findByApiKey(apikey: string): Promise<User | null> {
    this.checkDB();
    const result = await this.env.DB.prepare('SELECT * FROM users WHERE apikey = ?')
      .bind(apikey)
      .first<User>();
    return result || null;
  }

  /** 创建用户 */
  async createUser(email: string, hashedPassword: string, role: UserRole = 'user'): Promise<User> {
    this.checkDB();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.env.DB.prepare(
      'INSERT INTO users (id, email, password, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
      .bind(id, email, hashedPassword, role, now, now)
      .run();

    const user = await this.findById(id);
    if (!user) {
      throw new Error('创建用户失败');
    }
    return user;
  }

  /** 更新用户 */
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

  /** 获取缓存设置 */
  async getCacheSettings(userId: string): Promise<CacheSettings> {
    this.checkDB();
    try {
      const result = await this.env.DB.prepare('SELECT cache_settings FROM users WHERE id = ?')
        .bind(userId)
        .first<{ cache_settings?: string }>();

      if (!result?.cache_settings) {
        return this.getDefaultCacheSettings();
      }

      const settings = JSON.parse(result.cache_settings) as CacheSettings;
      return { ...this.getDefaultCacheSettings(), ...settings };
    } catch (error) {
      console.warn('[UserService] Failed to get cache settings, returning defaults:', error);
      return this.getDefaultCacheSettings();
    }
  }

  /** 获取AI设置 */
  async getAISettings(userId: string): Promise<AISettings> {
    this.checkDB();
    try {
      const result = await this.env.DB.prepare('SELECT ai_settings FROM users WHERE id = ?')
        .bind(userId)
        .first<{ ai_settings?: string }>();

      if (!result?.ai_settings) {
        return this.getDefaultAISettings();
      }

      const settings = JSON.parse(result.ai_settings) as AISettings;
      return { ...this.getDefaultAISettings(), ...settings };
    } catch (error) {
      console.warn('[UserService] Failed to get AI settings, returning defaults:', error);
      return this.getDefaultAISettings();
    }
  }

  /** 获取用户设置（兼容旧接口） */
  async getUserSettings(userId: string): Promise<UserSettings> {
    const cacheSettings = await this.getCacheSettings(userId);
    const aiSettings = await this.getAISettings(userId);
    return { ...cacheSettings, ...aiSettings };
  }

  /** 获取默认缓存设置 */
  getDefaultCacheSettings(): CacheSettings {
    return {
      cache_ttl_backup: 5 * 60 * 1000,
      cache_ttl_channels: 5 * 60 * 1000,
      cache_ttl_templates: 5 * 60 * 1000,
      cache_ttl_groups: 5 * 60 * 1000,
      cache_ttl_scheduled: 5 * 60 * 1000,
    };
  }

  /** 获取默认AI设置 */
  getDefaultAISettings(): AISettings {
    return {
      ai_model: 'workers-ai',
      ai_enabled: true,
      ai_provider: 'workers-ai',
      ai_api_key: '',
      ai_api_url: '',
      ai_model_name: '',
      ai_tools: this.getDefaultAITools(),
    };
  }

  /** 获取默认AI工具列表 */
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

  /** 获取用户配置的AI工具列表（合并默认工具和自定义工具） */
  getUserAITools(settings: AISettings): AITool[] {
    const defaultTools = this.getDefaultAITools();
    const userTools = settings.ai_tools || [];
    
    // 合并默认工具和自定义工具
    const toolMap = new Map<string, AITool>();
    
    // 添加默认工具
    for (const tool of defaultTools) {
      toolMap.set(tool.id, tool);
    }
    
    // 覆盖/添加用户自定义工具
    for (const tool of userTools) {
      if (tool.name.startsWith('custom_')) {
        toolMap.set(tool.id, tool);
      } else {
        // 对于默认工具，只更新 enabled 状态
        const existing = toolMap.get(tool.id);
        if (existing) {
          existing.enabled = tool.enabled;
        }
      }
    }
    
    return Array.from(toolMap.values()).filter(t => t.enabled);
  }

  /** 获取默认设置（兼容旧接口） */
  getDefaultSettings(): UserSettings {
    return { ...this.getDefaultCacheSettings(), ...this.getDefaultAISettings() };
  }

  /** 保存缓存设置 */
  async saveCacheSettings(userId: string, settings: CacheSettings): Promise<void> {
    this.checkDB();
    const now = new Date().toISOString();
    const settingsJson = JSON.stringify(settings);

    try {
      await this.env.DB.prepare('UPDATE users SET cache_settings = ?, updated_at = ? WHERE id = ?')
        .bind(settingsJson, now, userId)
        .run();
    } catch (error) {
      console.warn(
        '[UserService] Failed to save cache settings, table may not have cache_settings column:',
        error
      );
    }
  }

  /** 保存AI设置 */
  async saveAISettings(userId: string, settings: AISettings): Promise<void> {
    this.checkDB();
    const now = new Date().toISOString();
    const settingsJson = JSON.stringify(settings);

    try {
      await this.env.DB.prepare('UPDATE users SET ai_settings = ?, updated_at = ? WHERE id = ?')
        .bind(settingsJson, now, userId)
        .run();
    } catch (error) {
      console.warn(
        '[UserService] Failed to save AI settings, table may not have ai_settings column:',
        error
      );
    }
  }

  /** 保存用户设置（兼容旧接口） */
  async saveUserSettings(userId: string, settings: UserSettings): Promise<void> {
    // 分别保存缓存设置和AI设置
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
    };

    await this.saveCacheSettings(userId, cacheSettings);
    await this.saveAISettings(userId, aiSettings);
  }

  /** 删除用户（慎用） */
  async deleteUser(id: string): Promise<boolean> {
    this.checkDB();
    const result = await this.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    return result.success && (result.meta?.changes || 0) > 0;
  }

  /** 生成密码重置令牌 */
  async generatePasswordResetToken(email: string): Promise<string | null> {
    this.checkDB();
    const user = await this.findByEmail(email);
    if (!user) {
      return null;
    }

    // 生成重置令牌和过期时间
    const resetToken = crypto.randomUUID().replace(/-/g, '');
    const resetExpiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24小时后过期

    // 更新用户的重置令牌和过期时间
    await this.updateUser(user.id, {
      password_reset_token: resetToken,
      password_reset_expires_at: resetExpiresAt,
    });

    return resetToken;
  }

  /** 验证密码重置令牌 */
  async verifyPasswordResetToken(token: string): Promise<User | null> {
    this.checkDB();
    const result = await this.env.DB.prepare('SELECT * FROM users WHERE password_reset_token = ?')
      .bind(token)
      .first<User>();

    if (!result) {
      return null;
    }

    // 检查令牌是否过期
    const now = Date.now();
    const expiresAt = (result as any).password_reset_expires_at;
    if (!expiresAt || expiresAt < now) {
      return null;
    }

    return result;
  }

  /** 使用重置令牌更新密码 */
  async resetPasswordWithToken(token: string, newPassword: string): Promise<boolean> {
    this.checkDB();
    const user = await this.verifyPasswordResetToken(token);
    if (!user) {
      return false;
    }

    // 更新密码并清除重置令牌
    await this.updateUser(user.id, {
      password: newPassword,
      password_reset_token: null,
      password_reset_expires_at: null,
    });

    return true;
  }
}
