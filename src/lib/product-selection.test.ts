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
  it('switches sparse combinations as a complete valid SKU', () => {
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
    ).toEqual({ size: '大号', color: '拼色' });
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
});
