import { z } from 'zod';

import { BizError } from '@/lib/errors';

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
  .object({
    conclusion: z.string().trim().min(5, '核实结论至少 5 个字符').max(1000),
  })
  .strict();

function storageBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET ?? 'products';
}

function canonicalEvidencePath(remainder: string): string | null {
  let decodedSegments: string[];
  try {
    decodedSegments = remainder.split('/').map(decodeURIComponent);
  } catch {
    return null;
  }
  if (
    !remainder ||
    decodedSegments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.includes('/') ||
        segment.includes('\\'),
    )
  ) {
    return null;
  }
  return decodedSegments.join('/');
}

/**
 * Converts both the new path-only format and legacy public URLs to the stable
 * Storage object path. Legacy URLs intentionally do not require the current
 * hostname so referenced evidence survives a Storage origin migration.
 */
export function returnEvidencePathFromReference(value: string): string | null {
  if (value.startsWith('returns/')) {
    const canonical = canonicalEvidencePath(value);
    return canonical?.startsWith('returns/') ? canonical : null;
  }
  let candidate: URL;
  try {
    candidate = new URL(value);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(candidate.protocol)) return null;
  const marker = `/storage/v1/object/public/${storageBucket()}/`;
  const markerIndex = candidate.pathname.indexOf(marker);
  if (markerIndex < 0) return null;
  const canonical = canonicalEvidencePath(
    candidate.pathname.slice(markerIndex + marker.length),
  );
  return canonical?.startsWith('returns/') ? canonical : null;
}

export function normalizeReturnEvidencePaths(
  images: string[],
  userId: string,
): string[] {
  if (!images.length) return [];
  const storageOrigin =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const bucket = storageBucket();
  if (!storageOrigin) {
    throw new BizError('PARAM_INVALID', '凭证存储地址未配置');
  }

  let expected: URL;
  try {
    expected = new URL(
      `/storage/v1/object/public/${bucket}/returns/${userId}/`,
      storageOrigin,
    );
  } catch {
    throw new BizError('PARAM_INVALID', '凭证存储地址配置无效');
  }

  return images.map((value) => {
    let candidate: URL;
    try {
      candidate = new URL(value);
    } catch {
      throw new BizError('PARAM_INVALID', '凭证图片地址无效');
    }
    const remainder = candidate.pathname.slice(expected.pathname.length);
    const canonical = canonicalEvidencePath(remainder);
    if (
      !['http:', 'https:'].includes(candidate.protocol) ||
      candidate.origin !== expected.origin ||
      !candidate.pathname.startsWith(expected.pathname) ||
      candidate.username !== '' ||
      candidate.password !== '' ||
      candidate.search !== '' ||
      candidate.hash !== '' ||
      !canonical
    ) {
      throw new BizError(
        'PARAM_INVALID',
        '凭证图片必须来自当前用户的本站上传目录',
      );
    }
    return `returns/${userId}/${canonical}`;
  });
}

export function assertReturnEvidenceUrls(
  images: string[],
  userId: string,
): void {
  normalizeReturnEvidencePaths(images, userId);
}

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
