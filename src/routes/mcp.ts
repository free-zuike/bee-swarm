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
      'create_scheduled_push - 创建定时推送任务',
      'update_scheduled_push - 更新定时推送任务',
      'cancel_scheduled_push - 取消定时推送任务',
      'reschedule_overdue_task - 重新安排超时任务',
      'list_scheduled_pushes - 列出定时任务',
      'get_scheduled_push_detail - 获取定时任务详情',
      'get_templates - 获取推送模板',
      'create_template - 创建推送模板',
      'update_template - 更新推送模板',
      'delete_template - 删除推送模板',
      'get_channel_groups - 获取渠道分组',
      'create_channel_group - 创建渠道分组',
      'update_channel_group - 更新渠道分组',
      'delete_channel_group - 删除渠道分组',
      'get_push_history - 获取推送历史',
      'get_push_history_detail - 获取推送历史详情',
      'delete_push_history - 删除推送历史',
      'get_push_stats - 获取推送统计',
      'get_execution_logs - 获取执行日志',
      'test_channel - 测试推送渠道',
      'check_all_channels_health - 检查所有渠道健康',
      'save_channel_config - 保存渠道配置',
      'get_drafts - 获取推送草稿',
      'create_draft - 创建推送草稿',
      'update_draft - 更新推送草稿',
      'delete_draft - 删除推送草稿',
      'get_favorites - 获取推送收藏',
      'create_favorite - 创建推送收藏',
      'delete_favorite - 删除推送收藏',
      'list_channels - 列出所有推送渠道',
      'list_backup_endpoints - 列出备份端点',
      'run_backup - 执行备份',
      'list_backups - 列出备份文件',
      'get_user_settings - 获取用户设置',
      'get_allowed_ips - 获取 IP 白名单',
      'export_data - 导出数据',
      ...(isAdmin ? [
        'get_system_status - 获取系统状态',
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
        'cleanup_database - 清理数据库',
        'archive_push_history - 归档推送历史',
        'list_archives - 列出归档',
        'restore_archive - 恢复归档',
      ] : []),
    ],
    userRole,
    totalTools: isAdmin ? 54 : 37,
    permissions: {
      admin: '全部 54 个工具可用（含用户管理、系统设置、审计、数据库管理等）',
      user: '37 个个人工具可用',
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