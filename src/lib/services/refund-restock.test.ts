import { describe, expect, it } from 'vitest';

import type { BomSnapshotItem } from '@/lib/db/schema/order';

import { calculateRefundRestock } from './refund-restock';

const snapshot: BomSnapshotItem[] = [
  {
    material_id: 'b',
    material_name: '旧版黑色 PLA',
    grams: '12.00',
    waste_rate: '0.0500',
    required_grams: '12.60',
  },
  {
    material_id: 'a',
    material_name: '旧版白色 PLA',
    grams: '5.00',
    waste_rate: '0.0500',
    required_grams: '5.25',
  },
  {
    material_id: 'b',
    material_name: '旧版黑色 PLA 第二部件',
    grams: '1.00',
    waste_rate: '0.0500',
    required_grams: '1.05',
  },
];

describe('calculateRefundRestock', () => {
  it('uses snapshot grams and returned quantity, aggregated in material lock order', () => {
    expect(calculateRefundRestock(snapshot, 2)).toEqual([
      { materialId: 'a', grams: '10.50' },
      { materialId: 'b', grams: '27.30' },
    ]);
  });

  it('does not need or read the current variant BOM', () => {
    expect(calculateRefundRestock(snapshot, 1)).toEqual([
      { materialId: 'a', grams: '5.25' },
      { materialId: 'b', grams: '13.65' },
    ]);
  });

  it('rejects invalid quantities and snapshot weights', () => {
    expect(() => calculateRefundRestock(snapshot, 0)).toThrow();
    expect(() =>
      calculateRefundRestock([{ ...snapshot[0], required_grams: '-1.00' }], 1),
    ).toThrow('订单 BOM 快照无效');
  });
});
