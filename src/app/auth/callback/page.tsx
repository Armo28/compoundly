'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [msg, setMsg] = useState('Completing sign-in…');

  useEffect(() => {
    (async () => {
      try {
        const hash = window.location.hash || '';
        if (hash.includes('access_token=')) {
          const anyAuth = (supabase.auth as any);
          if (typeof anyAuth.getSessionFromUrl === 'function') {
            const { error } = await anyAuth.getSessionFromUrl({ storeSession: true });
            if (!error) { setMsg('Signed in! Redirecting…'); router.replace('/'); return; }
          }
        }
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (!error) { setMsg('Signed in! Redirecting…'); router.replace('/'); return; }
        setMsg('Error completing sign-in.');
      } catch (e: any) {
        setMsg(`Error: ${e?.message ?? 'unknown'}`);
      }
    })();
  }, [router]);

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm text-sm">{msg}</div>
    </main>
  );
}
