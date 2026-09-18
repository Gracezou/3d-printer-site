import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@/lib/db/client';
import { settings } from '@/lib/db/schema';
import type { DbTransaction } from '@/lib/services/admin-log.service';

export const RETURN_RULES_SETTING_KEY = 'return_request_rules';

const returnRulesSchema = z
  .object({
    ordinaryAllowedPrintStatuses: z.array(z.string().min(1)).min(1),
    exceptionReasonCodes: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type ReturnRules = z.infer<typeof returnRulesSchema>;

export const DEFAULT_RETURN_RULES: ReturnRules = {
  ordinaryAllowedPrintStatuses: ['queued'],
  exceptionReasonCodes: ['size_mismatch', 'assembly_issue'],
};

export async function getReturnRules(
  db: DbTransaction | ReturnType<typeof getDb> = getDb(),
): Promise<ReturnRules> {
  const [record] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, RETURN_RULES_SETTING_KEY))
    .limit(1);
  if (!record) return DEFAULT_RETURN_RULES;
  return returnRulesSchema.parse(record.value);
}

export function isReturnException(
  reasonCode: string,
  rules: ReturnRules,
): boolean {
  return rules.exceptionReasonCodes.includes(reasonCode);
}

export function canCustomerRequestReturn(
  printStatus: string | null,
  reasonCode: string,
  rules: ReturnRules,
): boolean {
  if (isReturnException(reasonCode, rules)) return printStatus !== null;
  return (
    printStatus !== null &&
    rules.ordinaryAllowedPrintStatuses.includes(printStatus)
  );
}
