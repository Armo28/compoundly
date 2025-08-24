'use client';

import { useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase =
  typeof window !== 'undefined'
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
    : (null as any);

function AuthUrlHandler() {
  useEffect(() => {
    if (typeof window === 'undefined' || !supabase) return;

    (async () => {
      try {
        const url = new URL(window.location.href);
        const hasHash = !!url.hash;
        const hasCode = url.searchParams.has('code');

        // Try magic-link / recovery (hash tokens) first
        if (hasHash) {
          const res = await supabase.auth.getSessionFromUrl({ storeSession: true });
          if (!res.error) {
            // clean URL (remove tokens) and go home
            window.history.replaceState({}, '', url.origin + url.pathname);
            window.location.replace('/');
            return;
          }
        }

        // Try PKCE / OAuth (?code=…)
        if (hasCode) {
          const res = await supabase.auth.exchangeCodeForSession(window.location.href);
          if (!res.error) {
            // clean URL (remove tokens) and go home
            url.searchParams.delete('code');
            url.searchParams.delete('state');
            window.history.replaceState({}, '', url.toString());
            window.location.replace('/');
            return;
          }
        }
      } catch {
        // ignore — user is probably just visiting normally
      }
    })();
  }, []);

  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthUrlHandler />
      {children}
    </>
  );
}
