import { describe, expect, it } from 'vitest';

import { storefrontProductListQuerySchema } from './storefront';

describe('storefront product list query', () => {
  it('normalizes empty native form values without dropping valid filters', () => {
    expect(
      storefrontProductListQuerySchema.parse({
        keyword: '几何',
        categoryId: '',
        materialType: '',
        minPrice: '',
        maxPrice: '',
        sort: 'default',
      }),
    ).toMatchObject({ keyword: '几何', sort: 'default', page: 1 });
  });
});
