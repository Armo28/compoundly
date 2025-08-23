'use client';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { useState } from 'react';

export default function SignIn() {
  const supabase = useSupabaseClient();
  const [email, setEmail] = useState('');

  const send = async () => {
    const { error } = await supabase.auth.signInWithOtp({ email });
    alert(error ? error.message : 'Check your email for the magic link.');
  };

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-xl font-semibold mb-3">Sign in</h1>
      <input className="border p-2 w-full mb-3" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} />
      <button className="bg-black text-white px-4 py-2 rounded" onClick={send}>Send magic link</button>
    </div>
  );
}
