import assert from 'node:assert/strict';

import { and, eq } from 'drizzle-orm';

import type { AdminIdentity } from '@/lib/auth/admin';
import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  adminOperationLogs,
  adminRoles,
  adminUsers,
  materialStockMovements,
  materials,
} from '@/lib/db/schema';
import {
  adjustMaterialStock,
  createMaterial,
  listMaterialMovements,
  listMaterials,
  listMaterialVariants,
  stockInMaterial,
  toggleMaterial,
  updateMaterial,
} from '@/lib/services/material.service';

async function main(): Promise<void> {
  const db = getDb();
  let materialId: string | undefined;

  try {
    const [adminRecord] = await db
      .select({
        id: adminUsers.id,
        username: adminUsers.username,
        name: adminUsers.name,
        roleCode: adminRoles.code,
        permissions: adminRoles.permissions,
      })
      .from(adminUsers)
      .innerJoin(adminRoles, eq(adminRoles.id, adminUsers.roleId))
      .where(
        and(
          eq(adminRoles.code, 'super_admin'),
          eq(adminUsers.status, 'active'),
        ),
      )
      .limit(1);
    assert(adminRecord, 'an active super-admin account is required');
    const admin: AdminIdentity = {
      sub: adminRecord.id,
      username: adminRecord.username,
      name: adminRecord.name,
      roleCode: adminRecord.roleCode,
      permissions: adminRecord.permissions,
    };
    const context = { admin, ip: '127.0.0.1' };
    const suffix = crypto
      .randomUUID()
      .replaceAll('-', '')
      .slice(0, 12)
      .toUpperCase();

    const created = await createMaterial(
      {
        code: `P3-${suffix}`,
        name: 'P3 测试耗材',
        materialType: 'PLA',
        colorName: '测试蓝',
        colorHex: '#3366FF',
        brand: 'Test',
        spec: '1.75mm / 1kg',
        unitCostPerKg: '65.00',
        safetyGrams: '200.00',
        wasteRate: '0.0500',
        supplier: '测试供应商',
        remark: 'T030 integration test',
      },
      context,
    );
    materialId = created.id;
    const createdMaterialId = created.id;

    const updated = await updateMaterial(
      createdMaterialId,
      { name: 'P3 测试耗材（已编辑）', wasteRate: '0.1000' },
      context,
    );
    assert.equal(updated.name, 'P3 测试耗材（已编辑）');
    assert.equal(updated.wasteRate, '0.1000');

    const stockIn = await stockInMaterial(
      createdMaterialId,
      {
        grams: '1000.00',
        unitCostPerKg: '66.00',
        batchNo: `B-${suffix}`,
        remark: '测试入库',
      },
      context,
    );
    assert.equal(stockIn.stockGrams, '1000.00');
    assert.equal(stockIn.movement?.movementType, 'purchase_in');
    assert.equal(stockIn.movement?.stockAfter, '1000.00');

    const adjustment = await adjustMaterialStock(
      createdMaterialId,
      { targetGrams: '950.00', remark: '测试盘点调整' },
      context,
    );
    assert.equal(adjustment.stockGrams, '950.00');
    assert.equal(adjustment.deltaStockGrams, '-50.00');
    assert.equal(adjustment.movement?.stockAfter, '950.00');

    const movements = await listMaterialMovements(createdMaterialId, {
      page: 1,
      pageSize: 20,
    });
    assert.equal(movements.total, 2);
    assert.deepEqual(
      movements.list.map((movement) => movement.movementType).sort(),
      ['adjust', 'purchase_in'],
    );

    const variants = await listMaterialVariants(createdMaterialId);
    assert.equal(variants.total, 0);

    const toggled = await toggleMaterial(createdMaterialId, false, context);
    assert.equal(toggled.isActive, false);

    const listed = await listMaterials({
      keyword: `P3-${suffix}`,
      lowStockOnly: false,
      page: 1,
      pageSize: 20,
    });
    assert.equal(listed.total, 1);
    assert.equal(listed.list[0]?.stockGrams, '950.00');
    assert.equal(listed.list[0]?.availableGrams, '750.00');
    assert.equal(listed.list[0]?.isActive, false);

    const auditLogs = await db
      .select({ action: adminOperationLogs.action })
      .from(adminOperationLogs)
      .where(eq(adminOperationLogs.targetId, createdMaterialId));
    assert.deepEqual(auditLogs.map((log) => log.action).sort(), [
      'material.adjust',
      'material.create',
      'material.stock_in',
      'material.toggle',
      'material.update',
    ]);
  } finally {
    if (materialId) {
      await db
        .delete(adminOperationLogs)
        .where(eq(adminOperationLogs.targetId, materialId));
      await db
        .delete(materialStockMovements)
        .where(eq(materialStockMovements.materialId, materialId));
      await db.delete(materials).where(eq(materials.id, materialId));
    }
    await closeDatabaseConnection();
  }

  process.stdout.write(
    'Material service integration tests passed; material, movements, and audit logs removed.\n',
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(
    `Material service integration tests failed: ${message}\n`,
  );
  process.exitCode = 1;
});
