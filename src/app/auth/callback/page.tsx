'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// Inner component that handles the OAuth callback.
// With implicit flow, Supabase puts the token in the URL hash (#access_token=...).
// createBrowserClient detects this automatically via detectSessionInUrl.
// With PKCE flow (code in query param), we exchange it manually.
function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const next = searchParams.get('next') || '/';
    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      console.error('OAuth error:', errorParam, searchParams.get('error_description'));
      router.replace('/login?error=oauth');
      return;
    }

    if (code) {
      // PKCE flow: exchange code for session
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          console.error('OAuth callback error:', error.message);
          router.replace('/login?error=oauth');
        } else {
          window.location.href = next;
        }
      });
      return;
    }

    // Implicit flow: token is in the URL hash — createBrowserClient handles it automatically.
    // Just wait for the session to be set, then navigate.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        window.location.href = next;
      } else {
        // Give it a moment for the hash to be processed
        setTimeout(() => {
          supabase.auth.getSession().then(({ data: { session: s } }) => {
            if (s) {
              window.location.href = next;
            } else {
              router.replace('/login?error=oauth');
            }
          });
        }, 500);
      }
    });
  }, [router, searchParams]);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: '#DAD1CA' }}
    >
      <div
        className="animate-spin w-10 h-10 border-2 rounded-full"
        style={{ borderColor: '#BF2C2C', borderTopColor: 'transparent' }}
      />
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ background: '#DAD1CA' }}
        >
          <div
            className="animate-spin w-10 h-10 border-2 rounded-full"
            style={{ borderColor: '#BF2C2C', borderTopColor: 'transparent' }}
          />
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
