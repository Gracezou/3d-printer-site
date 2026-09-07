import { describe, expect, it } from 'vitest';

import { getProductSpecLabel, productDimensionLabels } from './display-labels';

describe('storefront display labels', () => {
  it('translates internal product keys but preserves unknown business labels', () => {
    expect(getProductSpecLabel('process')).toBe('打印工艺');
    expect(getProductSpecLabel('usage')).toBe('用途');
    expect(getProductSpecLabel('自定义参数')).toBe('自定义参数');
    expect(productDimensionLabels.variant).toBe('规格');
  });
});
