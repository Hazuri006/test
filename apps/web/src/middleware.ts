import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/legal'];

/**
 * Redirection UX uniquement : la vraie autorisation est vérifiée par l'API
 * (session HTTP-only) sur chaque requête. Ici on évite juste d'afficher des
 * pages vides aux visiteurs sans cookie de session.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has('yurei_session');
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  if (hasSession && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|api).*)'],
};
