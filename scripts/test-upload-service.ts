import assert from 'node:assert/strict';

import { and, eq } from 'drizzle-orm';

import type { AdminIdentity } from '@/lib/auth/admin';
import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import { adminOperationLogs, adminRoles, adminUsers } from '@/lib/db/schema';
import { uploadAdminAsset } from '@/lib/services/upload.service';
import { remove } from '@/lib/storage';

async function main(): Promise<void> {
  const db = getDb();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'products';
  let uploadedPath: string | undefined;

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

    const png = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      't035-test.png',
      { type: 'application/x-msdownload' },
    );
    const uploaded = await uploadAdminAsset(png, 'image', {
      admin,
      ip: '127.0.0.1',
    });
    const marker = `/storage/v1/object/public/${bucket}/`;
    const markerIndex = uploaded.url.indexOf(marker);
    assert(markerIndex >= 0, 'public URL should contain the bucket path');
    uploadedPath = decodeURIComponent(
      uploaded.url.slice(markerIndex + marker.length),
    );

    const response = await fetch(uploaded.url);
    assert.equal(response.status, 200);
    assert.deepEqual(
      [...new Uint8Array(await response.arrayBuffer())],
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    );

    const [log] = await db
      .select({ action: adminOperationLogs.action })
      .from(adminOperationLogs)
      .where(eq(adminOperationLogs.targetId, uploadedPath))
      .limit(1);
    assert.equal(log?.action, 'storage.upload');
  } finally {
    if (uploadedPath) {
      await remove(bucket, uploadedPath);
      await db
        .delete(adminOperationLogs)
        .where(eq(adminOperationLogs.targetId, uploadedPath));
    }
    await closeDatabaseConnection();
  }

  process.stdout.write(
    'Storage upload integration test passed; public URL and audit log verified, test object removed.\n',
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Storage upload integration test failed: ${message}\n`);
  process.exitCode = 1;
});
