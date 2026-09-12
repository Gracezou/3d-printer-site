import assert from 'node:assert/strict';

import { eq } from 'drizzle-orm';

import type { AdminIdentity } from '@/lib/auth/admin';
import { assertPermission } from '@/lib/auth/permissions';
import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  adminOperationLogs,
  adminRoles,
  adminUsers,
  deviceBrands,
  deviceModels,
  productDeviceModels,
  products,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import {
  createDeviceBrand,
  createDeviceModel,
  deleteDeviceBrand,
  deleteDeviceModel,
  listAdminDevices,
  searchPublicDevices,
  updateDeviceBrand,
  updateDeviceModel,
} from '@/lib/services/device.service';

async function main(): Promise<void> {
  const db = getDb();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  let actorRoleId = '';
  let actorId = '';
  let brandId = '';
  let modelId = '';

  try {
    assert.throws(
      () => assertPermission(['device:view'], 'device:manage'),
      (error: unknown) =>
        error instanceof BizError &&
        error.code === 40301 &&
        error.httpStatus === 403,
      '缺少 device:manage 权限必须返回 403',
    );

    const [actorRole] = await db
      .insert(adminRoles)
      .values({
        code: `device_test_${suffix}`,
        name: '机型库测试角色',
        permissions: ['device:manage'],
      })
      .returning({ id: adminRoles.id, code: adminRoles.code });
    assert(actorRole);
    actorRoleId = actorRole.id;

    const [actor] = await db
      .insert(adminUsers)
      .values({
        username: `device_${suffix}`,
        passwordHash: 'acceptance-test-only',
        name: '机型库验收账号',
        roleId: actorRoleId,
      })
      .returning({ id: adminUsers.id });
    assert(actor);
    actorId = actor.id;

    const identity: AdminIdentity = {
      sub: actorId,
      username: `device_${suffix}`,
      name: '机型库验收账号',
      roleCode: actorRole.code,
      permissions: ['device:manage'],
    };
    const context = { admin: identity, ip: '127.0.0.1' };
    const [product] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.status, 'on_sale'))
      .limit(1);
    assert(product, '验收环境至少需要一条上架商品');

    const brand = await createDeviceBrand(
      {
        name: `验收品牌 ${suffix}`,
        slug: `acceptance-${suffix}`,
        aliases: [`验收别名-${suffix}`],
        sortOrder: 999,
        isVisible: true,
      },
      context,
    );
    brandId = brand.id;
    const renamedBrand = await updateDeviceBrand(
      brandId,
      { name: `验收品牌更新 ${suffix}` },
      context,
    );
    assert.equal(renamedBrand.name, `验收品牌更新 ${suffix}`);

    const model = await createDeviceModel(
      {
        brandId,
        name: `Acceptance Reader ${suffix}`,
        slug: `reader-${suffix}`,
        aliases: [`AliasSearch${suffix}`],
        releaseYear: 2026,
        isDiscontinued: false,
        isMolded: false,
        dimensions: {
          widthMm: 120,
          heightMm: 160,
          thicknessMm: 7,
          weightGrams: 180,
        },
        compatGroup: `acceptance-${suffix}`,
        notes: '机型库 CRUD 与别名搜索验收数据。',
        sortOrder: 999,
        isVisible: true,
        productIds: [product.id],
      },
      context,
    );
    modelId = model.id;
    assert.deepEqual(model.productIds, [product.id]);

    const searchResults = await searchPublicDevices(`AliasSearch${suffix}`);
    assert.equal(searchResults.length, 1);
    assert.equal(searchResults[0]?.id, modelId);

    const adminCatalog = await listAdminDevices();
    const listedModel = adminCatalog.brands
      .find((item) => item.id === brandId)
      ?.models.find((item) => item.id === modelId);
    assert.deepEqual(listedModel?.productIds, [product.id]);

    const updatedModel = await updateDeviceModel(
      modelId,
      {
        name: `Acceptance Reader Updated ${suffix}`,
        productIds: [],
      },
      context,
    );
    assert.equal(updatedModel.name, `Acceptance Reader Updated ${suffix}`);
    assert.deepEqual(updatedModel.productIds, []);

    await deleteDeviceModel(modelId, context);
    modelId = '';
    await deleteDeviceBrand(brandId, context);
    brandId = '';

    const logs = await db
      .select({ action: adminOperationLogs.action })
      .from(adminOperationLogs)
      .where(eq(adminOperationLogs.adminId, actorId));
    assert.deepEqual(
      new Set(logs.map((item) => item.action)),
      new Set([
        'device_brand.create',
        'device_brand.update',
        'device_model.create',
        'device_model.update',
        'device_model.delete',
        'device_brand.delete',
      ]),
    );

    process.stdout.write(
      'Device catalog acceptance passed: 403 permission guard, brand/model CRUD, alias search, product links, and audit logging.\n',
    );
  } finally {
    if (modelId) {
      await db
        .delete(productDeviceModels)
        .where(eq(productDeviceModels.deviceModelId, modelId));
      await db.delete(deviceModels).where(eq(deviceModels.id, modelId));
    }
    if (brandId)
      await db.delete(deviceBrands).where(eq(deviceBrands.id, brandId));
    if (actorId)
      await db
        .delete(adminOperationLogs)
        .where(eq(adminOperationLogs.adminId, actorId));
    if (actorId) await db.delete(adminUsers).where(eq(adminUsers.id, actorId));
    if (actorRoleId)
      await db.delete(adminRoles).where(eq(adminRoles.id, actorRoleId));
    await closeDatabaseConnection();
  }
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Device catalog acceptance failed: ${message}\n`);
  process.exitCode = 1;
});
