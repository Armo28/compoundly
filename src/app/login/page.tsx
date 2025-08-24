'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    // Request an email OTP (6-digit code). No redirect links, no PKCE.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Optional: if you want to auto-create users
        shouldCreateUser: true,
      },
    });

    setBusy(false);
    if (error) {
      setMsg(`Error: ${error.message}`);
      return;
    }
    setMsg('Check your email for a 6-digit code.');
    setStep('code');
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    const { error } = await supabase.auth.verifyOtp({
      type: 'email',
      email,
      token, // the 6-digit code
    });

    setBusy(false);
    if (error) {
      setMsg(`Error: ${error.message}`);
      return;
    }
    setMsg('Signed in! Redirecting…');
    router.replace('/');
  };

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold mb-4">Sign in</h1>

        {step === 'email' && (
          <form onSubmit={sendCode}>
            <label className="text-sm text-gray-600">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full border rounded-lg h-11 px-3"
            />
            <button
              disabled={busy}
              className="mt-4 w-full h-11 rounded-lg bg-blue-600 text-white disabled:opacity-60"
            >
              {busy ? 'Sending…' : 'Send Code'}
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={verifyCode}>
            <div className="text-sm text-gray-700 mb-2">We sent a code to</div>
            <div className="text-sm font-medium mb-4">{email}</div>
            <label className="text-sm text-gray-600">6-digit code</label>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              required
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className="mt-1 w-full border rounded-lg h-11 px-3 tracking-widest"
            />
            <button
              disabled={busy || token.length !== 6}
              className="mt-4 w-full h-11 rounded-lg bg-blue-600 text-white disabled:opacity-60"
            >
              {busy ? 'Verifying…' : 'Verify & Sign In'}
            </button>
            <button
              type="button"
              className="mt-3 w-full h-10 rounded-lg border text-gray-700"
              onClick={() => { setStep('email'); setToken(''); }}
            >
              Use a different email
            </button>
          </form>
        )}

        {msg && <div className="mt-3 text-sm">{msg}</div>}
      </div>
    </main>
  );
}
