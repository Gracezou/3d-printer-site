import { SignJWT } from 'jose/jwt/sign';
import { jwtVerify } from 'jose/jwt/verify';

const TOKEN_ISSUER = '3d-printer-site';
const TOKEN_AUDIENCE = '3d-printer-site-admin';
export const ADMIN_COOKIE_NAME = 'admin_token';
export const ADMIN_SESSION_SECONDS = 8 * 60 * 60;

export interface AdminTokenClaims {
  sub: string;
  name: string;
  roleCode: string;
  permissions: string[];
}

function getSecret(): Uint8Array {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('ADMIN_JWT_SECRET must contain at least 32 characters');
  }
  return new TextEncoder().encode(secret);
}

export async function signAdminToken(
  claims: AdminTokenClaims,
): Promise<string> {
  return new SignJWT({
    name: claims.name,
    roleCode: claims.roleCode,
    permissions: claims.permissions,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyAdminToken(
  token: string,
): Promise<AdminTokenClaims> {
  const { payload } = await jwtVerify(token, getSecret(), {
    algorithms: ['HS256'],
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
  });

  if (
    !payload.sub ||
    typeof payload.name !== 'string' ||
    typeof payload.roleCode !== 'string' ||
    !Array.isArray(payload.permissions) ||
    !payload.permissions.every((permission) => typeof permission === 'string')
  ) {
    throw new Error('Invalid admin token payload');
  }

  return {
    sub: payload.sub,
    name: payload.name,
    roleCode: payload.roleCode,
    permissions: payload.permissions,
  };
}
