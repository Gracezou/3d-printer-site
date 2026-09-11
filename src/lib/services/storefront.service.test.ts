import { describe, expect, it } from 'vitest';

import {
  excludeFeaturedProducts,
  type StorefrontProduct,
} from './storefront.service';

function product(id: string): StorefrontProduct {
  return {
    id,
    name: `商品 ${id}`,
    slug: id,
    subtitle: null,
    mainImageUrl: null,
    minPrice: '10.00',
    isSoldOut: false,
  };
}

describe('excludeFeaturedProducts', () => {
  it('removes featured products while preserving newest order', () => {
    expect(
      excludeFeaturedProducts(
        [product('featured')],
        [product('new-1'), product('featured'), product('new-2')],
      ).map((item) => item.id),
    ).toEqual(['new-1', 'new-2']);
  });

  it('does not repeat products to fill a short section', () => {
    expect(
      excludeFeaturedProducts(
        [product('featured')],
        [product('featured'), product('only-new')],
        8,
      ).map((item) => item.id),
    ).toEqual(['only-new']);
  });

  it('respects the display limit', () => {
    expect(
      excludeFeaturedProducts(
        [],
        [product('1'), product('2'), product('3')],
        2,
      ).map((item) => item.id),
    ).toEqual(['1', '2']);
  });
});
