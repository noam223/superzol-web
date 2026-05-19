import { NextRequest, NextResponse } from 'next/server';

// Middleware only handles cookie passthrough — auth is enforced client-side per page.
// We do NOT block routes here because the Supabase JS client stores sessions in
// cookies that are only written after the first client-side render, so the middleware
// would always see an empty session on the very first navigation after login.

export async function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
