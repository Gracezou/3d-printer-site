import { getDb } from '@/lib/db/client';
import { adminOperationLogs } from '@/lib/db/schema';

type TransactionCallback = Parameters<
  ReturnType<typeof getDb>['transaction']
>[0];
export type DbTransaction = Parameters<TransactionCallback>[0];

export interface AdminLogContext {
  adminId: string;
  adminName: string;
  action: string;
  targetType?: string;
  targetId?: string;
  payload?: Record<string, unknown>;
  ip?: string;
}

export async function withAdminLog<T>(
  context: AdminLogContext,
  operation: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(async (tx) => {
    const result = await operation(tx);
    await tx.insert(adminOperationLogs).values({
      adminId: context.adminId,
      adminName: context.adminName,
      action: context.action,
      targetType: context.targetType,
      targetId: context.targetId,
      payload: context.payload,
      ip: context.ip,
    });
    return result;
  });
}
