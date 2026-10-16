import { describe, expect, it } from 'vitest';
import {
  orderListHref,
  orderListReturnHref,
  parseOrderListQuery,
} from './order-list-navigation';

describe('order list navigation', () => {
  it('normalizes filters and invalid pages', () => {
    expect(
      parseOrderListQuery(new URLSearchParams('status=shipped&page=2')),
    ).toEqual({ status: 'shipped', page: 2 });
    for (const value of [
      '-1',
      '1.5',
      'Infinity',
      '9007199254740992',
      'oops',
      '0',
    ]) {
      expect(
        parseOrderListQuery(
          new URLSearchParams(`status=unknown&page=${value}`),
        ),
      ).toEqual({ status: 'all', page: 1 });
    }
    expect(orderListHref('all', 1)).toBe('/account/orders');
  });
  it('keeps only safe order-list filters in the detail return link', () => {
    expect(
      orderListReturnHref(
        '/account/orders?status=shipped&page=2&next=https://example.com',
      ),
    ).toBe('/account/orders?status=shipped&page=2');
    for (const value of [
      null,
      '//example.com',
      '/account/orders/other?status=shipped',
      'https://example.com/account/orders?status=shipped',
    ]) {
      expect(orderListReturnHref(value)).toBe('/account/orders');
    }
  });
});
