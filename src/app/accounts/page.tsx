'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';

type Item = {
  id: string;
  name: string;
  type: 'TFSA'|'RRSP'|'RESP'|'Margin'|'Other'|'LIRA';
  balance: number | null;
};

export default function AccountsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  const headers: HeadersInit = token ? { authorization: `Bearer ${token}` } : {};
  const jsonHeaders: HeadersInit = token
    ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    : { 'content-type': 'application/json' };

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // add form
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<Item['type']>('TFSA');
  const [newBal, setNewBal] = useState(''); // string-backed
  const [adding, setAdding] = useState(false);

  const toNum = (s: string) => {
    const n = Number((s ?? '').replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : 0;
    };

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    (async () => {
      setLoading(true); setErr(null);
      try {
        const r = await fetch('/api/accounts', { headers });
        const j = await r.json();
        setItems(Array.isArray(j?.items) ? j.items : []);
      } catch (e:any) {
        setErr(e?.message || 'Load failed');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]); // eslint-disable-line

  const add = async () => {
    if (!newName.trim() || !newType || !newBal.trim()) return;
    setAdding(true);
    try {
      const r = await fetch('/api/accounts', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ name: newName.trim(), type: newType, balance: toNum(newBal) })
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? 'Add failed');
      setItems(prev => [...prev, j.item]);
      setNewName(''); setNewType('TFSA'); setNewBal('');
    } catch (e:any) {
      alert(e?.message || 'Add failed');
    } finally {
      setAdding(false);
    }
  };

  const save = async (id: string, balStr: string) => {
    try {
      const r = await fetch(`/api/accounts/${id}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ balance: toNum(balStr) })
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? 'Save failed');
      setItems(prev => prev.map(x => x.id === id ? j.item : x));
    } catch (e:any) {
      alert(e?.message || 'Save failed');
    }
  };

  const del = async (id: string) => {
    if (!confirm('Delete this account?')) return;
    try {
      const r = await fetch(`/api/accounts/${id}`, { method: 'DELETE', headers });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? 'Delete failed');
      setItems(prev => prev.filter(x => x.id !== id));
    } catch (e:any) {
      alert(e?.message || 'Delete failed');
    }
  };

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      {/* Add */}
      <section className="rounded-xl border bg-white p-3 shadow-sm">
        <div className="mb-2 text-sm font-medium">Add account</div>
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-end">
          <div className="sm:col-span-3">
            <label className="text-[11px] text-gray-600">Institution / Name</label>
            <input className="mt-1 w-full rounded-md border px-3 py-2" placeholder="e.g., RBC RESP"
              value={newName} onChange={e=>setNewName(e.target.value)} />
          </div>
          <div className="sm:col-span-1">
            <label className="text-[11px] text-gray-600">Type</label>
            <select className="mt-1 w-full rounded-md border px-3 py-2"
              value={newType} onChange={e=>setNewType(e.target.value as Item['type'])}>
              <option>TFSA</option><option>RRSP</option><option>RESP</option>
              <option>Margin</option><option>Other</option><option>LIRA</option>
            </select>
          </div>
          <div className="sm:col-span-1">
            <label className="text-[11px] text-gray-600">Total current value (equity)</label>
            <input className="mt-1 w-full rounded-md border px-3 py-2" type="text" inputMode="decimal" placeholder="e.g., 12000"
              value={newBal} onChange={e=>setNewBal(e.target.value)} />
          </div>
          <div className="sm:col-span-1">
            <button onClick={add}
              disabled={!newName.trim() || !newBal.trim() || adding}
              className={(!newName.trim() || !newBal.trim() || adding)
                ? 'w-full rounded bg-gray-300 px-4 py-2 text-gray-600 cursor-not-allowed'
                : 'w-full rounded bg-indigo-600 px-4 py-2 text-white'}>
              {adding ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
        <p className="mt-1 text-[11px] text-gray-500">
          Enter the <strong>total current value</strong> of each account. RESP configuration (family, kids, per-year tracking) is on the <strong>Room</strong> page.
        </p>
      </section>

      {/* List */}
      <section className="rounded-xl border bg-white p-3 shadow-sm">
        <div className="mb-2 text-sm font-medium">Your accounts</div>
        {loading ? (
          <div className="text-sm text-gray-600">Loading…</div>
        ) : err ? (
          <div className="text-sm text-red-600">{err}</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-gray-600">No accounts yet.</div>
        ) : (
          <div className="space-y-2">
            {items.map(a => {
              const [balStr, setBalStr] = useState(String(a.balance ?? ''));
              const dirty = balStr !== String(a.balance ?? '');
              return (
                <div key={a.id} className="grid grid-cols-1 sm:grid-cols-12 items-end gap-2 border rounded-lg p-3">
                  <div className="sm:col-span-4">
                    <div className="text-[11px] text-gray-600">Institution / Name</div>
                    <div className="mt-1 text-sm">{a.name}</div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="text-[11px] text-gray-600">Type</div>
                    <div className="mt-1 text-sm">{a.type}</div>
                  </div>
                  <div className="sm:col-span-3">
                    <label className="text-[11px] text-gray-600">Total current value (equity)</label>
                    <input className="mt-1 w-full rounded-md border px-3 py-2" type="text" inputMode="decimal"
                      value={balStr} onChange={e=>setBalStr(e.target.value)} />
                  </div>
                  <div className="sm:col-span-3 flex justify-end gap-2">
                    <button onClick={()=>save(a.id, balStr)}
                      disabled={!dirty}
                      className={dirty ? 'rounded bg-emerald-600 px-3 py-1.5 text-white'
                                        : 'rounded bg-gray-300 px-3 py-1.5 text-gray-600 cursor-not-allowed'}>
                      Save
                    </button>
                    <button onClick={()=>del(a.id)} className="rounded bg-red-500 px-3 py-1.5 text-white">Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
