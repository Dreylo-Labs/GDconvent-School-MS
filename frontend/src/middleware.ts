import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Files in /public (logos, photos, manifest assets, etc.) must remain
  // available before authentication so the login page can render them.
  if (/\.[^/]+$/.test(request.nextUrl.pathname)) return NextResponse.next();
  const hasSession = Boolean(request.cookies.get('gd_session')?.value);
  const isLogin = request.nextUrl.pathname === '/login';
  if (!hasSession && !isLogin) return NextResponse.redirect(new URL('/login', request.url));
  if (hasSession && isLogin) return NextResponse.redirect(new URL('/', request.url));
  return NextResponse.next();
}

export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico|design).*)'] };
