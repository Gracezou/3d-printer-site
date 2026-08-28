import assert from 'node:assert/strict';

import { and, eq, inArray } from 'drizzle-orm';

import type { AdminIdentity } from '@/lib/auth/admin';
import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  adminOperationLogs,
  adminRoles,
  adminUsers,
  categories,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '@/lib/services/category.service';

async function main(): Promise<void> {
  const db = getDb();
  const categoryIds: string[] = [];

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
    const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);

    const parentA = await createCategory(
      {
        name: 'T032 一级分类 A',
        slug: `t032-a-${suffix}`,
        parentId: null,
        imageUrl: null,
        sortOrder: 10,
        isVisible: true,
      },
      context,
    );
    categoryIds.push(parentA.id);
    const parentB = await createCategory(
      {
        name: 'T032 一级分类 B',
        slug: `t032-b-${suffix}`,
        parentId: null,
        imageUrl: null,
        sortOrder: 20,
        isVisible: true,
      },
      context,
    );
    categoryIds.push(parentB.id);
    const child = await createCategory(
      {
        name: 'T032 二级分类',
        slug: `t032-child-${suffix}`,
        parentId: parentA.id,
        imageUrl: null,
        sortOrder: 0,
        isVisible: true,
      },
      context,
    );
    categoryIds.push(child.id);

    const initialTree = await listCategories();
    const testParentA = initialTree.list.find((node) => node.id === parentA.id);
    assert.equal(testParentA?.children[0]?.id, child.id);

    await assert.rejects(
      () =>
        createCategory(
          {
            name: '禁止的三级分类',
            slug: `t032-level3-${suffix}`,
            parentId: child.id,
            imageUrl: null,
            sortOrder: 0,
            isVisible: true,
          },
          context,
        ),
      (error: unknown) =>
        error instanceof BizError && error.message === '分类最多支持两级',
    );

    await updateCategory(parentA.id, { sortOrder: 30 }, context);
    await updateCategory(child.id, { parentId: parentB.id }, context);
    await updateCategory(child.id, { isVisible: false }, context);
    const reordered = await listCategories();
    const testRoots = reordered.list.filter((node) =>
      categoryIds.includes(node.id),
    );
    assert.deepEqual(
      testRoots.map((node) => node.id),
      [parentB.id, parentA.id],
    );
    assert.equal(testRoots[0]?.children[0]?.id, child.id);

    const publicTree = await listCategories({ visibleOnly: true });
    const publicParentB = publicTree.list.find(
      (node) => node.id === parentB.id,
    );
    assert.equal(publicParentB?.children.length, 0);

    await assert.rejects(
      () => deleteCategory(parentB.id, context),
      (error: unknown) =>
        error instanceof BizError && error.message.includes('子分类'),
    );

    await deleteCategory(child.id, context);
    await deleteCategory(parentB.id, context);
    await deleteCategory(parentA.id, context);

    const logs = await db
      .select({ action: adminOperationLogs.action })
      .from(adminOperationLogs)
      .where(inArray(adminOperationLogs.targetId, categoryIds));
    assert(logs.some((log) => log.action === 'category.create'));
    assert(logs.some((log) => log.action === 'category.update'));
    assert(logs.some((log) => log.action === 'category.delete'));
  } finally {
    if (categoryIds.length > 0) {
      await db
        .delete(adminOperationLogs)
        .where(inArray(adminOperationLogs.targetId, categoryIds));
      await db
        .delete(categories)
        .where(inArray(categories.id, categoryIds.reverse()));
    }
    await closeDatabaseConnection();
  }

  process.stdout.write(
    'Category integration tests passed; two-level tree, sorting, visibility, deletion guards, and audit logs verified.\n',
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Category integration tests failed: ${message}\n`);
  process.exitCode = 1;
});
