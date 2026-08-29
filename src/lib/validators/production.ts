import { z } from 'zod';

export const printJobStatuses = [
  'queued',
  'printing',
  'post_processing',
  'done',
  'failed',
] as const;

export const printJobListQuerySchema = z
  .object({
    status: z.enum(printJobStatuses).optional(),
    materialId: z.string().uuid('耗材 ID 无效').optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(100),
  })
  .strict();

export const printJobIdSchema = z.string().uuid('生产任务 ID 无效');

export const printJobStartSchema = z
  .object({
    printerName: z.string().trim().min(1, '打印机名称不能为空').max(50),
  })
  .strict();

export const printJobFailSchema = z
  .object({
    remark: z.string().trim().min(1, '失败原因不能为空').max(2000),
  })
  .strict();

export type PrintJobListQuery = z.infer<typeof printJobListQuerySchema>;
export type PrintJobStartInput = z.infer<typeof printJobStartSchema>;
export type PrintJobFailInput = z.infer<typeof printJobFailSchema>;
