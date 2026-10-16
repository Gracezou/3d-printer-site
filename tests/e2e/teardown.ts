import { eq } from 'drizzle-orm';
import { getDb, closeDatabaseConnection } from '@/lib/db/client';
import {
  products,
  materials,
  deviceModels,
  deviceBrands,
  adminUsers,
  adminRoles,
} from '@/lib/db/schema';
import { assertLocalDatabaseUrl } from '../../scripts/assert-local-database';
import { fixtureIds as ids } from './fixtures';

export default async function teardown() {
  assertLocalDatabaseUrl();
  const db = getDb();
  try {
    await db.transaction(async (tx) => {
      await tx.delete(adminUsers).where(eq(adminUsers.id, ids.admin));
      await tx.delete(adminRoles).where(eq(adminRoles.id, ids.adminRole));
      await tx.delete(products).where(eq(products.id, ids.product));
      await tx.delete(materials).where(eq(materials.id, ids.material));
      await tx.delete(deviceModels).where(eq(deviceModels.id, ids.model));
      await tx.delete(deviceBrands).where(eq(deviceBrands.id, ids.brand));
    });
  } finally {
    await closeDatabaseConnection();
  }
}
