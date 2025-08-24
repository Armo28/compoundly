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
        // 1) Try PKCE/OAuth (?code=…) — ignore errors
        try {
          await supabase.auth.exchangeCodeForSession(window.location.href);
        } catch {}

        // 2) If we already have a session, redirect
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setMsg('Signed in! Redirecting…');
          router.replace('/');
          return;
        }

        // 3) Last resort: wait briefly for onAuthStateChange then check again
        await new Promise(r => setTimeout(r, 250));
        const again = await supabase.auth.getSession();
        if (again.data.session) {
          setMsg('Signed in! Redirecting…');
          router.replace('/');
          return;
        }

        setMsg('Error completing sign-in.');
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
