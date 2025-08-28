'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';

type Account = { id: string; name: string; type: string; balance: number };
const types = ['TFSA','RRSP','RESP','Margin','Other'] as const;

export default function AccountsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? null;

  const [list, setList] = useState<Account[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState<(typeof types)[number]>('TFSA');
  const [balance, setBalance] = useState<number>(0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/accounts', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed');
      setList(json.accounts || []);
    } catch (e:any) {
      setErr(e?.message ?? 'Error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (token) load(); }, [token]);

  async function add() {
    setErr(null);
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: {
          'Content-Type':'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name, type, balance }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed');
      setName(''); setType('TFSA'); setBalance(0);
      load();
    } catch (e:any) {
      setErr(e?.message ?? 'Error');
    }
  }

  return (
    <main className="max-w-3xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-4">Accounts</h1>

      {!token && (
        <div className="rounded-lg border bg-yellow-50 text-yellow-900 p-3 mb-4">
          Sign in to manage accounts.
        </div>
      )}

      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input className="border rounded-lg px-3 py-2" placeholder="Name"
                 value={name} onChange={e=>setName(e.target.value)} />
          <select className="border rounded-lg px-3 py-2" value={type} onChange={e=>setType(e.target.value as any)}>
            {types.map(t=> <option key={t} value={t}>{t}</option>)}
          </select>
          <input className="border rounded-lg px-3 py-2" type="number" placeholder="Balance"
                 value={balance} onChange={e=>setBalance(Number(e.target.value||0))} />
          <button onClick={add} disabled={!token}
            className="rounded-lg bg-blue-600 text-white px-3 py-2 disabled:opacity-50">
            Add
          </button>
        </div>
        {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
      </div>

      <div className="rounded-xl border bg-white">
        <div className="p-3 border-b text-sm text-gray-600">Your Accounts</div>
        {loading ? (
          <div className="p-4 text-sm">Loading…</div>
        ) : list.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">No accounts yet.</div>
        ) : (
          <ul className="divide-y">
            {list.map(a=>(
              <li key={a.id} className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{a.name} <span className="text-gray-500">({a.type})</span></div>
                </div>
                <div className="tabular-nums">${a.balance.toLocaleString()}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
