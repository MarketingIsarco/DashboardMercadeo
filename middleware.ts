import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/auth';

/**
 * Todo requiere sesión salvo el login. Esto cubre `/api/data`, que es la ruta
 * que realmente expone el CRM — sin ella el token de Pipedrive sería público
 * de facto.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isLoginPage = pathname === '/login';
  const isAuthApi = pathname.startsWith('/api/auth');
  if (isAuthApi) return NextResponse.next();

  const authed = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (authed) {
    if (isLoginPage) return NextResponse.redirect(new URL('/', req.url));
    return NextResponse.next();
  }

  if (isLoginPage) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
