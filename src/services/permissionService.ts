// ============================================
// RBAC 权限系统
// ============================================

/**
 * 用户角色
 */
export type UserRole = 'admin' | 'user' | 'viewer';

/**
 * 权限动作
 */
export type PermissionAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'manage'
  | 'admin';

/**
 * 权限资源
 */
export type PermissionResource =
  | 'channels'
  | 'templates'
  | 'groups'
  | 'scheduled'
  | 'history'
  | 'stats'
  | 'backup'
  | 'users'
  | 'system';

/**
 * 权限定义
 */
export interface Permission {
  action: PermissionAction;
  resource: PermissionResource;
  description?: string;
}

/**
 * 角色权限配置
 */
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    { action: 'view', resource: 'channels', description: '查看渠道配置' },
    { action: 'create', resource: 'channels', description: '创建渠道' },
    { action: 'edit', resource: 'channels', description: '编辑渠道' },
    { action: 'delete', resource: 'channels', description: '删除渠道' },
    { action: 'view', resource: 'templates', description: '查看模板' },
    { action: 'create', resource: 'templates', description: '创建模板' },
    { action: 'edit', resource: 'templates', description: '编辑模板' },
    { action: 'delete', resource: 'templates', description: '删除模板' },
    { action: 'view', resource: 'groups', description: '查看分组' },
    { action: 'create', resource: 'groups', description: '创建分组' },
    { action: 'edit', resource: 'groups', description: '编辑分组' },
    { action: 'delete', resource: 'groups', description: '删除分组' },
    { action: 'view', resource: 'scheduled', description: '查看定时任务' },
    { action: 'create', resource: 'scheduled', description: '创建定时任务' },
    { action: 'edit', resource: 'scheduled', description: '编辑定时任务' },
    { action: 'delete', resource: 'scheduled', description: '删除定时任务' },
    { action: 'view', resource: 'history', description: '查看推送历史' },
    { action: 'delete', resource: 'history', description: '删除推送历史' },
    { action: 'view', resource: 'stats', description: '查看统计数据' },
    { action: 'view', resource: 'backup', description: '查看备份' },
    { action: 'create', resource: 'backup', description: '创建备份' },
    { action: 'delete', resource: 'backup', description: '删除备份' },
    { action: 'view', resource: 'users', description: '查看用户列表' },
    { action: 'create', resource: 'users', description: '创建用户' },
    { action: 'edit', resource: 'users', description: '编辑用户' },
    { action: 'delete', resource: 'users', description: '删除用户' },
    { action: 'manage', resource: 'system', description: '管理系统设置' },
    { action: 'admin', resource: 'system', description: '系统管理员权限' },
  ],
  user: [
    { action: 'view', resource: 'channels', description: '查看渠道配置' },
    { action: 'create', resource: 'channels', description: '创建渠道' },
    { action: 'edit', resource: 'channels', description: '编辑渠道' },
    { action: 'delete', resource: 'channels', description: '删除渠道' },
    { action: 'view', resource: 'templates', description: '查看模板' },
    { action: 'create', resource: 'templates', description: '创建模板' },
    { action: 'edit', resource: 'templates', description: '编辑模板' },
    { action: 'delete', resource: 'templates', description: '删除模板' },
    { action: 'view', resource: 'groups', description: '查看分组' },
    { action: 'create', resource: 'groups', description: '创建分组' },
    { action: 'edit', resource: 'groups', description: '编辑分组' },
    { action: 'delete', resource: 'groups', description: '删除分组' },
    { action: 'view', resource: 'scheduled', description: '查看定时任务' },
    { action: 'create', resource: 'scheduled', description: '创建定时任务' },
    { action: 'edit', resource: 'scheduled', description: '编辑定时任务' },
    { action: 'delete', resource: 'scheduled', description: '删除定时任务' },
    { action: 'view', resource: 'history', description: '查看推送历史' },
    { action: 'delete', resource: 'history', description: '删除推送历史' },
    { action: 'view', resource: 'stats', description: '查看统计数据' },
    { action: 'view', resource: 'backup', description: '查看备份' },
    { action: 'create', resource: 'backup', description: '创建备份' },
  ],
  viewer: [
    { action: 'view', resource: 'channels', description: '查看渠道配置' },
    { action: 'view', resource: 'templates', description: '查看模板' },
    { action: 'view', resource: 'groups', description: '查看分组' },
    { action: 'view', resource: 'scheduled', description: '查看定时任务' },
    { action: 'view', resource: 'history', description: '查看推送历史' },
    { action: 'view', resource: 'stats', description: '查看统计数据' },
  ],
};

/**
 * 权限服务类
 */
export class PermissionService {
  /**
   * 检查角色是否具有指定权限
   */
  static hasPermission(role: UserRole, action: PermissionAction, resource: PermissionResource): boolean {
    const permissions = ROLE_PERMISSIONS[role];
    return permissions.some(
      (p) => p.action === action && p.resource === resource
    );
  }

  /**
   * 获取角色的所有权限
   */
  static getRolePermissions(role: UserRole): Permission[] {
    return ROLE_PERMISSIONS[role];
  }

  /**
   * 检查角色是否可以查看资源
   */
  static canView(role: UserRole, resource: PermissionResource): boolean {
    return this.hasPermission(role, 'view', resource);
  }

  /**
   * 检查角色是否可以创建资源
   */
  static canCreate(role: UserRole, resource: PermissionResource): boolean {
    return this.hasPermission(role, 'create', resource);
  }

  /**
   * 检查角色是否可以编辑资源
   */
  static canEdit(role: UserRole, resource: PermissionResource): boolean {
    return this.hasPermission(role, 'edit', resource);
  }

  /**
   * 检查角色是否可以删除资源
   */
  static canDelete(role: UserRole, resource: PermissionResource): boolean {
    return this.hasPermission(role, 'delete', resource);
  }

  /**
   * 检查角色是否可以管理资源
   */
  static canManage(role: UserRole, resource: PermissionResource): boolean {
    return this.hasPermission(role, 'manage', resource);
  }

  /**
   * 检查角色是否是管理员
   */
  static isAdmin(role: UserRole): boolean {
    return role === 'admin';
  }

  /**
   * 获取角色描述
   */
  static getRoleDescription(role: UserRole): string {
    const descriptions: Record<UserRole, string> = {
      admin: '系统管理员',
      user: '普通用户',
      viewer: '只读用户',
    };
    return descriptions[role];
  }

  /**
   * 获取可用角色列表
   */
  static getAvailableRoles(): UserRole[] {
    return ['admin', 'user', 'viewer'];
  }

  /**
   * 验证权限中间件
   */
  static createPermissionMiddleware(
    action: PermissionAction,
    resource: PermissionResource
  ) {
    return (role: UserRole): boolean => {
      return this.hasPermission(role, action, resource);
    };
  }
}
