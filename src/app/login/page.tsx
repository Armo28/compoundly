'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus('Sending…');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
    });
    setStatus(error ? `Error: ${error.message}` : 'Check your email for the magic link.');
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <form onSubmit={sendLink} className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold mb-4">Sign in</h1>
        <label className="block text-sm mb-2">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full border rounded-lg h-11 px-3 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="you@example.com"
        />
        <button
          type="submit"
          className="w-full h-11 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          Send Magic Link
        </button>
        {status && <p className="text-xs text-gray-600 mt-3">{status}</p>}
      </form>
    </main>
  );
}
