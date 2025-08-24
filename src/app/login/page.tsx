'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle'|'sending'|'sent'|'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?type=magiclink`,
      },
    });

    if (error) {
      setStatus('error');
      setError(error.message);
      return;
    }
    setStatus('sent');
  };

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm">
        {status !== 'sent' ? (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="text-lg font-semibold">Sign in</div>
            <label className="block text-sm">
              <span className="text-gray-600">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </label>
            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
            >
              {status === 'sending' ? 'Sending…' : 'Send Magic Link'}
            </button>
            {status === 'error' && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </form>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="text-lg font-semibold">Check your email</div>
            <p>We sent you a magic link. Click it to finish signing in.</p>
          </div>
        )}
      </div>
    </main>
  );
}

