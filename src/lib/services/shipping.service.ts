import Decimal from 'decimal.js';
import { asc, eq } from 'drizzle-orm';

import { getDb } from '@/lib/db/client';
import { shippingRules } from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import { toFixed2, type DecimalValue } from '@/lib/money';
import type { DbTransaction } from '@/lib/services/admin-log.service';

export interface ShippingQuote {
  amount: string;
  ruleId: string;
  ruleName: string;
  isFree: boolean;
}

export async function calculateShipping(
  provinceCode: string,
  totalWeightGrams: DecimalValue,
  itemsAmount: DecimalValue,
  tx?: DbTransaction,
): Promise<ShippingQuote> {
  const executor = tx ?? getDb();
  const rules = await executor
    .select()
    .from(shippingRules)
    .where(eq(shippingRules.isActive, true))
    .orderBy(asc(shippingRules.sortOrder), asc(shippingRules.createdAt));
  const rule =
    rules.find((item) => item.provinceCodes.includes(provinceCode)) ??
    rules.find((item) => item.provinceCodes.length === 0);
  if (!rule) throw new BizError('INTERNAL_ERROR', '暂未配置可用的配送规则');

  const subtotal = new Decimal(itemsAmount);
  if (
    rule.freeThreshold !== null &&
    subtotal.greaterThanOrEqualTo(rule.freeThreshold)
  ) {
    return {
      amount: '0.00',
      ruleId: rule.id,
      ruleName: rule.name,
      isFree: true,
    };
  }

  const weight = Decimal.max(new Decimal(totalWeightGrams), 0);
  const firstWeight = new Decimal(rule.firstWeightGrams);
  const additionalWeight = new Decimal(rule.additionalWeightGrams);
  if (additionalWeight.lessThanOrEqualTo(0)) {
    throw new BizError('INTERNAL_ERROR', '配送规则的续重必须大于 0');
  }
  const additionalUnits = Decimal.max(weight.minus(firstWeight), 0)
    .div(additionalWeight)
    .ceil();
  const amount = new Decimal(rule.firstAmount).add(
    additionalUnits.mul(rule.additionalAmount),
  );
  return {
    amount: toFixed2(amount),
    ruleId: rule.id,
    ruleName: rule.name,
    isFree: false,
  };
}
