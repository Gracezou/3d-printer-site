import { describe, expect, it } from 'vitest';

import { add, mul, percent, sub, toFixed2 } from '@/lib/money';

describe('money helpers', () => {
  it('adds decimal values without floating point drift', () => {
    expect(toFixed2(add('0.10', '0.20'))).toBe('0.30');
  });

  it('subtracts decimal values', () => {
    expect(toFixed2(sub('100.00', '19.99'))).toBe('80.01');
  });

  it('multiplies decimal values', () => {
    expect(toFixed2(mul('59.00', 2))).toBe('118.00');
  });

  it('rounds percentage discounts down to two decimals', () => {
    expect(percent('19.99', '0.333').toFixed(2)).toBe('6.65');
  });

  it('formats amounts to exactly two decimal places', () => {
    expect(toFixed2('1')).toBe('1.00');
    expect(toFixed2('1.005')).toBe('1.01');
  });
});
