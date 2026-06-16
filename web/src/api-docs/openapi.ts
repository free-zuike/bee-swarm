import type { Locale } from '@/i18n';

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    description: string;
    version: string;
  };
  servers: Array<{ url: string }>;
  paths: Record<string, unknown>;
  components: {
    securitySchemes?: Record<string, unknown>;
    schemas?: Record<string, unknown>;
  };
  tags?: Array<{ name: string; description: string }>;
}

export function getOpenAPISpec(locale: Locale = 'zh'): OpenAPISpec {
  const isZh = locale === 'zh';

  const t = (zh: string, en: string) => (isZh ? zh : en);

  return {
    openapi: '3.0.3',
    info: {
      title: t('Bee Swarm API', 'Bee Swarm API'),
      description: t('多渠道推送管理系统 API', 'Multi-channel Push Management System API'),
      version: '2.0.0',
    },
    servers: [{ url: window.location.origin }],
    tags: [
      { name: 'auth', description: t('认证', 'Authentication') },
      { name: 'token', description: t('Token', 'Token') },
      { name: 'channels', description: t('渠道管理', 'Channel Management') },
      { name: 'push', description: t('推送服务', 'Push Service') },
      { name: 'backup', description: t('备份管理', 'Backup Management') },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Api-Key',
          description: t('API Key 认证', 'API Key Authentication'),
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', description: t('错误信息', 'Error message') },
            code: {
              type: 'string',
              description: t('错误代码', 'Error code'),
              enum: ['AUTH_ERROR', 'CONFLICT', 'NOT_FOUND', 'VALIDATION_ERROR', 'INTERNAL_ERROR'],
            },
            hint: { type: 'string', description: t('错误提示', 'Error hint') },
          },
        },
        PushRequest: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string', description: t('推送标题', 'Push title') },
            content: { type: 'string', description: t('推送内容', 'Push content') },
            channels: {
              type: 'array',
              items: { type: 'string' },
              description: t('目标渠道列表', 'Target channels'),
            },
            url: { type: 'string', description: t('跳转链接', 'Redirect URL') },
          },
        },
        BackupEndpoint: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            type: { type: 'string', enum: ['s3', 'webdav'] },
            enabled: { type: 'boolean' },
            config: { type: 'object' },
            schedule: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                interval: { type: 'number' },
                startTime: { type: 'string' },
                timezone: { type: 'string' },
              },
            },
            retention: { type: 'number' },
            lastBackup: {
              type: 'object',
              properties: {
                time: { type: 'string' },
                status: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
    },
    paths: {
      '/api/register': {
        post: {
          tags: ['auth'],
          summary: t('用户注册', 'User Registration'),
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 6 },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: t('注册成功', 'Registration successful'),
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
            '409': {
              description: t('邮箱已被注册', 'Email already registered'),
            },
          },
        },
      },
      '/api/login': {
        post: {
          tags: ['auth'],
          summary: t('用户登录', 'User Login'),
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: t('登录成功', 'Login successful'),
            },
            '401': {
              description: t('认证失败', 'Authentication failed'),
            },
          },
        },
      },
      '/api/token': {
        post: {
          tags: ['token'],
          summary: t('获取访问令牌', 'Get Access Token'),
          description: t('使用邮箱密码获取访问 Token', 'Get access token using email and password'),
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: t('获取成功', 'Success'),
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      token: {
                        type: 'string',
                        description: t('访问令牌（7天有效期）', 'Access token (7 days)'),
                      },
                      refreshToken: {
                        type: 'string',
                        description: t('刷新令牌（30天有效期）', 'Refresh token (30 days)'),
                      },
                      expiresAt: {
                        type: 'number',
                        description: t('过期时间戳', 'Expiration timestamp'),
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/refresh': {
        post: {
          tags: ['token'],
          summary: t('刷新访问令牌', 'Refresh Access Token'),
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['refreshToken'],
                  properties: {
                    refreshToken: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: t('刷新成功', 'Refresh successful'),
            },
            '401': {
              description: t('无效或过期的刷新令牌', 'Invalid or expired refresh token'),
            },
          },
        },
      },
      '/api/apikey': {
        get: {
          tags: ['token'],
          summary: t('获取 API Key（Token 方式）', 'Get API Key (Token method)'),
          description: t(
            '使用访问 Token 获取 API Key（推荐方式）',
            'Get API Key using access Token (recommended)'
          ),
          parameters: [
            {
              name: 'X-Token',
              in: 'header',
              required: false,
              schema: { type: 'string' },
            },
            {
              name: 'refresh',
              in: 'query',
              required: false,
              schema: { type: 'boolean' },
            },
          ],
          responses: {
            '200': {
              description: t('获取成功', 'Success'),
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      apikey: { type: 'string' },
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ['token'],
          summary: t('获取 API Key（用户名密码方式）', 'Get API Key (Username/Password method)'),
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['username', 'password'],
                  properties: {
                    username: { type: 'string', description: t('用户邮箱', 'Email') },
                    password: { type: 'string', description: t('密码', 'Password') },
                    refresh: { type: 'boolean', description: t('是否强制刷新', 'Force refresh') },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: t('获取成功', 'Success'),
            },
          },
        },
      },
      '/api/admin/channels': {
        get: {
          tags: ['channels'],
          summary: t('获取渠道配置', 'Get Channel Configurations'),
          security: [{ ApiKeyAuth: [] }],
          responses: {
            '200': {
              description: t('获取成功', 'Success'),
            },
          },
        },
        put: {
          tags: ['channels'],
          summary: t('更新渠道配置', 'Update Channel Configuration'),
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    fields: { type: 'object' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: t('更新成功', 'Update successful'),
            },
          },
        },
      },
      '/api/admin/push': {
        post: {
          tags: ['push'],
          summary: t('发送推送', 'Send Push'),
          security: [{ ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PushRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: t('推送完成', 'Push completed'),
            },
          },
        },
      },
      '/api/admin/history': {
        get: {
          tags: ['push'],
          summary: t('获取推送历史', 'Get Push History'),
          security: [{ ApiKeyAuth: [] }],
          responses: {
            '200': {
              description: t('获取成功', 'Success'),
            },
          },
        },
      },
      '/api/admin/backup-endpoints': {
        get: {
          tags: ['backup'],
          summary: t('获取所有备份端', 'Get All Backup Endpoints'),
          security: [{ ApiKeyAuth: [] }],
          responses: {
            '200': {
              description: t('获取成功', 'Success'),
            },
          },
        },
        post: {
          tags: ['backup'],
          summary: t('添加备份端', 'Add Backup Endpoint'),
          security: [{ ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BackupEndpoint' },
              },
            },
          },
          responses: {
            '200': {
              description: t('添加成功', 'Added successfully'),
            },
          },
        },
      },
      '/api/admin/backup-endpoints/{id}': {
        put: {
          tags: ['backup'],
          summary: t('更新备份端', 'Update Backup Endpoint'),
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BackupEndpoint' },
              },
            },
          },
          responses: {
            '200': {
              description: t('更新成功', 'Updated successfully'),
            },
            '404': {
              description: t('备份端不存在', 'Endpoint not found'),
            },
          },
        },
        delete: {
          tags: ['backup'],
          summary: t('删除备份端', 'Delete Backup Endpoint'),
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: t('删除成功', 'Deleted successfully'),
            },
            '404': {
              description: t('备份端不存在', 'Endpoint not found'),
            },
          },
        },
      },
      '/api/admin/backup-endpoints/{id}/test': {
        post: {
          tags: ['backup'],
          summary: t('测试备份端连接', 'Test Backup Endpoint Connection'),
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: t('备份端 ID 或 "new"', 'Backup endpoint ID or "new"'),
            },
          ],
          responses: {
            '200': {
              description: t('测试结果', 'Test result'),
            },
          },
        },
      },
      '/api/admin/backup-endpoints/{id}/backups': {
        get: {
          tags: ['backup'],
          summary: t('列出备份', 'List Backups'),
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: t('备份列表', 'Backup list'),
            },
          },
        },
        delete: {
          tags: ['backup'],
          summary: t('删除备份', 'Delete Backup'),
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['key'],
                  properties: { key: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            '200': {
              description: t('删除成功', 'Deleted successfully'),
            },
          },
        },
      },
      '/api/admin/backup-endpoints/{id}/backup': {
        post: {
          tags: ['backup'],
          summary: t('手动备份到指定端点', 'Manual Backup to Specified Endpoint'),
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: t('备份结果', 'Backup result'),
            },
          },
        },
      },
      '/api/admin/backup-endpoints/{id}/restore': {
        post: {
          tags: ['backup'],
          summary: t('从备份恢复', 'Restore from Backup'),
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['key'],
                  properties: {
                    key: { type: 'string', description: t('备份文件 key', 'Backup file key') },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: t('恢复结果', 'Restore result'),
            },
          },
        },
      },
      '/api/admin/backup-all': {
        post: {
          tags: ['backup'],
          summary: t('触发所有启用的备份', 'Trigger All Enabled Backups'),
          security: [{ ApiKeyAuth: [] }],
          responses: {
            '200': {
              description: t('备份结果', 'Backup results'),
            },
          },
        },
      },
      '/api/admin/test/bark': {
        get: {
          tags: ['channels'],
          summary: t('测试 Bark 配置', 'Test Bark Configuration'),
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            {
              name: 'key',
              in: 'query',
              required: true,
              schema: { type: 'string' },
              description: t('Bark Key', 'Bark Key'),
            },
            {
              name: 'server',
              in: 'query',
              required: false,
              schema: { type: 'string', default: 'https://api.day.app' },
            },
          ],
          responses: {
            '200': {
              description: t('测试结果', 'Test result'),
            },
          },
        },
      },
      '/api/admin/webhook/push': {
        post: {
          tags: ['push'],
          summary: t('Webhook 触发推送', 'Webhook Trigger Push'),
          description: t(
            '通过 X-Token Header 认证，发送 POST 请求触发推送',
            'Authenticate with X-Token header and send POST request to trigger push'
          ),
          security: [{ ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['channels'],
                  properties: {
                    title: { type: 'string', description: t('推送标题', 'Push title') },
                    content: { type: 'string', description: t('推送内容', 'Push content') },
                    channels: {
                      type: 'array',
                      items: { type: 'string' },
                      description: t('推送渠道', 'Push channels'),
                    },
                    url: { type: 'string', description: t('跳转链接', 'Jump link') },
                    templateId: { type: 'string', description: t('模板 ID', 'Template ID') },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: t('推送结果', 'Push result'),
            },
          },
        },
      },
    },
  };
}
