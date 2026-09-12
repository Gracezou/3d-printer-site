import { describe, expect, it } from 'vitest';

import { createProductSchema } from './product';

const validProduct = {
  name: '适用于 Kindle Paperwhite 5',
  slug: 'kindle-paperwhite-5-case',
  gallery: [],
  specs: {},
  isFeatured: false,
  sortOrder: 0,
};

describe('product naming rules', () => {
  it('accepts compatibility wording', () => {
    expect(createProductSchema.safeParse(validProduct).success).toBe(true);
  });

  it.each(['官方 Kindle 保护壳', '原装同款保护壳', '品牌授权保护壳'])(
    'rejects misleading product name: %s',
    (name) => {
      const result = createProductSchema.safeParse({ ...validProduct, name });
      expect(result.success).toBe(false);
    },
  );
});
