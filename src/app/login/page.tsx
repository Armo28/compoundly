'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22c55e"/><stop offset="100%" stopColor="#16a34a"/>
        </linearGradient>
      </defs>
      <rect rx="6" ry="6" width="28" height="28" fill="url(#g)"/>
      <path d="M7 15c3-5 6-5 9 0 3 5 6 5 9 0" fill="none" stroke="white" strokeWidth="2"/>
    </svg>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle'|'sending'|'sent'|'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending'); setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) { setStatus('error'); setError(error.message); return; }
    setStatus('sent');
  }

  return (
    <main className="min-h-[80vh] flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <Logo /><div className="text-lg font-semibold">Sign in to Compoundly</div>
        </div>
        {status !== 'sent' ? (
          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block text-sm">
              <span className="text-gray-600">Email</span>
              <input type="email" required value={email} onChange={(e)=>setEmail(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="you@example.com" />
            </label>
            <button type="submit" disabled={status==='sending'} className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-60">
              {status==='sending' ? 'Sending…' : 'Send Magic Link'}
            </button>
            {status==='error' && <p className="text-sm text-red-600">{error}</p>}
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
