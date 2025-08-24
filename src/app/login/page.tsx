'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle'|'sending'|'sent'|'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setError(null);

    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/auth/callback`
        : '/auth/callback';

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        // leave out shouldCreateUser to use project defaults, or set true:
        // shouldCreateUser: true,
      },
    });

    if (error) {
      setStatus('error');
      setError(error.message);
    } else {
      setStatus('sent');
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold mb-4">Sign in</h1>

        {status === 'sent' ? (
          <p className="text-sm text-gray-700">
            We sent a magic link to <span className="font-medium">{email}</span>. Check your email and click the link to finish signing in.
          </p>
        ) : (
          <form onSubmit={sendLink} className="space-y-3">
            <label className="block text-sm">
              <span className="text-gray-700">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full h-11 rounded-md border px-3"
              />
            </label>

            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full h-11 rounded-md bg-blue-600 text-white font-medium disabled:opacity-60"
            >
              {status === 'sending' ? 'Sending…' : 'Send Magic Link'}
            </button>

            {status === 'error' && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
