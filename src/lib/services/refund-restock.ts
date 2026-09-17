import Decimal from 'decimal.js';

import type { BomSnapshotItem } from '@/lib/db/schema/order';

export interface RefundRestockMaterial {
  materialId: string;
  grams: string;
}

/** Uses the immutable order-item BOM snapshot, never the current variant BOM. */
export function calculateRefundRestock(
  bomSnapshot: BomSnapshotItem[],
  quantity: number,
): RefundRestockMaterial[] {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new RangeError('返库数量必须是正整数');
  }

  const gramsByMaterial = new Map<string, Decimal>();
  for (const material of bomSnapshot) {
    const requiredGrams = new Decimal(material.required_grams);
    if (
      !material.material_id ||
      !requiredGrams.isFinite() ||
      requiredGrams.lte(0) ||
      requiredGrams.decimalPlaces() > 2
    ) {
      throw new RangeError('订单 BOM 快照无效');
    }
    const grams = requiredGrams.mul(quantity);
    gramsByMaterial.set(
      material.material_id,
      (gramsByMaterial.get(material.material_id) ?? new Decimal(0)).plus(grams),
    );
  }

  return [...gramsByMaterial.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([materialId, grams]) => ({ materialId, grams: grams.toFixed(2) }));
}
