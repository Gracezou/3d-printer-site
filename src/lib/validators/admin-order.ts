import { z } from 'zod';

export const orderStatuses = [
  'pending_payment',
  'paid',
  'in_production',
  'pending_shipment',
  'shipped',
  'completed',
  'cancelled',
  'refunding',
  'refunded',
] as const;

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD');

export const adminOrderListQuerySchema = z
  .object({
    status: z.enum(orderStatuses).optional(),
    keyword: z.string().trim().max(100).optional(),
    startDate: dateString.optional(),
    endDate: dateString.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .refine(
    ({ startDate, endDate }) => !startDate || !endDate || startDate <= endDate,
    { message: '开始日期不能晚于结束日期', path: ['endDate'] },
  );

export const adminOrderIdSchema = z.string().uuid('订单 ID 无效');

export const adminOrderRemarkSchema = z
  .object({ remark: z.string().trim().max(2000).nullable() })
  .strict();

export const adminOrderShipSchema = z
  .object({
    carrierCode: z.string().trim().min(1, '快递代码不能为空').max(30),
    carrierName: z.string().trim().min(1, '快递公司不能为空').max(50),
    trackingNo: z.string().trim().min(1, '快递单号不能为空').max(64),
    remark: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

export const adminOrderRefundSchema = z
  .object({
    idempotencyKey: z
      .string()
      .trim()
      .min(8, '幂等键至少 8 个字符')
      .max(64, '幂等键最多 64 个字符')
      .regex(/^[A-Za-z0-9:_-]+$/, '幂等键格式不正确')
      .refine((value) => !value.startsWith('return:'), {
        message: 'return: 前缀仅供售后审核流程使用',
      }),
    reason: z.string().trim().min(1, '退款原因不能为空').max(200),
    items: z
      .array(
        z
          .object({
            orderItemId: z.string().uuid('订单商品 ID 无效'),
            quantity: z.number().int().min(1, '退款数量必须大于 0'),
            restock: z.boolean().default(false),
          })
          .strict(),
      )
      .min(1, '退款商品不能为空')
      .max(100, '退款商品过多')
      .superRefine((items, context) => {
        const seen = new Set<string>();
        items.forEach((item, index) => {
          if (seen.has(item.orderItemId)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: '退款商品不能重复',
              path: [index, 'orderItemId'],
            });
          }
          seen.add(item.orderItemId);
        });
      }),
  })
  .strict();

export type AdminOrderListQuery = z.infer<typeof adminOrderListQuerySchema>;
export type AdminOrderShipInput = z.infer<typeof adminOrderShipSchema>;
export type AdminOrderRefundInput = z.infer<typeof adminOrderRefundSchema>;
