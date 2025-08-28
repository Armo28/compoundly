'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';

type Child = { id: string; name: string; birth_year: number };

export default function GoalsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? null;

  // read-only room pulled from /room API (no editing here)
  const [tfsa, setTfsa] = useState<number>(0);
  const [rrsp, setRrsp] = useState<number>(0);

  // children
  const [children, setChildren] = useState<Child[]>([]);
  const [childName, setChildName] = useState('');
  const [childYear, setChildYear] = useState<number>(0);

  const [msg, setMsg] = useState<string | null>(null);

  async function loadRoom() {
    try {
      const res = await fetch('/api/rooms', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (json.ok) {
        setTfsa(Number(json.room?.tfsa ?? 0));
        setRrsp(Number(json.room?.rrsp ?? 0));
      }
    } catch {}
  }

  async function loadChildren() {
    try {
      const res = await fetch('/api/children', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (json.ok) setChildren(json.children || []);
    } catch {}
  }

  useEffect(() => { if (token) { loadRoom(); loadChildren(); }}, [token]);

  async function addChild() {
    setMsg(null);
    try {
      const res = await fetch('/api/children', {
        method:'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: childName, birth_year: childYear }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed');
      setChildName(''); setChildYear(0);
      loadChildren();
      setMsg('Child added');
    } catch (e:any) {
      setMsg(e?.message ?? 'Error');
    }
  }

  // A tiny “suggested split” example (placeholder logic)
  const monthly = 1000;
  const suggested = useMemo(() => {
    const respNeed = Math.min(500, Math.round(children.length * 500 / 12)); // $500/yr per kid target → per month
    const toRESP = children.length ? Math.min(monthly, respNeed) : 0;
    const remaining = Math.max(0, monthly - toRESP);
    const toTFSA = Math.min(remaining, tfsa / 12);
    const toRRSP = Math.min(Math.max(0, remaining - toTFSA), rrsp / 12);
    const toMargin = Math.max(0, monthly - toRESP - toTFSA - toRRSP);
    return { toRESP, toTFSA, toRRSP, toMargin };
  }, [children.length, tfsa, rrsp]);

  return (
    <main className="max-w-3xl mx-auto p-4 space-y-6">
      <h1 className="text-xl font-semibold">Goals</h1>

      {!token && (
        <div className="rounded-lg border bg-yellow-50 text-yellow-900 p-3">
          Sign in to manage goals.
        </div>
      )}

      <section className="rounded-xl border bg-white p-4">
        <div className="text-sm text-gray-600 mb-2">Your current annual room (read-only)</div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border p-3">TFSA room: <span className="font-medium">${tfsa.toLocaleString()}</span></div>
          <div className="rounded-lg border p-3">RRSP room: <span className="font-medium">${rrsp.toLocaleString()}</span></div>
        </div>
        <div className="text-xs text-gray-500 mt-2">To edit these, go to <a className="underline" href="/room">Room</a>.</div>
      </section>

      <section className="rounded-xl border bg-white p-4">
        <div className="text-sm font-medium mb-2">Children (for RESP planning)</div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-3">
          <input className="border rounded-lg px-3 py-2" placeholder="Name"
                 value={childName} onChange={e=>setChildName(e.target.value)} />
          <input className="border rounded-lg px-3 py-2" placeholder="Birth Year" type="number"
                 value={childYear || ''} onChange={e=>setChildYear(Number(e.target.value||0))} />
          <button onClick={addChild} disabled={!token}
            className="sm:col-span-2 rounded-lg bg-blue-600 text-white px-3 py-2 disabled:opacity-50">
            Add Child
          </button>
        </div>
        {msg && <p className="text-sm mt-1">{msg}</p>}

        {children.length === 0 ? (
          <div className="text-sm text-gray-500">No children added.</div>
        ) : (
          <ul className="divide-y mt-3">
            {children.map(c=>(
              <li key={c.id} className="py-2 flex items-center justify-between">
                <div className="font-medium">{c.name}</div>
                <div className="text-sm text-gray-600">Born {c.birth_year}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border bg-white p-4">
        <div className="text-sm font-medium mb-2">Suggested monthly split (prototype)</div>
        <ul className="text-sm space-y-1">
          <li>RESP: <span className="font-medium">${suggested.toRESP.toFixed(0)}</span></li>
          <li>TFSA: <span className="font-medium">${suggested.toTFSA.toFixed(0)}</span></li>
          <li>RRSP: <span className="font-medium">${suggested.toRRSP.toFixed(0)}</span></li>
          <li>Margin/Other: <span className="font-medium">${suggested.toMargin.toFixed(0)}</span></li>
        </ul>
        <div className="text-xs text-gray-500 mt-2">This is a placeholder; we’ll upgrade with proper planning logic.</div>
      </section>
    </main>
  );
}
