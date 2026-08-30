import { describe, expect, it } from 'vitest';

import { addCartItemSchema, updateCartItemSchema } from '@/lib/validators/cart';

describe('cart input validation', () => {
  it('rejects unknown fields when adding an item', () => {
    expect(() =>
      addCartItemSchema.parse({
        variantId: '11111111-1111-4111-8111-111111111111',
        quantity: 1,
        price: '0.01',
      }),
    ).toThrow();
  });

  it('rejects unknown fields when changing quantity', () => {
    expect(() =>
      updateCartItemSchema.parse({ quantity: 1, userId: 'another-user' }),
    ).toThrow();
  });
});
