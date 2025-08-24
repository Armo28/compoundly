'use client';
import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('Sending magic link…');

    const origin =
      typeof window !== 'undefined'
        ? window.location.origin
        : process.env.NEXT_PUBLIC_SITE_URL || '';

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    });

    setMsg(error ? `Error: ${error.message}` : 'Check your email for the sign-in link.');
  };

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm text-sm"
      >
        <h1 className="text-lg font-semibold mb-4">Sign in</h1>
        <label className="block text-xs text-gray-600 mb-1">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full border rounded-lg h-10 px-3 mb-3"
        />
        <button type="submit" className="w-full h-10 rounded-lg bg-blue-600 text-white font-medium">
          Send Magic Link
        </button>
        {msg && <div className="mt-3 text-gray-600">{msg}</div>}
      </form>
    </main>
  );
}
