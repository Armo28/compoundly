'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

function parseHashTokens(hash: string) {
  // hash like: #access_token=...&expires_in=...&refresh_token=...&token_type=bearer&...
  const q = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const access_token = q.get('access_token') || '';
  const refresh_token = q.get('refresh_token') || '';
  return { access_token, refresh_token };
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [msg, setMsg] = useState('Completing sign-in…');

  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);

        // 1) Magic link case: tokens in the fragment/hash
        if (url.hash && url.hash.includes('access_token')) {
          const { access_token, refresh_token } = parseHashTokens(url.hash);
          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (error) throw error;
            setMsg('Signed in! Redirecting…');
            router.replace('/');
            return;
          }
        }

        // 2) PKCE / OAuth case: ?code= in the query
        const code = url.searchParams.get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(url.toString());
          if (error) throw error;
          setMsg('Signed in! Redirecting…');
          router.replace('/');
          return;
        }

        // Nothing we can handle
        setMsg('No auth information in URL. Please try signing in again.');
      } catch (e: any) {
        setMsg(`Error: ${e?.message ?? 'unknown'}`);
      }
    })();
  }, [router]);

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm text-sm">
        {msg}
      </div>
    </main>
  );
}
