import { z } from 'zod';

import { PERMISSIONS } from '@/lib/auth/permissions';

const usernameSchema = z
  .string()
  .trim()
  .min(3, '用户名至少 3 个字符')
  .max(50)
  .regex(/^[a-zA-Z0-9_.-]+$/, '用户名只能包含字母、数字、点、横线和下划线');
const passwordSchema = z.string().min(8, '密码至少 8 个字符').max(72);
const nameSchema = z.string().trim().min(1, '姓名不能为空').max(50);
const roleCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(50)
  .regex(/^[a-z][a-z0-9_]*$/, '角色编码只能使用小写字母、数字和下划线');
const permissionsSchema = z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length);

export const adminAccountListQuerySchema = z
  .object({
    keyword: z.string().trim().max(100).optional(),
    status: z.enum(['active', 'disabled']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const createAdminAccountSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
    name: nameSchema,
    roleId: z.string().uuid(),
    status: z.enum(['active', 'disabled']).default('active'),
  })
  .strict();

export const updateAdminAccountSchema = z
  .object({
    username: usernameSchema.optional(),
    name: nameSchema.optional(),
    roleId: z.string().uuid().optional(),
    status: z.enum(['active', 'disabled']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, '至少提供一个修改字段');

export const resetAdminPasswordSchema = z
  .object({ password: passwordSchema })
  .strict();

export const createAdminRoleSchema = z
  .object({
    code: roleCodeSchema,
    name: nameSchema,
    permissions: permissionsSchema.default([]),
  })
  .strict();

export const updateAdminRoleSchema = z
  .object({
    name: nameSchema.optional(),
    permissions: permissionsSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, '至少提供一个修改字段');

export const adminAccessIdSchema = z.string().uuid('ID 无效');

export type AdminAccountListQuery = z.infer<typeof adminAccountListQuerySchema>;
export type CreateAdminAccountInput = z.infer<typeof createAdminAccountSchema>;
export type UpdateAdminAccountInput = z.infer<typeof updateAdminAccountSchema>;
export type CreateAdminRoleInput = z.infer<typeof createAdminRoleSchema>;
export type UpdateAdminRoleInput = z.infer<typeof updateAdminRoleSchema>;
