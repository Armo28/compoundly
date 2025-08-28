'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';

export default function RoomPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? null;

  const [tfsa, setTfsa] = useState<number>(0);
  const [rrsp, setRrsp] = useState<number>(0);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setMsg(null);
    try {
      const res = await fetch('/api/rooms', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed');
      setTfsa(Number(json.room?.tfsa ?? 0));
      setRrsp(Number(json.room?.rrsp ?? 0));
    } catch (e:any) {
      setMsg(e?.message ?? 'Error');
    }
  }

  useEffect(()=>{ if (token) load(); }, [token]);

  async function save() {
    setMsg(null);
    try {
      const res = await fetch('/api/rooms', {
        method:'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ tfsa, rrsp }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed');
      setMsg('Saved!');
    } catch (e:any) {
      setMsg(e?.message ?? 'Error');
    }
  }

  return (
    <main className="max-w-xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-4">Contribution Room (This Year)</h1>

      {!token && (
        <div className="rounded-lg border bg-yellow-50 text-yellow-900 p-3 mb-4">
          Sign in to manage contribution room.
        </div>
      )}

      <div className="rounded-xl border bg-white p-4 space-y-3">
        <label className="block">
          <span className="text-sm text-gray-600">TFSA room</span>
          <input type="number" className="mt-1 w-full border rounded-lg px-3 py-2"
                 value={tfsa} onChange={(e)=>setTfsa(Number(e.target.value||0))}/>
        </label>
        <label className="block">
          <span className="text-sm text-gray-600">RRSP room</span>
          <input type="number" className="mt-1 w-full border rounded-lg px-3 py-2"
                 value={rrsp} onChange={(e)=>setRrsp(Number(e.target.value||0))}/>
        </label>
        <button onClick={save} disabled={!token}
          className="rounded-lg bg-blue-600 text-white px-4 py-2 disabled:opacity-50">Save</button>
        {msg && <p className="text-sm mt-2">{msg}</p>}
      </div>
    </main>
  );
}
