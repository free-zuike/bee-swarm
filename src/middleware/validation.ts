import type { Context, Next } from 'hono';
import type { Env } from '../types';
import { z, type ZodError, type ZodSchema, type ZodIssue } from 'zod';

function formatZodErrors(errors: ZodIssue[]) {
  return errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
  }));
}

export function validateBody<T>(schema: ZodSchema<T>) {
  return async function validationMiddleware(
    c: Context<{ Bindings: Env }>,
    next: Next
  ) {
    try {
      const body = await c.req.json();
      const result = schema.safeParse(body);
      
      if (!result.success) {
        const zodError = result.error as unknown as { errors: ZodIssue[] };
        return c.json({
          error: '验证失败',
          code: 'VALIDATION_ERROR',
          details: formatZodErrors(zodError.errors),
        }, 400);
      }
      
      (c as any).validatedBody = result.data;
      await next();
    } catch (err) {
      const zodError = err as unknown as { errors: ZodIssue[] };
      if (zodError && Array.isArray(zodError.errors)) {
        return c.json({
          error: '请求体格式错误',
          code: 'VALIDATION_ERROR',
          details: formatZodErrors(zodError.errors),
        }, 400);
      }
      
      return c.json({
        error: '请求体解析失败',
        code: 'VALIDATION_ERROR',
      }, 400);
    }
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return async function validationMiddleware(
    c: Context<{ Bindings: Env }>,
    next: Next
  ) {
    try {
      const query = c.req.query();
      const result = schema.safeParse(query);
      
      if (!result.success) {
        const zodError = result.error as unknown as { errors: ZodIssue[] };
        return c.json({
          error: '参数验证失败',
          code: 'VALIDATION_ERROR',
          details: formatZodErrors(zodError.errors),
        }, 400);
      }
      
      (c as any).validatedQuery = result.data;
      await next();
    } catch (err) {
      const zodError = err as unknown as { errors: ZodIssue[] };
      if (zodError && Array.isArray(zodError.errors)) {
        return c.json({
          error: '查询参数格式错误',
          code: 'VALIDATION_ERROR',
          details: formatZodErrors(zodError.errors),
        }, 400);
      }
      
      return c.json({
        error: '查询参数解析失败',
        code: 'VALIDATION_ERROR',
      }, 400);
    }
  };
}

export const schemas = {
  register: z.object({
    email: z.string().email('请输入有效的邮箱地址'),
    password: z.string().min(8, '密码长度至少 8 位'),
  }),
  
  login: z.object({
    email: z.string().email('请输入有效的邮箱地址'),
    password: z.string().min(1, '请输入密码'),
  }),
  
  push: z.object({
    title: z.string().min(1, '请输入标题'),
    body: z.string().optional(),
    channels: z.array(z.string()).optional(),
  }),
  
  token: z.object({
    email: z.string().email('请输入有效的邮箱地址'),
    password: z.string().min(1, '请输入密码'),
  }),
  
  refresh: z.object({
    refreshToken: z.string().min(1, '请提供 refresh token'),
  }),
};