import { afterEach, describe, expect, it } from 'vitest';

import { GET } from './route';

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (originalSiteUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }
});

describe('Alipay return route', () => {
  it('redirects to the configured public site instead of the container origin', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'http://188.239.16.176:5003';

    const response = await GET(
      new Request(
        'http://0.0.0.0:3000/api/payments/alipay/return?out_trade_no=20260909000093-731380',
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://188.239.16.176:5003/checkout/pay/result?outTradeNo=20260909000093-731380',
    );
  });

  it('does not forward an invalid trade number', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://staging.example.com/';

    const response = await GET(
      new Request(
        'http://0.0.0.0:3000/api/payments/alipay/return?out_trade_no=invalid%20value',
      ),
    );

    expect(response.headers.get('location')).toBe(
      'https://staging.example.com/checkout/pay/result',
    );
  });
});
