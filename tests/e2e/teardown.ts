import { eq, inArray } from 'drizzle-orm';
import { getDb, closeDatabaseConnection } from '@/lib/db/client';
import {
  products,
  materials,
  deviceModels,
  deviceBrands,
  adminUsers,
  adminRoles,
  adminOperationLogs,
} from '@/lib/db/schema';
import { assertLocalDatabaseUrl } from '../../scripts/assert-local-database';
import { fixtureIds as ids } from './fixtures';

export default async function teardown() {
  assertLocalDatabaseUrl();
  const db = getDb();
  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(adminOperationLogs)
        .where(eq(adminOperationLogs.adminId, ids.admin));
      await tx.delete(adminUsers).where(eq(adminUsers.id, ids.admin));
      await tx.delete(adminRoles).where(eq(adminRoles.id, ids.adminRole));
      await tx
        .delete(products)
        .where(
          inArray(products.id, [
            ids.product,
            ids.colorProduct,
            ids.adminStyleProduct,
          ]),
        );
      await tx
        .delete(materials)
        .where(inArray(materials.id, [ids.material, ids.whiteMaterial]));
      await tx.delete(deviceModels).where(eq(deviceModels.id, ids.model));
      await tx.delete(deviceBrands).where(eq(deviceBrands.id, ids.brand));
    });
  } finally {
    await closeDatabaseConnection();
  }
}
