import { z } from 'zod';

export const adminUserListQuerySchema = z
  .object({
    keyword: z.string().trim().max(100).optional(),
    status: z.enum(['active', 'disabled']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const adminUserIdSchema = z.string().uuid('用户 ID 无效');

export const adminUserStatusSchema = z
  .object({ status: z.enum(['active', 'disabled']) })
  .strict();

export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;
