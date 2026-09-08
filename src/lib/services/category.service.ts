import { and, asc, count, eq, isNull } from 'drizzle-orm';

import type { AdminIdentity } from '@/lib/auth/admin';
import { getDb } from '@/lib/db/client';
import { categories, products } from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import {
  type DbTransaction,
  withAdminLog,
} from '@/lib/services/admin-log.service';
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from '@/lib/validators/category';

interface WriteContext {
  admin: AdminIdentity;
  ip: string;
}

interface CategoryRow {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  imageUrl: string | null;
  sortOrder: number;
  isVisible: boolean;
  productCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryNode extends CategoryRow {
  children: CategoryNode[];
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23503'
  );
}

function throwCategoryConstraintError(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new BizError('PARAM_INVALID', '分类 Slug 已存在');
  }
  if (isForeignKeyViolation(error)) {
    throw new BizError('PARAM_INVALID', '分类仍被其他数据引用，无法删除');
  }
  throw error;
}

async function assertValidParent(
  tx: DbTransaction,
  parentId: string | null | undefined,
  categoryId?: string,
): Promise<void> {
  if (!parentId) return;
  if (parentId === categoryId) {
    throw new BizError('PARAM_INVALID', '分类不能成为自己的子分类');
  }

  const [parent] = await tx
    .select({ id: categories.id, parentId: categories.parentId })
    .from(categories)
    .where(eq(categories.id, parentId))
    .limit(1);
  if (!parent) {
    throw new BizError('PARAM_INVALID', '上级分类不存在');
  }
  if (parent.parentId) {
    throw new BizError('PARAM_INVALID', '分类最多支持两级');
  }

  if (categoryId) {
    const [children] = await tx
      .select({ total: count() })
      .from(categories)
      .where(eq(categories.parentId, categoryId));
    if ((children?.total ?? 0) > 0) {
      throw new BizError('PARAM_INVALID', '含子分类的分类不能移动到二级');
    }
  }
}

function toTree(rows: CategoryRow[]): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>();
  for (const row of rows) nodes.set(row.id, { ...row, children: [] });

  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children.push(node);
    } else if (!node.parentId) {
      roots.push(node);
    }
  }
  return roots;
}

export async function listCategories(options?: { visibleOnly?: boolean }) {
  const visibleOnly = options?.visibleOnly ?? false;
  const rows = await getDb()
    .select({
      id: categories.id,
      parentId: categories.parentId,
      name: categories.name,
      slug: categories.slug,
      imageUrl: categories.imageUrl,
      sortOrder: categories.sortOrder,
      isVisible: categories.isVisible,
      productCount: count(products.id),
      createdAt: categories.createdAt,
      updatedAt: categories.updatedAt,
    })
    .from(categories)
    .leftJoin(
      products,
      and(
        eq(products.categoryId, categories.id),
        isNull(products.deletedAt),
      ),
    )
    .where(visibleOnly ? eq(categories.isVisible, true) : undefined)
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder), asc(categories.createdAt));

  return { list: toTree(rows), total: rows.length };
}

export async function createCategory(
  input: CreateCategoryInput,
  context: WriteContext,
) {
  try {
    return await withAdminLog(
      async (tx) => {
        await assertValidParent(tx, input.parentId);
        const [created] = await tx.insert(categories).values(input).returning();
        if (!created) {
          throw new BizError('INTERNAL_ERROR', '创建分类失败');
        }
        return created;
      },
      {
        adminId: context.admin.sub,
        adminName: context.admin.name,
        action: 'category.create',
        targetType: 'category',
        targetId: (created) => created.id,
        payload: { slug: input.slug, parentId: input.parentId ?? null },
        ip: context.ip,
      },
    );
  } catch (error: unknown) {
    throwCategoryConstraintError(error);
  }
}

export async function updateCategory(
  categoryId: string,
  input: UpdateCategoryInput,
  context: WriteContext,
) {
  try {
    return await withAdminLog(
      async (tx) => {
        const [existing] = await tx
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.id, categoryId))
          .limit(1);
        if (!existing) {
          throw new BizError('NOT_FOUND', '分类不存在');
        }
        if ('parentId' in input) {
          await assertValidParent(tx, input.parentId, categoryId);
        }
        const [updated] = await tx
          .update(categories)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(categories.id, categoryId))
          .returning();
        return updated!;
      },
      {
        adminId: context.admin.sub,
        adminName: context.admin.name,
        action: 'category.update',
        targetType: 'category',
        targetId: categoryId,
        payload: { fields: Object.keys(input) },
        ip: context.ip,
      },
    );
  } catch (error: unknown) {
    throwCategoryConstraintError(error);
  }
}

export async function deleteCategory(
  categoryId: string,
  context: WriteContext,
): Promise<{ id: string; deleted: true }> {
  try {
    return await withAdminLog(
      async (tx) => {
        const [childCount] = await tx
          .select({ total: count() })
          .from(categories)
          .where(eq(categories.parentId, categoryId));
        if ((childCount?.total ?? 0) > 0) {
          throw new BizError('PARAM_INVALID', '请先删除或移动该分类下的子分类');
        }
        const [deleted] = await tx
          .delete(categories)
          .where(eq(categories.id, categoryId))
          .returning({ id: categories.id });
        if (!deleted) {
          throw new BizError('NOT_FOUND', '分类不存在');
        }
        return { id: deleted.id, deleted: true as const };
      },
      {
        adminId: context.admin.sub,
        adminName: context.admin.name,
        action: 'category.delete',
        targetType: 'category',
        targetId: categoryId,
        ip: context.ip,
      },
    );
  } catch (error: unknown) {
    throwCategoryConstraintError(error);
  }
}
