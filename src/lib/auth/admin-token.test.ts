import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { signAdminToken, verifyAdminToken } from '@/lib/auth/admin-token';

const previousSecret = process.env.ADMIN_JWT_SECRET;

beforeEach(() => {
  process.env.ADMIN_JWT_SECRET =
    'test-secret-that-is-longer-than-thirty-two-characters';
});

afterEach(() => {
  if (previousSecret === undefined) {
    delete process.env.ADMIN_JWT_SECRET;
  } else {
    process.env.ADMIN_JWT_SECRET = previousSecret;
  }
});

describe('admin JWT', () => {
  it('round-trips the required claims', async () => {
    const claims = {
      sub: crypto.randomUUID(),
      name: '测试管理员',
      roleCode: 'operator',
      permissions: ['order:view'],
    };
    const token = await signAdminToken(claims);
    await expect(verifyAdminToken(token)).resolves.toEqual(claims);
  });

  it('rejects a tampered token', async () => {
    const token = await signAdminToken({
      sub: crypto.randomUUID(),
      name: '测试管理员',
      roleCode: 'operator',
      permissions: [],
    });
    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
    await expect(verifyAdminToken(tampered)).rejects.toThrow();
  });
});
