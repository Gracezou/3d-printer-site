import { z } from 'zod';

export const returnReasonCodes = [
  'quality_issue',
  'wrong_item',
  'size_mismatch',
  'assembly_issue',
  'other',
] as const;

export const returnRequestStatuses = [
  'pending',
  'approved',
  'rejected',
  'completed',
  'cancelled',
] as const;

const requestItemSchema = z
  .object({
    orderItemId: z.string().uuid('订单商品 ID 无效'),
    quantity: z.number().int().min(1, '申请数量必须大于 0'),
  })
  .strict();

export const createReturnRequestSchema = z
  .object({
    orderNo: z.string().trim().min(1).max(32),
    reasonCode: z.enum(returnReasonCodes),
    reasonText: z.string().trim().min(1, '请填写申请说明').max(500),
    images: z.array(z.string().url()).max(5, '凭证图片最多 5 张').default([]),
    items: z.array(requestItemSchema).min(1).max(100),
  })
  .strict()
  .superRefine((input, context) => {
    const seen = new Set<string>();
    input.items.forEach((item, index) => {
      if (seen.has(item.orderItemId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: '申请商品不能重复',
          path: ['items', index, 'orderItemId'],
        });
      }
      seen.add(item.orderItemId);
    });
  });

export const returnRequestNoSchema = z
  .string()
  .trim()
  .min(1, '申请单号不能为空')
  .max(32);

export const returnRequestIdSchema = z.string().uuid('申请 ID 无效');

export const customerReturnListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict();

export const adminReturnListQuerySchema = z
  .object({
    status: z.enum(returnRequestStatuses).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const approveReturnRequestSchema = z
  .object({
    reviewRemark: z.string().trim().max(1000).nullable().optional(),
    items: z
      .array(
        z
          .object({
            orderItemId: z.string().uuid('订单商品 ID 无效'),
            restock: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((input, context) => {
    const seen = new Set<string>();
    input.items.forEach((item, index) => {
      if (seen.has(item.orderItemId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: '审核商品不能重复',
          path: ['items', index, 'orderItemId'],
        });
      }
      seen.add(item.orderItemId);
    });
  });

export const rejectReturnRequestSchema = z
  .object({ reviewRemark: z.string().trim().min(1).max(1000) })
  .strict();

export const voidRefundSchema = z
  .object({ conclusion: z.string().trim().min(5, '核实结论至少 5 个字符').max(1000) })
  .strict();

export type CreateReturnRequestInput = z.infer<
  typeof createReturnRequestSchema
>;
export type CustomerReturnListQuery = z.infer<
  typeof customerReturnListQuerySchema
>;
export type AdminReturnListQuery = z.infer<typeof adminReturnListQuerySchema>;
export type ApproveReturnRequestInput = z.infer<
  typeof approveReturnRequestSchema
>;
