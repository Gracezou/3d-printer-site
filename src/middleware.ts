import { NextResponse, type NextRequest } from 'next/server';

import { ADMIN_COOKIE_NAME, verifyAdminToken } from '@/lib/auth/admin-token';

function unauthorizedAdminResponse(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith('/api/admin/')) {
    return NextResponse.json(
      { code: 40101, data: null, message: '后台登录已失效' },
      { status: 401 },
    );
  }

  const loginUrl = new URL('/admin/login', request.url);
  loginUrl.searchParams.set(
    'next',
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(loginUrl);
}

async function hasValidAdminToken(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) {
    return false;
  }

  try {
    await verifyAdminToken(token);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
  const isAdminApi = pathname.startsWith('/api/admin/');
  const isPublicAdminRoute =
    pathname === '/admin/login' || pathname === '/api/admin/auth/login';

  if ((isAdminRoute || isAdminApi) && !isPublicAdminRoute) {
    if (!(await hasValidAdminToken(request))) {
      return unauthorizedAdminResponse(request);
    }
  }

  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
