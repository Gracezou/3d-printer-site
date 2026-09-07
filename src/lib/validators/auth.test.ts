import { describe, expect, it } from 'vitest';

import {
  customerProfileSchema,
  sendCodeSchema,
  verifyCodeSchema,
} from '@/lib/validators/auth';

describe('customer auth validators', () => {
  it('normalizes email OTP input', () => {
    expect(sendCodeSchema.parse({ email: ' User@Example.COM ' })).toEqual({
      email: 'user@example.com',
    });
    expect(
      verifyCodeSchema.parse({ email: 'User@Example.COM', code: '123456' }),
    ).toEqual({ email: 'user@example.com', code: '123456' });
    expect(
      verifyCodeSchema.parse({ email: 'User@Example.COM', code: '12345678' }),
    ).toEqual({ email: 'user@example.com', code: '12345678' });
    expect(() =>
      verifyCodeSchema.parse({ email: 'User@Example.COM', code: '12345' }),
    ).toThrow();
  });

  it('accepts an optional mainland contact phone', () => {
    expect(
      customerProfileSchema.parse({ nickname: '测试用户', phone: '' }),
    ).toEqual({ nickname: '测试用户', phone: null });
    expect(() =>
      customerProfileSchema.parse({ nickname: '', phone: '123' }),
    ).toThrow();
  });
});
