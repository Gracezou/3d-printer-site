import { asc, eq, inArray, sql } from 'drizzle-orm';

import { getDb } from '@/lib/db/client';
import { productVariants } from '@/lib/db/schema';

export interface VariantAvailability {
  variantId: string;
  availableQty: number;
}

export const publicAvailableQty = sql<number>`
  LEAST(
    GREATEST(
      COALESCE(
        (
          SELECT availability.available_qty
          FROM v_variant_availability availability
          WHERE availability.variant_id = ${productVariants.id}
        ),
        0
      ),
      0
    ),
    99
  )::int
`;

export async function getByVariantIds(
  variantIds: string[],
): Promise<VariantAvailability[]> {
  const uniqueVariantIds = [...new Set(variantIds)];
  if (uniqueVariantIds.length === 0) return [];

  const rows = await getDb()
    .select({
      variantId: productVariants.id,
      availableQty: publicAvailableQty.as('available_qty'),
    })
    .from(productVariants)
    .where(inArray(productVariants.id, uniqueVariantIds));

  const rowsById = new Map(rows.map((row) => [row.variantId, row]));
  return uniqueVariantIds.flatMap((variantId) => {
    const row = rowsById.get(variantId);
    return row ? [row] : [];
  });
}

export async function getByProductId(
  productId: string,
): Promise<VariantAvailability[]> {
  return getDb()
    .select({
      variantId: productVariants.id,
      availableQty: publicAvailableQty.as('available_qty'),
    })
    .from(productVariants)
    .where(eq(productVariants.productId, productId))
    .orderBy(asc(productVariants.sortOrder), asc(productVariants.createdAt));
}
