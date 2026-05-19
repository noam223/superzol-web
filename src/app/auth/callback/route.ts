import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') || '/';

  if (code) {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    // Exchange code for session (logs in the Google user)
    const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

    // Auto-link: if service role key available, try to merge with existing email+password account
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!sessionError && sessionData?.user && serviceRoleKey) {
      const googleUser = sessionData.user;
      const googleEmail = googleUser.email;
      const isGoogleProvider = googleUser.identities?.some(i => i.provider === 'google');
      const hasEmailProvider = googleUser.identities?.some(i => i.provider === 'email');

      // Only proceed if this is a pure Google user (no email+password identity yet)
      if (googleEmail && isGoogleProvider && !hasEmailProvider) {
        try {
          const adminClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            serviceRoleKey,
            { auth: { autoRefreshToken: false, persistSession: false } }
          );

          // Find existing email+password user with same email
          const { data: { users } } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
          const existingUser = users?.find(
            u => u.email === googleEmail &&
            u.id !== googleUser.id &&
            u.identities?.some(i => i.provider === 'email')
          );

          if (existingUser) {
            // Use Supabase Admin REST API to link identity
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
            await fetch(
              `${supabaseUrl}/auth/v1/admin/users/${existingUser.id}/identities`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': serviceRoleKey,
                  'Authorization': `Bearer ${serviceRoleKey}`,
                },
                body: JSON.stringify({
                  provider: 'google',
                  identity_data: {
                    email: googleEmail,
                    sub: googleUser.identities?.find(i => i.provider === 'google')?.identity_data?.sub,
                  },
                }),
              }
            );

            // Delete the duplicate Google-only user
            await adminClient.auth.admin.deleteUser(googleUser.id);

            // Note: user will need to sign in again after linking
            // Redirect to login with a message
            return NextResponse.redirect(
              new URL('/login?linked=1', requestUrl.origin)
            );
          }
        } catch (linkError) {
          console.error('Account linking failed:', linkError);
        }
      }
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
