import { describe, expect, it } from 'vitest';

import {
  buildAttributeCombinations,
  buildVariantName,
} from '@/lib/product-variants';

describe('product variant combinations', () => {
  it('generates a Cartesian product for attribute dimensions', () => {
    const combinations = buildAttributeCombinations([
      { name: '尺寸', values: ['小号', '大号'] },
      { name: '颜色', values: ['白色', '黑色'] },
    ]);
    expect(combinations).toHaveLength(4);
    expect(combinations).toContainEqual({ 尺寸: '小号', 颜色: '白色' });
    expect(combinations).toContainEqual({ 尺寸: '大号', 颜色: '黑色' });
    expect(buildVariantName(combinations[0]!)).toBe('小号 / 白色');
  });

  it('deduplicates values and ignores incomplete dimensions', () => {
    expect(
      buildAttributeCombinations([
        { name: '颜色', values: ['黑色', ' 黑色 ', '白色'] },
        { name: '', values: ['无效'] },
      ]),
    ).toEqual([{ 颜色: '黑色' }, { 颜色: '白色' }]);
  });
});
