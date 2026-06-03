import type { Env } from '../types';

export type UserRole = 'admin' | 'user' | 'viewer';

export interface UserSettings {
  cache_ttl_backup?: number;
  cache_ttl_channels?: number;
  cache_ttl_templates?: number;
  cache_ttl_groups?: number;
  cache_ttl_scheduled?: number;
  ai_model?: string;
  ai_enabled?: boolean;
  ai_provider?: 'workers-ai' | 'openai' | 'azure-openai' | 'anthropic' | 'custom';
  ai_api_key?: string;
  ai_api_url?: string;
  ai_model_name?: string;
}

export interface User {
  id: string;
  email: string;
  password: string;
  token?: string;
  token_expires_at?: number;
  refresh_token?: string;
  refresh_token_expires_at?: number;
  apikey?: string;
  apikey_expires_at?: number;
  role?: UserRole;
  disabled?: number;
  disabled_reason?: string;
  avatar_url?: string;
  use_avatar_as_popup?: number;
  settings?: string;
  created_at: string;
  updated_at: string;
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

  /** 获取用户设置 */
  async getUserSettings(userId: string): Promise<UserSettings> {
    this.checkDB();
    try {
      const result = await this.env.DB.prepare('SELECT settings FROM users WHERE id = ?')
        .bind(userId)
        .first<{ settings?: string }>();

      if (!result?.settings) {
        return this.getDefaultSettings();
      }

      const settings = JSON.parse(result.settings) as UserSettings;
      return { ...this.getDefaultSettings(), ...settings };
    } catch (error) {
      console.warn('[UserService] Failed to get settings, returning defaults:', error);
      return this.getDefaultSettings();
    }
  }

  /** 获取默认设置 */
  getDefaultSettings(): UserSettings {
    return {
      cache_ttl_backup: 5 * 60 * 1000,
      cache_ttl_channels: 5 * 60 * 1000,
      cache_ttl_templates: 5 * 60 * 1000,
      cache_ttl_groups: 5 * 60 * 1000,
      cache_ttl_scheduled: 5 * 60 * 1000,
      ai_model: 'workers-ai',
      ai_enabled: true,
      ai_provider: 'workers-ai',
      ai_api_key: '',
      ai_api_url: '',
      ai_model_name: '',
    };
  }

  /** 保存用户设置 */
  async saveUserSettings(userId: string, settings: UserSettings): Promise<void> {
    this.checkDB();
    const now = new Date().toISOString();
    const settingsJson = JSON.stringify(settings);

    try {
      await this.env.DB.prepare('UPDATE users SET settings = ?, updated_at = ? WHERE id = ?')
        .bind(settingsJson, now, userId)
        .run();
    } catch (error) {
      console.warn('[UserService] Failed to save settings, table may not have settings column:', error);
    }
  }

  /** 删除用户（慎用） */
  async deleteUser(id: string): Promise<boolean> {
    this.checkDB();
    const result = await this.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    return result.success && (result.meta?.changes || 0) > 0;
  }
}
