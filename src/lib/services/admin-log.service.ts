import { getDb } from '@/lib/db/client';
import { adminOperationLogs } from '@/lib/db/schema';

type TransactionCallback = Parameters<
  ReturnType<typeof getDb>['transaction']
>[0];
export type DbTransaction = Parameters<TransactionCallback>[0];

export interface AdminLogContext<T> {
  adminId: string;
  adminName: string;
  action: string;
  targetType?: string;
  targetId?: string | ((result: T) => string | undefined);
  payload?:
    | Record<string, unknown>
    | ((result: T) => Record<string, unknown> | undefined);
  ip?: string;
}

export async function withAdminLog<T>(
  operation: (tx: DbTransaction) => Promise<T>,
  context: AdminLogContext<T>,
): Promise<T> {
  return getDb().transaction(async (tx) => {
    const result = await operation(tx);
    const targetId =
      typeof context.targetId === 'function'
        ? context.targetId(result)
        : context.targetId;
    const payload =
      typeof context.payload === 'function'
        ? context.payload(result)
        : context.payload;
    await tx.insert(adminOperationLogs).values({
      adminId: context.adminId,
      adminName: context.adminName,
      action: context.action,
      targetType: context.targetType,
      targetId,
      payload,
      ip: context.ip,
    });
    return result;
  });
}
