import type { Locale } from '@/i18n';

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    description: string;
    version: string;
  };
  servers: Array<{ url: string }>;
  paths: Record<string, any>;
  components: {
    securitySchemes?: any;
    schemas?: any;
  };
  tags?: Array<{ name: string; description: string }>;
}

export function getOpenAPISpec(locale: Locale = 'zh'): OpenAPISpec {
  const isZh = locale === 'zh';

  const t = (zh: string, en: string) => (isZh ? zh : en);

  return {
    openapi: '3.0.3',
    info: {
      title: t('Bee Swarm API 文档', 'Bee Swarm API Documentation'),
      description: t(
        '多渠道推送通知系统的 API 文档',
        'API documentation for the multi-channel push notification system'
      ),
      version: '2.0.0',
    },
    servers: [{ url: window.location.origin }],
    tags: [
      { name: 'auth', description: t('认证相关', 'Authentication') },
      { name: 'channels', description: t('渠道管理', 'Channel Management') },
      { name: 'push', description: t('推送服务', 'Push Service') },
      { name: 'backup', description: t('备份管理', 'Backup Management') },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: t('使用登录获取的 Token', 'Use Token from login'),
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: t('使用 API Key 进行认证', 'Authenticate using API Key'),
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        PushRequest: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string', description: t('推送标题', 'Push title') },
            body: { type: 'string', description: t('推送内容', 'Push body') },
            url: { type: 'string', description: t('点击跳转链接', 'Click URL') },
            channels: {
              type: 'array',
              items: { type: 'string' },
              description: t('目标渠道', 'Target channels'),
            },
          },
        },
        ChannelDefinition: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            icon: { type: 'string' },
            description: { type: 'string' },
          },
        },
        BackupEndpoint: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            type: { type: 'string', enum: ['s3', 'webdav'] },
            enabled: { type: 'boolean' },
            schedule: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                startTime: { type: 'string' },
                timezone: { type: 'string' },
              },
            },
            retention: { type: 'number' },
          },
        },
      },
    },
    paths: {
      '/api/register': {
        post: {
          tags: ['auth'],
          summary: t('用户注册', 'User Registration'),
          description: t('注册新用户账号', 'Register a new user account'),
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 8 },
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
                  schema: { $ref: '#/components/schemas/SuccessResponse' },
                },
              },
            },
            '400': { description: t('参数错误', 'Bad request') },
            '409': { description: t('邮箱已被注册', 'Email already registered') },
          },
        },
      },
      '/api/login': {
        post: {
          tags: ['auth'],
          summary: t('用户登录', 'User Login'),
          description: t('使用邮箱和密码登录', 'Login with email and password'),
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
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' },
                      email: { type: 'string' },
                    },
                  },
                },
              },
            },
            '400': { description: t('参数错误', 'Bad request') },
            '401': { description: t('认证失败', 'Authentication failed') },
          },
        },
      },
      '/api/token': {
        post: {
          tags: ['auth'],
          summary: t('获取访问 Token', 'Get Access Token'),
          description: t('获取用于 API 访问的 Token', 'Get Token for API access'),
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
              description: t('Token 获取成功', 'Token obtained successfully'),
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      token: { type: 'string' },
                      refreshToken: { type: 'string' },
                      expiresAt: { type: 'number' },
                    },
                  },
                },
              },
            },
            '400': { description: t('参数错误', 'Bad request') },
            '401': { description: t('认证失败', 'Authentication failed') },
          },
        },
      },
      '/api/refresh': {
        post: {
          tags: ['auth'],
          summary: t('刷新 Token', 'Refresh Token'),
          description: t(
            '使用 Refresh Token 刷新访问 Token',
            'Refresh access token using refresh token'
          ),
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
              description: t('Token 刷新成功', 'Token refreshed successfully'),
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      token: { type: 'string' },
                      refreshToken: { type: 'string' },
                      expiresAt: { type: 'number' },
                    },
                  },
                },
              },
            },
            '400': { description: t('参数错误', 'Bad request') },
            '401': { description: t('Token 无效或已过期', 'Token invalid or expired') },
          },
        },
      },
      '/api/apikey': {
        get: {
          tags: ['auth'],
          summary: t('获取或生成 API Key', 'Get or Generate API Key'),
          description: t(
            '获取现有 API Key 或生成新的',
            'Get existing API Key or generate a new one'
          ),
          parameters: [
            {
              name: 'refresh',
              in: 'query',
              description: t('是否强制刷新', 'Whether to force refresh'),
              schema: { type: 'string', enum: ['true', 'false'] },
            },
          ],
          responses: {
            '200': {
              description: t('API Key', 'API Key'),
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      apikey: { type: 'string' },
                    },
                  },
                },
              },
            },
            '401': { description: t('认证失败', 'Authentication failed') },
          },
        },
      },
      '/api/admin/channels': {
        get: {
          tags: ['channels'],
          summary: t('获取渠道配置', 'Get Channel Configurations'),
          description: t('获取所有推送渠道的配置信息', 'Get all push channel configurations'),
          security: [{ bearerAuth: [] }, { apiKey: [] }],
          responses: {
            '200': {
              description: t('渠道配置', 'Channel configurations'),
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      channels: { type: 'array', items: { type: 'object' } },
                      settings: { type: 'object' },
                      definitions: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/ChannelDefinition' },
                      },
                    },
                  },
                },
              },
            },
            '401': { description: t('认证失败', 'Authentication failed') },
          },
        },
      },
      '/api/admin/channels/{id}': {
        put: {
          tags: ['channels'],
          summary: t('更新渠道配置', 'Update Channel Configuration'),
          description: t('更新指定推送渠道的配置', 'Update specified push channel configuration'),
          security: [{ bearerAuth: [] }, { apiKey: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, description: t('渠道 ID', 'Channel ID') },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['fields'],
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
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' },
                      channels: { type: 'array' },
                    },
                  },
                },
              },
            },
            '400': { description: t('参数错误', 'Bad request') },
            '401': { description: t('认证失败', 'Authentication failed') },
          },
        },
      },
      '/api/admin/push': {
        post: {
          tags: ['push'],
          summary: t('发送推送', 'Send Push'),
          description: t('向指定渠道发送推送通知', 'Send push notifications to specified channels'),
          security: [{ bearerAuth: [] }, { apiKey: [] }],
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
              description: t('推送结果', 'Push results'),
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' },
                      results: { type: 'array', items: { type: 'object' } },
                    },
                  },
                },
              },
            },
            '400': { description: t('参数错误', 'Bad request') },
            '401': { description: t('认证失败', 'Authentication failed') },
          },
        },
      },
      '/api/admin/history': {
        get: {
          tags: ['push'],
          summary: t('获取推送历史', 'Get Push History'),
          description: t('获取历史推送记录', 'Get historical push records'),
          security: [{ bearerAuth: [] }, { apiKey: [] }],
          responses: {
            '200': {
              description: t('推送历史', 'Push history'),
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      history: { type: 'array', items: { type: 'object' } },
                    },
                  },
                },
              },
            },
            '401': { description: t('认证失败', 'Authentication failed') },
          },
        },
      },
      '/api/admin/backup-endpoints': {
        get: {
          tags: ['backup'],
          summary: t('获取所有备份端', 'Get All Backup Endpoints'),
          description: t('获取所有配置的备份端列表', 'Get all configured backup endpoints'),
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: t('备份端列表', 'Backup endpoints list'),
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      endpoints: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/BackupEndpoint' },
                      },
                    },
                  },
                },
              },
            },
            '401': { description: t('认证失败', 'Authentication failed') },
          },
        },
        post: {
          tags: ['backup'],
          summary: t('添加备份端', 'Add Backup Endpoint'),
          description: t('添加新的备份端配置', 'Add new backup endpoint configuration'),
          security: [{ bearerAuth: [] }],
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
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      endpoint: { $ref: '#/components/schemas/BackupEndpoint' },
                    },
                  },
                },
              },
            },
            '400': { description: t('参数错误', 'Bad request') },
            '401': { description: t('认证失败', 'Authentication failed') },
          },
        },
      },
      '/api/admin/backup-endpoints/{id}': {
        put: {
          tags: ['backup'],
          summary: t('更新备份端', 'Update Backup Endpoint'),
          description: t('更新备份端配置', 'Update backup endpoint configuration'),
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: t('备份端 ID', 'Backup endpoint ID'),
            },
          ],
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
              description: t('更新成功', 'Updated successfully'),
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      endpoint: { $ref: '#/components/schemas/BackupEndpoint' },
                    },
                  },
                },
              },
            },
            '400': { description: t('参数错误', 'Bad request') },
            '401': { description: t('认证失败', 'Authentication failed') },
            '404': { description: t('备份端不存在', 'Endpoint not found') },
          },
        },
        delete: {
          tags: ['backup'],
          summary: t('删除备份端', 'Delete Backup Endpoint'),
          description: t('删除备份端配置', 'Delete backup endpoint configuration'),
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: t('备份端 ID', 'Backup endpoint ID'),
            },
          ],
          responses: {
            '200': {
              description: t('删除成功', 'Deleted successfully'),
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SuccessResponse' },
                },
              },
            },
            '401': { description: t('认证失败', 'Authentication failed') },
            '404': { description: t('备份端不存在', 'Endpoint not found') },
          },
        },
      },
      '/api/admin/backup-endpoints/{id}/test': {
        post: {
          tags: ['backup'],
          summary: t('测试备份端连接', 'Test Backup Endpoint Connection'),
          description: t('测试备份端连接是否正常', 'Test if backup endpoint connection is working'),
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: t('备份端 ID 或 "new"', 'Backup endpoint ID or "new"'),
            },
          ],
          responses: {
            '200': {
              description: t('测试结果', 'Test result'),
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
            '401': { description: t('认证失败', 'Authentication failed') },
            '404': { description: t('备份端不存在', 'Endpoint not found') },
          },
        },
      },
      '/api/admin/backup-endpoints/{id}/backups': {
        get: {
          tags: ['backup'],
          summary: t('列出备份文件', 'List Backup Files'),
          description: t('列出备份端的所有备份文件', 'List all backup files on the endpoint'),
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: t('备份端 ID', 'Backup endpoint ID'),
            },
          ],
          responses: {
            '200': {
              description: t('备份文件列表', 'Backup file list'),
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      backups: { type: 'array', items: { type: 'object' } },
                    },
                  },
                },
              },
            },
            '401': { description: t('认证失败', 'Authentication failed') },
            '404': { description: t('备份端不存在', 'Endpoint not found') },
          },
        },
        delete: {
          tags: ['backup'],
          summary: t('删除备份文件', 'Delete Backup File'),
          description: t('删除指定的备份文件', 'Delete specified backup file'),
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: t('备份端 ID', 'Backup endpoint ID'),
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['key'],
                  properties: {
                    key: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: t('删除结果', 'Delete result'),
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SuccessResponse' },
                },
              },
            },
            '400': { description: t('参数错误', 'Bad request') },
            '401': { description: t('认证失败', 'Authentication failed') },
            '404': { description: t('备份端不存在', 'Endpoint not found') },
          },
        },
      },
      '/api/admin/backup-endpoints/{id}/restore': {
        post: {
          tags: ['backup'],
          summary: t('恢复备份', 'Restore Backup'),
          description: t('从备份文件恢复数据', 'Restore data from backup file'),
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: t('备份端 ID', 'Backup endpoint ID'),
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['key'],
                  properties: {
                    key: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: t('恢复结果', 'Restore result'),
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SuccessResponse' },
                },
              },
            },
            '400': { description: t('参数错误', 'Bad request') },
            '401': { description: t('认证失败', 'Authentication failed') },
            '404': { description: t('备份端不存在', 'Endpoint not found') },
          },
        },
      },
      '/api/admin/backup-endpoints/{id}/backup': {
        post: {
          tags: ['backup'],
          summary: t('手动备份单个备份端', 'Manual Backup for Single Endpoint'),
          description: t('手动触发单个备份端的备份', 'Manually trigger backup for single endpoint'),
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: t('备份端 ID', 'Backup endpoint ID'),
            },
          ],
          responses: {
            '200': {
              description: t('备份结果', 'Backup result'),
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
            '401': { description: t('认证失败', 'Authentication failed') },
            '404': { description: t('备份端不存在', 'Endpoint not found') },
          },
        },
      },
      '/api/admin/backup-all': {
        post: {
          tags: ['backup'],
          summary: t('备份所有备份端', 'Backup All Endpoints'),
          description: t('手动触发所有备份端的备份', 'Manually trigger backup for all endpoints'),
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: t('备份结果', 'Backup results'),
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      results: { type: 'array', items: { type: 'object' } },
                    },
                  },
                },
              },
            },
            '401': { description: t('认证失败', 'Authentication failed') },
          },
        },
      },
    },
  };
}
