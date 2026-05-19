import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

// Public routes that don't require authentication
const PUBLIC_PATHS = [
  '/login',
  '/auth/callback',
  '/shopping-list/join', // shared list join page
];

// Static assets and API routes that should pass through
const BYPASS_PREFIXES = [
  '/_next',
  '/api',
  '/icons',
  '/manifest.json',
  '/favicon',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Bypass static assets and API routes
  if (BYPASS_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Create a response to potentially modify cookies on
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          // Refresh session cookies on both request and response
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // This refreshes the session if expired — important for SSR
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  // Debug: log auth state on every protected request
  console.log('[middleware]', {
    pathname,
    hasUser: !!user,
    userId: user?.id ?? null,
    authError: authError?.message ?? null,
    cookieNames: request.cookies.getAll().map(c => c.name),
  });

  if (!user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    console.log('[middleware] no user → redirect to', loginUrl.toString());
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
