'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [msg, setMsg] = useState('Completing sign-in…');

  useEffect(() => {
    (async () => {
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (error) {
          setMsg(`Error: ${error.message}`);
          return;
        }
        setMsg('Signed in! Redirecting…');
        router.replace('/');
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
