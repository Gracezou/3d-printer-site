import { z } from 'zod';
import Decimal from 'decimal.js';

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
    amount: z
      .string()
      .trim()
      .regex(/^\d+(?:\.\d{1,2})?$/, '退款金额格式不正确')
      .refine((value) => new Decimal(value).gt(0), '退款金额必须大于 0'),
    reason: z.string().trim().min(1, '退款原因不能为空').max(200),
    restock: z.boolean().default(false),
  })
  .strict();

export type AdminOrderListQuery = z.infer<typeof adminOrderListQuerySchema>;
export type AdminOrderShipInput = z.infer<typeof adminOrderShipSchema>;
export type AdminOrderRefundInput = z.infer<typeof adminOrderRefundSchema>;
