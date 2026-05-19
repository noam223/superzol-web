'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// Inner component that reads search params and handles the OAuth code exchange
function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get('code');
    const next = searchParams.get('next') || '/';

    if (!code) {
      router.replace(next);
      return;
    }

    // Exchange the OAuth code for a session — this stores the session in
    // localStorage (via createBrowserClient) so all client-side getUser() calls work.
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        console.error('OAuth callback error:', error.message);
        router.replace('/login?error=oauth');
      } else {
        // Full page navigation so the new session is picked up everywhere
        window.location.href = next;
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
