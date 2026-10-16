import { describe, expect, it } from 'vitest';
import { safeReturnPath } from './safe-return-path';

describe('customer login return path', () => {
  it('preserves a relative purchase path including query parameters', () => {
    expect(safeReturnPath('/products/case?device=one&resumePurchase=1')).toBe(
      '/products/case?device=one&resumePurchase=1',
    );
  });
  it('rejects external and browser-normalized external paths', () => {
    for (const path of [
      'https://evil.test',
      '//evil.test',
      '/\\evil.test',
      '/\n/evil.test',
      'javascript:alert(1)',
    ])
      expect(safeReturnPath(path)).toBe('/account/orders');
  });
});
