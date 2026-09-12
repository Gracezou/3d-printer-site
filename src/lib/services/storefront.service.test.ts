import { describe, expect, it } from 'vitest';

import {
  excludeFeaturedProducts,
  hasPostgresErrorCode,
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

describe('hasPostgresErrorCode', () => {
  it('finds a database code on a wrapped query error', () => {
    expect(
      hasPostgresErrorCode(
        { cause: { code: '42P01' } },
        '42P01',
      ),
    ).toBe(true);
  });

  it('does not hide unrelated database failures', () => {
    expect(hasPostgresErrorCode({ cause: { code: '23505' } }, '42P01')).toBe(
      false,
    );
  });
});
