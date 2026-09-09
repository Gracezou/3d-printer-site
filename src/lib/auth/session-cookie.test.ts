import { describe, expect, it } from 'vitest';

import { shouldUseSecureSessionCookie } from './session-cookie';

describe('shouldUseSecureSessionCookie', () => {
  it('defaults to secure cookies for production builds', () => {
    expect(shouldUseSecureSessionCookie('production', undefined)).toBe(true);
  });

  it('allows an explicit HTTP preproduction override', () => {
    expect(shouldUseSecureSessionCookie('production', 'false')).toBe(false);
  });

  it('allows HTTPS staging to force secure cookies', () => {
    expect(shouldUseSecureSessionCookie('production', 'true')).toBe(true);
  });
});
