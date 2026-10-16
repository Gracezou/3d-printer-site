import { describe, expect, it } from 'vitest';

import {
  optionHasStock,
  selectCompatibleAttributes,
} from './product-selection';

const variants = [
  { id: 'small-black', selection: { size: '小号', color: '黑色' } },
  { id: 'large-color', selection: { size: '大号', color: '拼色' } },
];

describe('product selection', () => {
  it('clears conflicting attributes without silently choosing a different color', () => {
    const stock = new Map([
      ['small-black', 3],
      ['large-color', 2],
    ]);
    expect(
      selectCompatibleAttributes(
        variants,
        stock,
        { size: '小号', color: '黑色' },
        'size',
        '大号',
      ),
    ).toEqual({ size: '大号' });
  });

  it('allows the selected dimension to be cleared', () => {
    expect(
      selectCompatibleAttributes(
        variants,
        new Map([['small-black', 1]]),
        { size: '小号', color: '黑色' },
        'size',
        '小号',
      ),
    ).toEqual({ color: '黑色' });
  });

  it('only disables a value when every matching SKU is out of stock', () => {
    const stock = new Map([
      ['small-black', 1],
      ['large-color', 0],
    ]);
    expect(optionHasStock(variants, stock, 'color', '黑色')).toBe(true);
    expect(optionHasStock(variants, stock, 'color', '拼色')).toBe(false);
  });

  it('can reach each valid combination regardless of selection order', () => {
    const stock = new Map(variants.map((variant) => [variant.id, 2]));
    for (const target of variants) {
      for (const keys of [
        ['size', 'color'],
        ['color', 'size'],
      ]) {
        let selected: Record<string, string> = {};
        for (const key of keys)
          selected = selectCompatibleAttributes(
            variants,
            stock,
            selected,
            key,
            target.selection[key as 'size' | 'color'],
          );
        expect(selected).toEqual(target.selection);
      }
    }
  });

  it('retains compatible dimensions but does not fill unselected dimensions', () => {
    const options = [
      { id: 'one', selection: { size: 'M', color: '黑色', material: 'PLA' } },
    ];
    expect(
      selectCompatibleAttributes(
        options,
        new Map([['one', 2]]),
        { color: '黑色' },
        'size',
        'M',
      ),
    ).toEqual({ color: '黑色', size: 'M' });
  });
});
