'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [msg, setMsg] = useState('Completing sign-in…');

  useEffect(() => {
    (async () => {
      try {
        // 1) Magic-link & recovery (tokens in URL hash)
        const res1 = await supabase.auth.getSessionFromUrl({ storeSession: true });
        if (!res1.error) {
          setMsg('Signed in! Redirecting…');
          router.replace('/');
          return;
        }

        // 2) Fallback: PKCE/OAuth (?code= in query)
        const res2 = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (!res2.error) {
          setMsg('Signed in! Redirecting…');
          router.replace('/');
          return;
        }

        setMsg(`Error: ${(res2.error || res1.error)?.message}`);
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
