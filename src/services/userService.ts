import type { Env } from '../types';

export type UserRole = 'admin' | 'user' | 'viewer';

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

  /** 删除用户（慎用） */
  async deleteUser(id: string): Promise<boolean> {
    this.checkDB();
    const result = await this.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    return result.success && (result.meta?.changes || 0) > 0;
  }
}
