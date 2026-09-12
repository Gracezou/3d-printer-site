import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { unstable_cache } from 'next/cache';

import type { AdminIdentity } from '@/lib/auth/admin';
import { getDb } from '@/lib/db/client';
import {
  deviceBrands,
  deviceModels,
  modelRequests,
  productDeviceModels,
  products,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import {
  type DbTransaction,
  withAdminLog,
} from '@/lib/services/admin-log.service';
import { storefrontCacheTags } from '@/lib/storefront-cache';
import type {
  CreateDeviceBrandInput,
  CreateDeviceModelInput,
  ModelRequestInput,
  UpdateDeviceBrandInput,
  UpdateDeviceModelInput,
} from '@/lib/validators/device';

interface WriteContext {
  admin: AdminIdentity;
  ip: string;
}

function isDatabaseError(error: unknown, code: string): boolean {
  let current = error;
  const visited = new Set<unknown>();
  while (typeof current === 'object' && current !== null) {
    if (visited.has(current)) return false;
    visited.add(current);
    if ('code' in current && current.code === code) return true;
    if (!('cause' in current)) return false;
    current = current.cause;
  }
  return false;
}

function throwDeviceConstraintError(error: unknown): never {
  if (isDatabaseError(error, '23505')) {
    throw new BizError('PARAM_INVALID', '品牌或机型 Slug 已存在');
  }
  if (isDatabaseError(error, '23503')) {
    throw new BizError('PARAM_INVALID', '该数据仍被机型、商品或登记记录引用');
  }
  throw error;
}

async function assertAndReplaceProductLinks(
  tx: DbTransaction,
  deviceModelId: string,
  productIds: string[],
): Promise<void> {
  const uniqueProductIds = [...new Set(productIds)];
  if (uniqueProductIds.length > 0) {
    const existing = await tx
      .select({ id: products.id })
      .from(products)
      .where(
        and(inArray(products.id, uniqueProductIds), isNull(products.deletedAt)),
      );
    if (existing.length !== uniqueProductIds.length) {
      throw new BizError('PARAM_INVALID', '关联商品不存在或已删除');
    }
  }

  await tx
    .delete(productDeviceModels)
    .where(eq(productDeviceModels.deviceModelId, deviceModelId));
  if (uniqueProductIds.length > 0) {
    await tx
      .insert(productDeviceModels)
      .values(
        uniqueProductIds.map((productId) => ({ productId, deviceModelId })),
      );
  }
}

async function loadPublicDeviceCatalog() {
  const [brands, models] = await Promise.all([
    getDb()
      .select({
        id: deviceBrands.id,
        name: deviceBrands.name,
        slug: deviceBrands.slug,
        aliases: deviceBrands.aliases,
        sortOrder: deviceBrands.sortOrder,
      })
      .from(deviceBrands)
      .where(eq(deviceBrands.isVisible, true))
      .orderBy(asc(deviceBrands.sortOrder), asc(deviceBrands.name)),
    getDb()
      .select({
        id: deviceModels.id,
        brandId: deviceModels.brandId,
        name: deviceModels.name,
        slug: deviceModels.slug,
        aliases: deviceModels.aliases,
        releaseYear: deviceModels.releaseYear,
        isDiscontinued: deviceModels.isDiscontinued,
        isMolded: deviceModels.isMolded,
        sortOrder: deviceModels.sortOrder,
      })
      .from(deviceModels)
      .innerJoin(deviceBrands, eq(deviceBrands.id, deviceModels.brandId))
      .where(
        and(eq(deviceBrands.isVisible, true), eq(deviceModels.isVisible, true)),
      )
      .orderBy(asc(deviceModels.sortOrder), asc(deviceModels.name)),
  ]);

  return brands.map((brand) => ({
    ...brand,
    models: models.filter((model) => model.brandId === brand.id),
  }));
}

export const getPublicDeviceCatalog = unstable_cache(
  loadPublicDeviceCatalog,
  ['public-device-catalog'],
  { revalidate: 300, tags: [storefrontCacheTags.devices] },
);

export async function searchPublicDevices(query: string) {
  const keyword = `%${query}%`;
  const compactKeyword = `%${query.toLowerCase().replaceAll(/\s+/g, '')}%`;
  return getDb()
    .select({
      id: deviceModels.id,
      name: deviceModels.name,
      slug: deviceModels.slug,
      aliases: deviceModels.aliases,
      releaseYear: deviceModels.releaseYear,
      isDiscontinued: deviceModels.isDiscontinued,
      isMolded: deviceModels.isMolded,
      brandId: deviceBrands.id,
      brandName: deviceBrands.name,
      brandSlug: deviceBrands.slug,
    })
    .from(deviceModels)
    .innerJoin(deviceBrands, eq(deviceBrands.id, deviceModels.brandId))
    .where(
      and(
        eq(deviceBrands.isVisible, true),
        eq(deviceModels.isVisible, true),
        or(
          ilike(deviceModels.name, keyword),
          ilike(deviceBrands.name, keyword),
          sql<boolean>`EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(${deviceModels.aliases}) alias
            WHERE alias ILIKE ${keyword}
          )`,
          sql<boolean>`EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(${deviceBrands.aliases}) alias
            WHERE alias ILIKE ${keyword}
          )`,
          sql<boolean>`replace(lower(${deviceModels.name}), ' ', '') LIKE ${compactKeyword}`,
        ),
      ),
    )
    .orderBy(
      asc(deviceBrands.sortOrder),
      asc(deviceModels.sortOrder),
      asc(deviceModels.name),
    )
    .limit(20);
}

export async function getPublicDeviceDetail(
  brandSlug: string,
  modelSlug: string,
) {
  const [device] = await getDb()
    .select({
      id: deviceModels.id,
      name: deviceModels.name,
      slug: deviceModels.slug,
      aliases: deviceModels.aliases,
      releaseYear: deviceModels.releaseYear,
      isDiscontinued: deviceModels.isDiscontinued,
      isMolded: deviceModels.isMolded,
      dimensions: deviceModels.dimensions,
      compatGroup: deviceModels.compatGroup,
      notes: deviceModels.notes,
      brandId: deviceBrands.id,
      brandName: deviceBrands.name,
      brandSlug: deviceBrands.slug,
    })
    .from(deviceModels)
    .innerJoin(deviceBrands, eq(deviceBrands.id, deviceModels.brandId))
    .where(
      and(
        eq(deviceBrands.slug, brandSlug),
        eq(deviceModels.slug, modelSlug),
        eq(deviceBrands.isVisible, true),
        eq(deviceModels.isVisible, true),
      ),
    )
    .limit(1);
  if (!device) throw new BizError('NOT_FOUND', '机型不存在');

  const productAvailability = sql<boolean>`NOT EXISTS (
    SELECT 1
    FROM product_variants variant
    INNER JOIN v_variant_availability availability
      ON availability.variant_id = variant.id
    WHERE variant.product_id = ${products.id}
      AND variant.is_active = true
      AND availability.available_qty > 0
  )`;
  const [relatedProducts, requestRows, compatibleModels] = await Promise.all([
    getDb()
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        subtitle: products.subtitle,
        mainImageUrl: products.mainImageUrl,
        minPrice: products.minPrice,
        isSoldOut: productAvailability.as('is_sold_out'),
      })
      .from(productDeviceModels)
      .innerJoin(products, eq(products.id, productDeviceModels.productId))
      .where(
        and(
          eq(productDeviceModels.deviceModelId, device.id),
          eq(products.status, 'on_sale'),
          isNull(products.deletedAt),
        ),
      )
      .orderBy(asc(products.sortOrder), asc(products.name)),
    getDb()
      .select({ total: count() })
      .from(modelRequests)
      .where(eq(modelRequests.deviceModelId, device.id)),
    device.compatGroup
      ? getDb()
          .select({
            name: deviceModels.name,
            slug: deviceModels.slug,
            brandName: deviceBrands.name,
            brandSlug: deviceBrands.slug,
          })
          .from(deviceModels)
          .innerJoin(deviceBrands, eq(deviceBrands.id, deviceModels.brandId))
          .where(
            and(
              eq(deviceModels.compatGroup, device.compatGroup),
              ne(deviceModels.id, device.id),
              eq(deviceModels.isVisible, true),
              eq(deviceBrands.isVisible, true),
            ),
          )
          .orderBy(asc(deviceBrands.sortOrder), asc(deviceModels.sortOrder))
      : Promise.resolve([]),
  ]);

  return {
    ...device,
    requestCount: requestRows[0]?.total ?? 0,
    products: relatedProducts,
    compatibleModels,
  };
}

export async function listAdminDevices() {
  const [brands, models, links, productRows, requestCounts] = await Promise.all(
    [
      getDb().select().from(deviceBrands).orderBy(asc(deviceBrands.sortOrder)),
      getDb()
        .select()
        .from(deviceModels)
        .orderBy(asc(deviceModels.sortOrder), asc(deviceModels.name)),
      getDb().select().from(productDeviceModels),
      getDb()
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(isNull(products.deletedAt))
        .orderBy(asc(products.name)),
      getDb()
        .select({ deviceModelId: modelRequests.deviceModelId, total: count() })
        .from(modelRequests)
        .groupBy(modelRequests.deviceModelId),
    ],
  );
  const counts = new Map(
    requestCounts.map((row) => [row.deviceModelId, row.total]),
  );
  return {
    brands: brands.map((brand) => ({
      ...brand,
      models: models
        .filter((model) => model.brandId === brand.id)
        .map((model) => ({
          ...model,
          productIds: links
            .filter((link) => link.deviceModelId === model.id)
            .map((link) => link.productId),
          requestCount: counts.get(model.id) ?? 0,
        })),
    })),
    products: productRows,
  };
}

export async function createDeviceBrand(
  input: CreateDeviceBrandInput,
  context: WriteContext,
) {
  try {
    return await withAdminLog(
      async (tx) => {
        const [created] = await tx
          .insert(deviceBrands)
          .values(input)
          .returning();
        if (!created) throw new BizError('INTERNAL_ERROR', '创建品牌失败');
        return created;
      },
      {
        adminId: context.admin.sub,
        adminName: context.admin.name,
        action: 'device_brand.create',
        targetType: 'device_brand',
        targetId: (brand) => brand.id,
        payload: { name: input.name, slug: input.slug },
        ip: context.ip,
      },
    );
  } catch (error: unknown) {
    throwDeviceConstraintError(error);
  }
}

export async function updateDeviceBrand(
  brandId: string,
  input: UpdateDeviceBrandInput,
  context: WriteContext,
) {
  try {
    return await withAdminLog(
      async (tx) => {
        const [updated] = await tx
          .update(deviceBrands)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(deviceBrands.id, brandId))
          .returning();
        if (!updated) throw new BizError('NOT_FOUND', '品牌不存在');
        return updated;
      },
      {
        adminId: context.admin.sub,
        adminName: context.admin.name,
        action: 'device_brand.update',
        targetType: 'device_brand',
        targetId: brandId,
        payload: { fields: Object.keys(input) },
        ip: context.ip,
      },
    );
  } catch (error: unknown) {
    throwDeviceConstraintError(error);
  }
}

export async function deleteDeviceBrand(
  brandId: string,
  context: WriteContext,
) {
  try {
    return await withAdminLog(
      async (tx) => {
        const [deleted] = await tx
          .delete(deviceBrands)
          .where(eq(deviceBrands.id, brandId))
          .returning({ id: deviceBrands.id });
        if (!deleted) throw new BizError('NOT_FOUND', '品牌不存在');
        return { id: deleted.id, deleted: true as const };
      },
      {
        adminId: context.admin.sub,
        adminName: context.admin.name,
        action: 'device_brand.delete',
        targetType: 'device_brand',
        targetId: brandId,
        ip: context.ip,
      },
    );
  } catch (error: unknown) {
    throwDeviceConstraintError(error);
  }
}

export async function createDeviceModel(
  input: CreateDeviceModelInput,
  context: WriteContext,
) {
  const { productIds, ...values } = input;
  try {
    return await withAdminLog(
      async (tx) => {
        const [created] = await tx
          .insert(deviceModels)
          .values(values)
          .returning();
        if (!created) throw new BizError('INTERNAL_ERROR', '创建机型失败');
        await assertAndReplaceProductLinks(tx, created.id, productIds);
        return { ...created, productIds: [...new Set(productIds)] };
      },
      {
        adminId: context.admin.sub,
        adminName: context.admin.name,
        action: 'device_model.create',
        targetType: 'device_model',
        targetId: (model) => model.id,
        payload: { name: input.name, brandId: input.brandId },
        ip: context.ip,
      },
    );
  } catch (error: unknown) {
    throwDeviceConstraintError(error);
  }
}

export async function updateDeviceModel(
  deviceModelId: string,
  input: UpdateDeviceModelInput,
  context: WriteContext,
) {
  const { productIds, ...values } = input;
  try {
    return await withAdminLog(
      async (tx) => {
        const [existing] = await tx
          .select({ id: deviceModels.id })
          .from(deviceModels)
          .where(eq(deviceModels.id, deviceModelId))
          .limit(1);
        if (!existing) throw new BizError('NOT_FOUND', '机型不存在');

        const current = await tx
          .select()
          .from(deviceModels)
          .where(eq(deviceModels.id, deviceModelId))
          .then((rows) => rows[0]!);
        let updated = current;
        if (Object.keys(values).length > 0) {
          const [changed] = await tx
            .update(deviceModels)
            .set({ ...values, updatedAt: new Date() })
            .where(eq(deviceModels.id, deviceModelId))
            .returning();
          updated = changed!;
        }
        if (productIds) {
          await assertAndReplaceProductLinks(tx, deviceModelId, productIds);
        }
        return {
          ...updated,
          productIds:
            productIds ??
            (
              await tx
                .select({ productId: productDeviceModels.productId })
                .from(productDeviceModels)
                .where(eq(productDeviceModels.deviceModelId, deviceModelId))
            ).map((link) => link.productId),
        };
      },
      {
        adminId: context.admin.sub,
        adminName: context.admin.name,
        action: 'device_model.update',
        targetType: 'device_model',
        targetId: deviceModelId,
        payload: { fields: Object.keys(input) },
        ip: context.ip,
      },
    );
  } catch (error: unknown) {
    throwDeviceConstraintError(error);
  }
}

export async function deleteDeviceModel(
  deviceModelId: string,
  context: WriteContext,
) {
  try {
    return await withAdminLog(
      async (tx) => {
        const [deleted] = await tx
          .delete(deviceModels)
          .where(eq(deviceModels.id, deviceModelId))
          .returning({ id: deviceModels.id });
        if (!deleted) throw new BizError('NOT_FOUND', '机型不存在');
        return { id: deleted.id, deleted: true as const };
      },
      {
        adminId: context.admin.sub,
        adminName: context.admin.name,
        action: 'device_model.delete',
        targetType: 'device_model',
        targetId: deviceModelId,
        ip: context.ip,
      },
    );
  } catch (error: unknown) {
    throwDeviceConstraintError(error);
  }
}

export async function createModelRequest(input: ModelRequestInput) {
  try {
    const result = await getDb().transaction(async (tx) => {
      const [device] = await tx
        .select({ id: deviceModels.id })
        .from(deviceModels)
        .innerJoin(deviceBrands, eq(deviceBrands.id, deviceModels.brandId))
        .where(
          and(
            eq(deviceModels.id, input.deviceModelId),
            eq(deviceModels.isVisible, true),
            eq(deviceBrands.isVisible, true),
          ),
        )
        .limit(1);
      if (!device) throw new BizError('NOT_FOUND', '机型不存在');

      const [created] = await tx
        .insert(modelRequests)
        .values({
          deviceModelId: input.deviceModelId,
          email: input.email.toLowerCase(),
          note: input.note || null,
        })
        .returning({ id: modelRequests.id });
      const [countRow] = await tx
        .select({ total: count() })
        .from(modelRequests)
        .where(eq(modelRequests.deviceModelId, input.deviceModelId));
      return { id: created!.id, requestCount: countRow?.total ?? 1 };
    });
    return result;
  } catch (error: unknown) {
    if (isDatabaseError(error, '23505')) {
      throw new BizError('MODEL_REQUEST_EXISTS', '这个邮箱已经登记过该机型');
    }
    throw error;
  }
}
