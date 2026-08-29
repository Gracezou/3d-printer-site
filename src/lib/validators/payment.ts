import { z } from 'zod';

export const createPaymentSchema = z
  .object({
    orderNo: z.string().trim().min(6).max(32),
  })
  .strict();

export const outTradeNoSchema = z
  .string()
  .trim()
  .min(6)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, '支付单号无效');

export const mockConfirmPaymentSchema = z
  .object({ outTradeNo: outTradeNoSchema })
  .strict();

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
