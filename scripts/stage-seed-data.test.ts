import { describe, expect, it } from 'vitest';

import {
  stageMaterials,
  stageProducts,
  stagePromotions,
  validateStageSeedData,
} from './stage-seed-data';

describe('stage seed data', () => {
  it('contains the approved e-reader case catalog without legacy lamps', () => {
    expect(validateStageSeedData()).toEqual([]);
    expect(stageProducts).toHaveLength(5);
    expect(
      stageProducts.every((product) => product.name.includes('保护壳')),
    ).toBe(true);
    expect(JSON.stringify(stageProducts)).not.toContain('氛围灯');
    expect(stageProducts.flatMap((product) => product.variants)).toHaveLength(
      9,
    );
    expect(JSON.stringify(stageProducts)).not.toContain('灯');
  });

  it('contains practical materials and all three required promotion types', () => {
    expect(stageMaterials.map((item) => item.materialType)).toEqual(
      expect.arrayContaining(['PLA', 'PETG', 'TPU']),
    );
    expect(stagePromotions.map((item) => item.discountType)).toEqual(
      expect.arrayContaining(['fixed_amount', 'percentage', 'free_shipping']),
    );
    const percentage = stagePromotions.find(
      (item) => item.discountType === 'percentage',
    );
    expect(percentage?.discountValue).toBe('0.90');
  });
});
