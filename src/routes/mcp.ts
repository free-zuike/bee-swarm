// ============================================
// MCP (Model Context Protocol) 路由
// 支持 AI 模型远程调用推送通知功能
// 使用 Streamable HTTP 传输（JSON-RPC over HTTP）
// ============================================

import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';
import { handleMCPRequest, type MCPRequest } from '../services/mcpService';

const mcp = new Hono<{ Bindings: Env }>();

// 所有 MCP 接口需要认证
mcp.use('*', authMiddleware);

/**
 * 获取 MCP 服务器信息
 * 返回端点地址和协议版本
 */
mcp.get('/', async (c) => {
  const userRole = c.get('userRole');
  const isAdmin = userRole === 'admin';

  return c.json({
    protocol: 'Model Context Protocol',
    version: '2024-11-05',
    serverInfo: {
      name: 'bee-swarm-mcp',
      version: '1.0.0',
    },
    endpoints: {
      message: 'POST /mcp/message',
    },
    tools: [
      'send_push - 发送推送通知',
      // 用户
      'get_current_user - 获取当前用户信息',
      'update_avatar - 更新头像',
      'update_cache_settings - 更新缓存设置',
      'update_ai_settings - 更新 AI 设置',
      'get_ai_tools - 获取 AI 工具列表',
      'ai_generate - AI 生成内容',
      'ai_execute - AI 执行命令',
      'ai_agent - AI 智能体',
      // 定时任务
      'create_scheduled_push - 创建定时推送任务',
      'update_scheduled_push - 更新定时推送任务',
      'cancel_scheduled_push - 取消定时推送任务',
      'delete_scheduled_push - 删除定时推送任务',
      'reschedule_overdue_task - 重新安排超时任务',
      'list_scheduled_pushes - 列出定时任务',
      'get_scheduled_push_detail - 获取定时任务详情',
      'get_overdue_tasks - 获取超时任务',
      'batch_cancel_scheduled - 批量取消定时任务',
      'batch_enable_scheduled - 批量启用定时任务',
      'batch_delete_scheduled - 批量删除定时任务',
      // 模板
      'get_templates - 获取推送模板',
      'create_template - 创建推送模板',
      'update_template - 更新推送模板',
      'delete_template - 删除推送模板',
      'preview_template - 预览模板',
      'get_template_variables - 获取模板变量',
      // 渠道分组
      'get_channel_groups - 获取渠道分组',
      'create_channel_group - 创建渠道分组',
      'update_channel_group - 更新渠道分组',
      'delete_channel_group - 删除渠道分组',
      'batch_delete_groups - 批量删除分组',
      'batch_send_to_groups - 向分组发送推送',
      // 推送历史
      'get_push_history - 获取推送历史',
      'get_push_history_filtered - 按条件筛选推送历史',
      'get_push_history_detail - 获取推送历史详情',
      'delete_push_history - 删除推送历史',
      'batch_delete_push_history_by_filter - 按条件批量删除',
      'mark_push_delivered - 标记已送达',
      'mark_push_read - 标记已读',
      'mark_push_clicked - 标记已点击',
      'revoke_push - 撤销推送',
      // 统计
      'get_push_stats - 获取推送统计',
      // 日志
      'get_execution_logs - 获取执行日志',
      'get_execution_log_detail - 获取执行日志详情',
      // 渠道
      'test_channel - 测试推送渠道',
      'check_all_channels_health - 检查所有渠道健康',
      'save_channel_config - 保存渠道配置',
      'list_channels - 列出所有推送渠道',
      // 草稿
      'get_drafts - 获取推送草稿',
      'create_draft - 创建推送草稿',
      'update_draft - 更新推送草稿',
      'delete_draft - 删除推送草稿',
      // 收藏
      'get_favorites - 获取推送收藏',
      'create_favorite - 创建推送收藏',
      'delete_favorite - 删除推送收藏',
      // 备份
      'list_backup_endpoints - 列出备份端点',
      'save_backup_endpoint - 添加/更新备份端点',
      'delete_backup_endpoint - 删除备份端点',
      'test_backup_endpoint - 测试备份端点',
      'run_backup - 执行备份',
      'list_backups - 列出备份文件',
      'delete_backup - 删除备份文件',
      'restore_backup - 从备份恢复',
      'get_backup_history - 备份历史',
      'delete_backup_record - 删除备份记录',
      // 数据
      'export_data - 导出数据',
      'import_data - 导入数据',
      'validate_backup_data - 验证备份数据',
      // 2FA
      'get_2fa_status - 获取 2FA 状态',
      'setup_2fa - 设置 2FA',
      'verify_2fa_setup - 验证 2FA',
      'disable_2fa - 禁用 2FA',
      // 其他
      'get_user_settings - 获取用户设置',
      'get_allowed_ips - 获取 IP 白名单',
      'get_webhook_url - 获取 Webhook URL',
      'get_avatar_status - 头像存储状态',
      'test_bark_key - 测试 Bark Key',
      'get_push_version_detail - 推送版本详情',
      'compare_push_versions - 对比推送版本',
      'run_backup_single - 备份到单个端点',
      ...(isAdmin ? [
        '--- 管理员工具 ---',
        'get_system_status - 系统状态',
        'get_system_health - 系统健康检查',
        'get_metrics - 系统指标',
        'get_analytics_activity - 活动分析',
        'list_users - 用户列表',
        'create_user - 创建用户',
        'update_user_role - 修改用户角色',
        'disable_user - 禁用用户',
        'enable_user - 启用用户',
        'delete_user - 删除用户',
        'get_audit_logs - 审计日志',
        'clear_audit_logs - 清除审计日志',
        'get_system_settings - 系统设置',
        'update_system_settings - 更新系统设置',
        'get_database_stats - 数据库统计',
        'get_database_tables - 数据库表列表',
        'delete_database_table - 删除数据库表',
        'cleanup_orphan_tables - 清理孤立表',
        'cleanup_database - 清理数据库',
        'archive_push_history - 归档推送历史',
        'list_archives - 列出归档',
        'restore_archive - 恢复归档',
      ] : []),
    ],
    userRole,
    totalTools: isAdmin ? 104 : 80,
    permissions: {
      admin: '全部 104 个工具可用',
      user: '80 个个人工具可用',
    },
  });
});

/**
 * 消息端点：处理 JSON-RPC 请求
 * 客户端通过 POST 发送 JSON-RPC 请求
 */
mcp.post('/message', async (c) => {
  const username = c.get('username');
  const userRole = c.get('userRole');
  const body = (await c.req.json()) as MCPRequest;

  if (!body || body.jsonrpc !== '2.0') {
    return c.json(
      { jsonrpc: '2.0', id: body?.id || null, error: { code: -32600, message: 'Invalid Request' } },
      400
    );
  }

  const response = await handleMCPRequest(body, c.env, username, userRole);
  return c.json(response);
});

/**
 * 健康检查
 */
mcp.get('/health', async (c) => {
  return c.json({ status: 'ok', service: 'mcp' });
});

export default mcp;