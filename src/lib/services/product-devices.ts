import { getTableName, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { ProductDevice } from '@/lib/product-devices';

// Correlated aggregation keeps each parent row unique and avoids per-card calls.
export function productDevicesSelection(productId: AnyPgColumn) {
  // Preserve qualification: Drizzle strips column table names in single-table selects.
  const qualifiedId = sql`${sql.identifier(getTableName(productId.table))}.${sql.identifier(productId.name)}`;
  return sql<ProductDevice[]>`COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', model.id, 'name', model.name, 'slug', model.slug,
      'brandName', brand.name, 'brandSlug', brand.slug
    ) ORDER BY brand.sort_order, model.sort_order, model.name)
    FROM product_device_models relation
    JOIN device_models model ON model.id = relation.device_model_id
    JOIN device_brands brand ON brand.id = model.brand_id
    WHERE relation.product_id = ${qualifiedId}
      AND model.is_visible = true AND brand.is_visible = true
  ), '[]'::jsonb)`;
}
