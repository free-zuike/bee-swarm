{
  "openapi": "3.0.3",
  "info": {
    "title": "Bee Swarm Push API",
    "description": "基于 Cloudflare Workers 的多渠道消息推送服务 API 文档",
    "version": "1.0.0",
    "contact": {
      "name": "API Support"
    },
    "license": {
      "name": "MIT"
    }
  },
  "servers": [
    {
      "url": "https://beeswarm.zuike.qzz.io",
      "description": "生产环境"
    },
    {
      "url": "http://localhost:8787",
      "description": "本地开发环境"
    }
  ],
  "tags": [
    {
      "name": "认证",
      "description": "用户注册、登录、Token 管理"
    },
    {
      "name": "推送",
      "description": "消息推送相关接口"
    },
    {
      "name": "渠道",
      "description": "推送渠道配置和管理"
    },
    {
      "name": "模板",
      "description": "消息模板管理"
    },
    {
      "name": "定时任务",
      "description": "定时推送任务管理"
    },
    {
      "name": "分组",
      "description": "渠道分组管理"
    },
    {
      "name": "统计",
      "description": "推送统计和分析"
    },
    {
      "name": "用户",
      "description": "用户信息管理"
    },
    {
      "name": "系统",
      "description": "系统设置和管理"
    },
    {
      "name": "备份",
      "description": "数据备份和恢复"
    },
    {
      "name": "AI",
      "description": "AI 辅助功能"
    },
    {
      "name": "Cloudflare",
      "description": "Cloudflare 高级服务"
    }
  ],
  "paths": {
    "/api/turnstile/config": {
      "get": {
        "tags": ["认证"],
        "summary": "获取 Turnstile 配置",
        "description": "获取 Cloudflare Turnstile 人机验证的配置信息",
        "security": [],
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "siteKey": { "type": "string", "description": "Turnstile site key（如果已配置）" },
                    "message": { "type": "string" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/register": {
      "post": {
        "tags": ["认证"],
        "summary": "用户注册",
        "description": "注册新用户账户，第一个注册用户自动成为管理员",
        "security": [],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["email", "password"],
                "properties": {
                  "email": { "type": "string", "format": "email", "description": "用户邮箱" },
                  "password": { "type": "string", "minLength": 8, "description": "密码（至少8位）" },
                  "turnstileToken": { "type": "string", "description": "Turnstile 验证令牌（如果启用了人机验证）" }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "注册成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "message": { "type": "string" },
                    "isAdmin": { "type": "boolean", "description": "是否为管理员" }
                  }
                }
              }
            }
          },
          "400": {
            "description": "注册失败",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/api/login": {
      "post": {
        "tags": ["认证"],
        "summary": "用户登录",
        "description": "使用邮箱和密码登录",
        "security": [],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["email", "password"],
                "properties": {
                  "email": { "type": "string", "format": "email" },
                  "password": { "type": "string" },
                  "turnstileToken": { "type": "string", "description": "Turnstile 验证令牌" }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "登录成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "message": { "type": "string" },
                    "email": { "type": "string" }
                  }
                }
              }
            }
          },
          "401": {
            "description": "认证失败",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/api/token": {
      "post": {
        "tags": ["认证"],
        "summary": "获取访问令牌",
        "description": "使用邮箱密码获取 JWT 访问令牌",
        "security": [],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["email", "password"],
                "properties": {
                  "email": { "type": "string", "format": "email" },
                  "password": { "type": "string" }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "获取成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "token": { "type": "string", "description": "访问令牌（7天有效）" },
                    "refreshToken": { "type": "string", "description": "刷新令牌（30天有效）" },
                    "expiresAt": { "type": "number", "description": "过期时间戳" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/refresh": {
      "post": {
        "tags": ["认证"],
        "summary": "刷新访问令牌",
        "description": "使用刷新令牌获取新的访问令牌",
        "security": [],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["refreshToken"],
                "properties": {
                  "refreshToken": { "type": "string" }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "刷新成功"
          }
        }
      }
    },
    "/api/apikey": {
      "get": {
        "tags": ["认证"],
        "summary": "获取 API Key（GET 方式）",
        "description": "使用 Token 获取 API Key",
        "parameters": [
          {
            "name": "token",
            "in": "query",
            "required": true,
            "schema": { "type": "string" }
          },
          {
            "name": "refresh",
            "in": "query",
            "schema": { "type": "boolean", "default": false }
          }
        ],
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "apikey": { "type": "string" },
                    "message": { "type": "string" }
                  }
                }
              }
            }
          },
          "401": {
            "description": "认证失败",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/Error" }
              }
            }
          }
        }
      },
      "post": {
        "tags": ["认证"],
        "summary": "获取 API Key（POST 方式）",
        "description": "使用用户名密码获取 API Key（推荐方式）",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["username", "password"],
                "properties": {
                  "username": { "type": "string", "description": "用户邮箱" },
                  "password": { "type": "string" },
                  "refresh": { "type": "boolean", "default": false, "description": "是否强制刷新" }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "成功"
          }
        }
      }
    },
    "/api/password-reset": {
      "post": {
        "tags": ["认证"],
        "summary": "请求密码重置",
        "description": "请求密码重置邮件",
        "security": [],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["email"],
                "properties": {
                  "email": { "type": "string", "format": "email" }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "请求成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "message": { "type": "string" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/password-reset/{token}": {
      "get": {
        "tags": ["认证"],
        "summary": "验证密码重置令牌",
        "parameters": [
          { "name": "token", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "responses": {
          "200": {
            "description": "令牌有效",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "valid": { "type": "boolean" },
                    "email": { "type": "string" },
                    "message": { "type": "string" }
                  }
                }
              }
            }
          },
          "400": {
            "description": "令牌无效或已过期"
          }
        }
      },
      "post": {
        "tags": ["认证"],
        "summary": "使用令牌重置密码",
        "parameters": [
          { "name": "token", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["password"],
                "properties": {
                  "password": { "type": "string", "minLength": 8 }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "密码重置成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "message": { "type": "string" }
                  }
                }
              }
            }
          },
          "400": {
            "description": "重置失败"
          },
          "500": {
            "description": "服务器错误"
          }
        }
      }
    },
    "/api/ai/available": {
      "get": {
        "tags": ["AI"],
        "summary": "检查 AI 服务可用性",
        "description": "检查 Workers AI 服务是否可用",
        "security": [],
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "available": { "type": "boolean" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/admin/me": {
      "get": {
        "tags": ["用户"],
        "summary": "获取当前用户信息",
        "security": [{ "BearerAuth": [] }],
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/User"
                }
              }
            }
          },
          "404": {
            "description": "用户不存在"
          }
        }
      }
    },
    "/api/admin/me/avatar": {
      "put": {
        "tags": ["用户"],
        "summary": "设置用户头像",
        "security": [{ "BearerAuth": [] }],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "avatar_url": { "type": "string" },
                  "use_avatar_as_popup": { "type": "integer" }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "设置成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "message": { "type": "string" },
                    "avatar_url": { "type": "string" },
                    "use_avatar_as_popup": { "type": "integer" }
                  }
                }
              }
            }
          },
          "400": {
            "description": "参数无效"
          },
          "404": {
            "description": "用户不存在"
          },
          "500": {
            "description": "更新失败"
          }
        }
      },
      "post": {
        "tags": ["用户"],
        "summary": "上传头像文件",
        "security": [{ "BearerAuth": [] }],
        "requestBody": {
          "required": true,
          "content": {
            "multipart/form-data": {
              "schema": {
                "type": "object",
                "properties": {
                  "avatar": { "type": "string", "format": "binary", "description": "头像图片文件（最大2MB）" }
                },
                "required": ["avatar"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "上传成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "message": { "type": "string" },
                    "avatar_url": { "type": "string" }
                  }
                }
              }
            }
          },
          "400": {
            "description": "文件无效"
          },
          "404": {
            "description": "用户不存在"
          },
          "500": {
            "description": "上传失败"
          }
        }
      }
    },
    "/api/admin/me/avatar/status": {
      "get": {
        "tags": ["用户"],
        "summary": "检查头像存储服务状态",
        "security": [{ "BearerAuth": [] }],
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "hasR2": { "type": "boolean" },
                    "storageType": { "type": "string" },
                    "message": { "type": "string" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/admin/me/settings": {
      "get": {
        "tags": ["用户"],
        "summary": "获取用户设置",
        "security": [{ "BearerAuth": [] }],
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "settings": { "type": "object" }
                  }
                }
              }
            }
          },
          "404": {
            "description": "用户不存在"
          }
        }
      },
      "put": {
        "tags": ["用户"],
        "summary": "保存用户设置",
        "security": [{ "BearerAuth": [] }],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "cache_ttl_backup": { "type": "integer" },
                  "cache_ttl_channels": { "type": "integer" },
                  "cache_ttl_templates": { "type": "integer" },
                  "cache_ttl_groups": { "type": "integer" },
                  "cache_ttl_scheduled": { "type": "integer" },
                  "ai_model": { "type": "string" },
                  "ai_enabled": { "type": "boolean" },
                  "ai_provider": { "type": "string" },
                  "ai_api_key": { "type": "string" },
                  "ai_api_url": { "type": "string" },
                  "ai_model_name": { "type": "string" }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "保存成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "message": { "type": "string" },
                    "settings": { "type": "object" }
                  }
                }
              }
            }
          },
          "404": {
            "description": "用户不存在"
          }
        }
      }
    },
    "/api/admin/me/settings/cache": {
      "put": {
        "tags": ["用户"],
        "summary": "保存缓存设置（仅缓存相关字段）",
        "security": [{ "BearerAuth": [] }],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "cache_ttl_backup": { "type": "integer" },
                  "cache_ttl_channels": { "type": "integer" },
                  "cache_ttl_templates": { "type": "integer" },
                  "cache_ttl_groups": { "type": "integer" },
                  "cache_ttl_scheduled": { "type": "integer" }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "保存成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "message": { "type": "string" },
                    "settings": { "type": "object" }
                  }
                }
              }
            }
          },
          "404": {
            "description": "用户不存在"
          }
        }
      }
    },
    "/api/admin/me/settings/ai": {
      "put": {
        "tags": ["AI"],
        "summary": "保存 AI 设置（仅AI相关字段）",
        "security": [{ "BearerAuth": [] }],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "ai_model": { "type": "string" },
                  "ai_enabled": { "type": "boolean" },
                  "ai_provider": { "type": "string" },
                  "ai_api_key": { "type": "string" },
                  "ai_api_url": { "type": "string" },
                  "ai_model_name": { "type": "string" },
                  "custom_ai_providers": { "type": "array" },
                  "ai_provider_configs": { "type": "object" },
                  "ai_tools": { "type": "array" }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "保存成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "message": { "type": "string" },
                    "settings": { "type": "object" }
                  }
                }
              }
            }
          },
          "404": {
            "description": "用户不存在"
          }
        }
      }
    },
    "/api/admin/me/ai/tools": {
      "get": {
        "tags": ["AI"],
        "summary": "获取 AI 工具列表",
        "security": [{ "BearerAuth": [] }],
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "tools": {
                      "type": "array",
                      "items": { "$ref": "#/components/schemas/AITool" }
                    }
                  }
                }
              }
            }
          },
          "404": {
            "description": "用户不存在"
          }
        }
      }
    },
    "/api/admin/users": {
      "get": {
        "tags": ["用户"],
        "summary": "获取用户列表（仅管理员）",
        "security": [{ "BearerAuth": [] }],
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "users": {
                      "type": "array",
                      "items": { "$ref": "#/components/schemas/User" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "post": {
        "tags": ["用户"],
        "summary": "创建用户（仅管理员）",
        "security": [{ "BearerAuth": [] }],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["email", "password"],
                "properties": {
                  "email": { "type": "string", "format": "email" },
                  "password": { "type": "string", "minLength": 8 }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "创建成功",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/User"
                }
              }
            }
          },
          "409": {
            "description": "用户已存在"
          }
        }
      }
    },
    "/api/admin/users/{id}/role": {
      "put": {
        "tags": ["用户"],
        "summary": "更新用户角色（仅管理员）",
        "security": [{ "BearerAuth": [] }],
        "parameters": [
          { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["role"],
                "properties": {
                  "role": { "type": "string", "enum": ["admin", "user", "viewer"] },
                  "refresh": { "type": "boolean" }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "更新成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "message": { "type": "string" }
                  }
                }
              }
            }
          },
          "400": {
            "description": "无效的角色或不能修改自己的角色"
          },
          "404": {
            "description": "用户不存在"
          }
        }
      }
    },
    "/api/admin/users/{id}/disable": {
      "post": {
        "tags": ["用户"],
        "summary": "禁用用户（仅管理员）",
        "security": [{ "BearerAuth": [] }],
        "parameters": [
          { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "reason": { "type": "string" }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "禁用成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "message": { "type": "string" }
                  }
                }
              }
            }
          },
          "400": {
            "description": "不能禁用自己或数据库不支持"
          },
          "404": {
            "description": "用户不存在"
          }
        }
      }
    },
    "/api/admin/users/{id}/enable": {
      "post": {
        "tags": ["用户"],
        "summary": "启用用户（仅管理员）",
        "security": [{ "BearerAuth": [] }],
        "parameters": [
          { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "responses": {
          "200": {
            "description": "启用成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "message": { "type": "string" }
                  }
                }
              }
            }
          },
          "404": {
            "description": "用户不存在"
          }
        }
      }
    },
    "/api/admin/users/{id}": {
      "delete": {
        "tags": ["用户"],
        "summary": "删除用户（仅管理员）",
        "security": [{ "BearerAuth": [] }],
        "parameters": [
          { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "responses": {
          "200": {
            "description": "删除成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "message": { "type": "string" }
                  }
                }
              }
            }
          },
          "400": {
            "description": "不能删除自己"
          },
          "404": {
            "description": "用户不存在"
          }
        }
      }
    },
    "/api/admin/system/settings": {
      "get": {
        "tags": ["系统"],
        "summary": "获取系统设置（仅管理员）",
        "security": [{ "BearerAuth": [] }],
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "settings": { "type": "object" }
                  }
                }
              }
            }
          },
          "403": {
            "description": "权限不足"
          }
        }
      },
      "put": {
        "tags": ["系统"],
        "summary": "保存系统设置（仅管理员）",
        "security": [{ "BearerAuth": [] }],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": { "type": "object" }
            }
          }
        },
        "responses": {
          "200": {
            "description": "保存成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "message": { "type": "string" }
                  }
                }
              }
            }
          },
          "403": {
            "description": "权限不足"
          }
        }
      }
    },
    "/api/admin/database/stats": {
      "get": {
        "tags": ["系统"],
        "summary": "获取数据库统计（仅管理员）",
        "security": [{ "BearerAuth": [] }],
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "stats": { "type": "object" }
                  }
                }
              }
            }
          },
          "403": {
            "description": "权限不足"
          }
        }
      }
    },
    "/api/admin/database/cleanup": {
      "post": {
        "tags": ["系统"],
        "summary": "执行数据清理（仅管理员）",
        "security": [{ "BearerAuth": [] }],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "pushHistoryRetentionDays": { "type": "integer", "default": 30 },
                  "auditLogRetentionDays": { "type": "integer", "default": 90 },
                  "batchSize": { "type": "integer", "default": 100 }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "清理完成",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" }
                  }
                }
              }
            }
          },
          "403": {
            "description": "权限不足"
          }
        }
      }
    },
    "/api/admin/database/archive": {
      "post": {
        "tags": ["系统"],
        "summary": "归档推送历史（仅管理员）",
        "security": [{ "BearerAuth": [] }],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "archiveAfterDays": { "type": "integer", "default": 30 },
                  "batchSize": { "type": "integer", "default": 50 }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "归档完成",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" }
                  }
                }
              }
            }
          },
          "403": {
            "description": "权限不足"
          }
        }
      }
    },
    "/api/admin/database/archives": {
      "get": {
        "tags": ["系统"],
        "summary": "获取归档列表（仅管理员）",
        "security": [{ "BearerAuth": [] }],
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "archives": { "type": "array" }
                  }
                }
              }
            }
          },
          "403": {
            "description": "权限不足"
          }
        }
      }
    },
    "/api/admin/database/archives/{key}/restore": {
      "post": {
        "tags": ["系统"],
        "summary": "恢复归档数据（仅管理员）",
        "security": [{ "BearerAuth": [] }],
        "parameters": [
          { "name": "key", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "responses": {
          "200": {
            "description": "恢复成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" }
                  }
                }
              }
            }
          },
          "403": {
            "description": "权限不足"
          }
        }
      }
    },
    "/api/admin/audit": {
      "get": {
        "tags": ["系统"],
        "summary": "获取审计日志（仅管理员）",
        "security": [{ "BearerAuth": [] }],
        "parameters": [
          { "name": "limit", "in": "query", "schema": { "type": "integer", "default": 50 } },
          { "name": "offset", "in": "query", "schema": { "type": "integer", "default": 0 } },
          { "name": "action", "in": "query", "schema": { "type": "string" } },
          { "name": "startDate", "in": "query", "schema": { "type": "string", "format": "date-time" } },
          { "name": "endDate", "in": "query", "schema": { "type": "string", "format": "date-time" } }
        ],
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "logs": {
                      "type": "array",
                      "items": { "$ref": "#/components/schemas/AuditLog" }
                    }
                  }
                }
              }
            }
          },
          "403": {
            "description": "权限不足"
          }
        }
      },
      "delete": {
        "tags": ["系统"],
        "summary": "清除审计日志（仅管理员）",
        "security": [{ "BearerAuth": [] }],
        "responses": {
          "200": {
            "description": "清除成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "message": { "type": "string" }
                  }
                }
              }
            }
          },
          "403": {
            "description": "权限不足"
          }
        }
      }
    },
    "/api/admin/channels": {
      "get": {
        "tags": ["渠道"],
        "summary": "获取所有渠道配置",
        "security": [{ "BearerAuth": [] }],
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "channels": {
                      "type": "array",
                      "items": { "$ref": "#/components/schemas/ChannelConfig" }
                    },
                    "settings": { "type": "object" },
                    "definitions": {
                      "type": "array",
                      "items": { "$ref": "#/components/schemas/ChannelDefinition" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/admin/channels/{id}": {
      "put": {
        "tags": ["渠道"],
        "summary": "更新渠道配置",
        "security": [{ "BearerAuth": [] }],
        "parameters": [
          { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "fields": { "type": "object", "description": "渠道配置字段" },
                  "enabled": { "type": "string" }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "更新成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "message": { "type": "string" },
                    "channels": {
                      "type": "array",
                      "items": { "$ref": "#/components/schemas/ChannelConfig" }
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "无效的渠道ID或配置"
          }
        }
      }
    },
    "/api/admin/channels/health": {
      "get": {
        "tags": ["渠道"],
        "summary": "批量渠道健康检查",
        "description": "对所有已配置的渠道进行健康检查（真实发送测试消息）",
        "security": [{ "BearerAuth": [] }],
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "channels": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "channel": { "type": "string" },
                          "healthy": { "type": "boolean" },
                          "message": { "type": "string" },
                          "testedAt": { "type": "string", "format": "date-time" }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/admin/channels/health/{channel}/test": {
      "post": {
        "tags": ["渠道"],
        "summary": "测试单个渠道",
        "description": "对单个渠道进行健康检查（真实发送测试消息）",
        "security": [{ "BearerAuth": [] }],
        "parameters": [
          { "name": "channel", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "channel": { "type": "string" },
                    "healthy": { "type": "boolean" },
                    "message": { "type": "string" },
                    "testedAt": { "type": "string", "format": "date-time" }
                  }
                }
              }
            }
          },
          "400": {
            "description": "渠道未配置"
          }
        }
      }
    },
    "/api/admin/test/bark": {
      "get": {
        "tags": ["渠道"],
        "summary": "测试 Bark 配置",
        "security": [{ "BearerAuth": [] }],
        "parameters": [
          { "name": "key", "in": "query", "required": true, "schema": { "type": "string" } },
          { "name": "server", "in": "query", "schema": { "type": "string", "default": "https://api.day.app" } }
        ],
        "responses": {
          "200": {
            "description": "测试结果",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "message": { "type": "string" },
                    "note": { "type": "string" },
                    "code": { "type": "integer" }
                  }
                }
              }
            }
          },
          "400": {
            "description": "参数无效"
          }
        }
      }
    },
    "/api/admin/push": {
      "post": {
        "tags": ["推送"],
        "summary": "发送推送消息",
        "description": "向指定渠道发送推送消息",
        "security": [{ "BearerAuth": [] }],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["channels"],
                "properties": {
                  "title": { "type": "string", "description": "推送标题" },
                  "body": { "type": "string", "description": "推送内容" },
                  "channels": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "推送渠道列表"
                  },
                  "url": { "type": "string", "format": "uri", "description": "跳转链接" },
                  "imageUrl": { "type": "string", "format": "uri", "description": "图片 URL" },
                  "templateId": { "type": "string", "description": "模板 ID" },
                  "templateVariables": { "type": "object", "description": "模板变量" },
                  "async": { "type": "boolean", "default": false, "description": "是否使用异步队列" }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "推送完成",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "message": { "type": "string" },
                    "results": {
                      "type": "array",
                      "items": { "$ref": "#/components/schemas/ChannelResult" }
                    },
                    "requestId": { "type": "string", "description": "异步任务 ID" },
                    "async": { "type": "boolean" }
                  }
                }
              }
            }
          },
          "503": {
            "description": "队列服务不可用"
          }
        }
      }
    },
    "/api/admin/history": {
      "get": {
        "tags": ["推送"],
        "summary": "获取推送历史",
        "security": [{ "BearerAuth": [] }],
        "parameters": [
          { "name": "page", "in": "query", "schema": { "type": "integer", "default": 1 } },
          { "name": "pageSize", "in": "query", "schema": { "type": "integer", "default": 20 } },
          { "name": "channel", "in": "query", "schema": { "type": "string" } },
          { "name": "status", "in": "query", "schema": { "type": "string" } },
          { "name": "keyword", "in": "query", "schema": { "type": "string" } }
        ],
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "history": {
                      "type": "array",
                      "items": { "$ref": "#/components/schemas/PushRecord" }
                    },
                    "total": { "type": "integer" },
                    "hasMore": { "type": "boolean" }
                  }
                }
              }
            }
          }
        }
      },
      "delete": {
        "tags": ["推送"],
        "summary": "删除推送历史",
        "security": [{ "BearerAuth": [] }],
        "responses": {
          "200": {
            "description": "删除成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "message": { "type": "string" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/admin/history/batch-delete": {
      "post": {
        "tags": ["推送"],
        "summary": "批量删除推送历史（按 ID）",
        "security": [{ "BearerAuth": [] }],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["ids"],
                "properties": {
                  "ids": { "type": "array", "items": { "type": "string" } }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "删除成功"
          },
          "400": {
            "description": "参数无效"
          }
        }
      }
    },
    "/api/admin/history/batch-delete-filter": {
      "post": {
        "tags": ["推送"],
        "summary": "按条件批量删除推送历史",
        "security": [{ "BearerAuth": [] }],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "olderThan": { "type": "string", "format": "date-time" },
                  "channel": { "type": "string" },
                  "status": { "type": "string" }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "删除成功"
          }
        }
      }
    },
    "/api/admin/templates": {
      "get": {
        "tags": ["模板"],
        "summary": "获取所有模板",
        "security": [{ "BearerAuth": [] }],
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "templates": {
                      "type": "array",
                      "items": { "$ref": "#/components/schemas/Template" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "post": {
        "tags": ["模板"],
        "summary": "创建模板",
        "security": [{ "BearerAuth": [] }],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["name", "title"],
                "properties": {
                  "name": { "type": "string", "description": "模板名称" },
                  "title": { "type": "string", "description": "模板标题" },
                  "content": { "type": "string", "description": "模板内容" },
                  "channels": { "type": "array", "items": { "type": "string" }, "description": "适用渠道" },
                  "url": { "type": "string", "format": "uri" },
                  "imageUrl": { "type": "string", "format": "uri" },
                  "useMarkdown": { "type": "boolean" }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "创建成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "template": { "$ref": "#/components/schemas/Template" }
                  }
                }
              }
            }
          },
          "400": {
            "description": "参数无效"
          }
        }
      }
    },
    "/api/admin/templates/{id}": {
      "put": {
        "tags": ["模板"],
        "summary": "更新模板",
        "security": [{ "BearerAuth": [] }],
        "parameters": [
          { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": { "$ref": "#/components/schemas/Template" }
            }
          }
        },
        "responses": {
          "200": {
            "description": "更新成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "template": { "$ref": "#/components/schemas/Template" }
                  }
                }
              }
            }
          },
          "404": {
            "description": "模板不存在"
          }
        }
      },
      "delete": {
        "tags": ["模板"],
        "summary": "删除模板",
        "security": [{ "BearerAuth": [] }],
        "parameters": [
          { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "responses": {
          "200": {
            "description": "删除成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "message": { "type": "string" }
                  }
                }
              }
            }
          },
          "404": {
            "description": "模板不存在"
          }
        }
      }
    },
    "/api/admin/templates/{id}/preview": {
      "post": {
        "tags": ["模板"],
        "summary": "预览模板变量替换结果",
        "security": [{ "BearerAuth": [] }],
        "parameters": [
          { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "variables": { "type": "object" },
                  "autoVars": { "type": "boolean", "default": true }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "预览结果",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "title": { "type": "string" },
                    "content": { "type": "string" },
                    "url": { "type": "string" }
                  }
                }
              }
            }
          },
          "404": {
            "description": "模板不存在"
          }
        }
      }
    },
    "/api/admin/templates/{id}/variables": {
      "get": {
        "tags": ["模板"],
        "summary": "获取模板变量列表",
        "security": [{ "BearerAuth": [] }],
        "parameters": [
          { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "variables": { "type": "array", "items": { "type": "string" } },
                    "templateVariables": {
                      "type": "array",
                      "items": { "$ref": "#/components/schemas/TemplateVariable" }
                    }
                  }
                }
              }
            }
          },
          "404": {
            "description": "模板不存在"
          }
        }
      }
    },
    "/api/admin/groups": {
      "get": {
        "tags": ["分组"],
        "summary": "获取所有分组",
        "security": [{ "BearerAuth": [] }],
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "groups": {
                      "type": "array",
                      "items": { "$ref": "#/components/schemas/ChannelGroup" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "post": {
        "tags": ["分组"],
        "summary": "创建分组",
        "security": [{ "BearerAuth": [] }],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["name", "channels"],
                "properties": {
                  "name": { "type": "string" },
                  "channels": { "type": "array", "items": { "type": "string" } }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "创建成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "group": { "$ref": "#/components/schemas/ChannelGroup" }
                  }
                }
              }
            }
          },
          "400": {
            "description": "参数无效"
          }
        }
      }
    },
    "/api/admin/groups/{id}": {
      "put": {
        "tags": ["分组"],
        "summary": "更新分组",
        "security": [{ "BearerAuth": [] }],
        "parameters": [
          { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "name": { "type": "string" },
                  "channels": { "type": "array", "items": { "type": "string" } }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "更新成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "group": { "$ref": "#/components/schemas/ChannelGroup" }
                  }
                }
              }
            }
          },
          "400": {
            "description": "参数无效"
          },
          "404": {
            "description": "分组不存在"
          }
        }
      },
      "delete": {
        "tags": ["分组"],
        "summary": "删除分组",
        "security": [{ "BearerAuth": [] }],
        "parameters": [
          { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "responses": {
          "200": {
            "description": "删除成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "message": { "type": "string" }
                  }
                }
              }
            }
          },
          "404": {
            "description": "分组不存在"
          }
        }
      }
    },
    "/api/admin/groups/batch-delete": {
      "post": {
        "tags": ["分组"],
        "summary": "批量删除分组",
        "security": [{ "BearerAuth": [] }],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["ids"],
                "properties": {
                  "ids": { "type": "array", "items": { "type": "string" } }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "删除成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "message": { "type": "string" },
                    "deleted": { "type": "integer" }
                  }
                }
              }
            }
          },
          "400": {
            "description": "参数无效"
          }
        }
      }
    },
    "/api/admin/scheduled": {
      "get": {
        "tags": ["定时任务"],
        "summary": "获取定时推送列表",
        "security": [{ "BearerAuth": [] }],
        "parameters": [
          { "name": "status", "in": "query", "schema": { "type": "string", "enum": ["pending", "processing", "completed", "failed"] } }
        ],
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "scheduled": {
                      "type": "array",
                      "items": { "$ref": "#/components/schemas/ScheduledPush" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "post": {
        "tags": ["定时任务"],
        "summary": "创建定时推送",
        "security": [{ "BearerAuth": [] }],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["title", "channels", "scheduledAt"],
                "properties": {
                  "title": { "type": "string" },
                  "content": { "type": "string" },
                  "channels": { "type": "array", "items": { "type": "string" } },
                  "url": { "type": "string" },
                  "scheduledAt": { "type": "string", "format": "date-time" },
                  "templateId": { "type": "string" },
                  "scheduleType": { "type": "string", "enum": ["once", "recurring"] },
                  "recurringType": { "type": "string", "enum": ["hourly", "daily", "weekly", "monthly", "interval", "cron"] },
                  "selectedWeekDays": { "type": "array", "items": { "type": "integer" } },
                  "selectedMonthDays": { "type": "array", "items": { "type": "integer" } },
                  "intervalHours": { "type": "integer" },
                  "cronExpression": { "type": "string" }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "创建成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "scheduled": { "$ref": "#/components/schemas/ScheduledPush" }
                  }
                }
              }
            }
          },
          "400": {
            "description": "参数无效"
          }
        }
      }
    },
    "/api/admin/scheduled/{id}": {
      "put": {
        "tags": ["定时任务"],
        "summary": "更新定时推送",
        "security": [{ "BearerAuth": [] }],
        "parameters": [
          { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": { "$ref": "#/components/schemas/ScheduledPush" }
            }
          }
        },
        "responses": {
          "200": {
            "description": "更新成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": { "type": "boolean" },
                    "scheduled":