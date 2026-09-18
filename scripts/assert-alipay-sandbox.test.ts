import { describe, expect, it } from 'vitest';

import { assertAlipaySandboxGateway } from './assert-alipay-sandbox';

describe('assertAlipaySandboxGateway', () => {
  it('accepts an HTTPS Alipay sandbox gateway', () => {
    expect(
      assertAlipaySandboxGateway(
        'https://openapi-sandbox.dl.alipaydev.com/gateway.do',
      ).hostname,
    ).toBe('openapi-sandbox.dl.alipaydev.com');
  });

  it.each<{ gateway: string | undefined; description: string }>([
    { gateway: undefined, description: 'missing' },
    { gateway: '', description: 'empty' },
    {
      gateway: 'https://openapi.alipay.com/gateway.do',
      description: 'production',
    },
    {
      gateway: 'https://alipaydev.com/gateway.do',
      description: 'apex domain',
    },
    {
      gateway: 'https://alipaydev.com.evil.example/gateway.do',
      description: 'lookalike domain',
    },
    {
      gateway: 'http://openapi-sandbox.dl.alipaydev.com/gateway.do',
      description: 'plain HTTP',
    },
  ])('rejects a $description gateway', ({ gateway }) => {
    expect(() => assertAlipaySandboxGateway(gateway)).toThrow(/ALIPAY_GATEWAY/);
  });
});
