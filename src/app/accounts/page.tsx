// src/app/accounts/page.tsx
'use client';
import { useEffect, useMemo, useState } from 'react';

type Account = { id: string; name: string; type: string; balance: number; created_at: string };

export default function AccountsPage() {
  const [list, setList] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(''); // allow blank
  const [type, setType] = useState('TFSA');
  const [balanceStr, setBalanceStr] = useState(''); // allow blank
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const res = await fetch('/api/accounts', { cache: 'no-store' });
    const json = await res.json();
    setLoading(false);
    if (json?.ok) setList(json.accounts);
    else setMsg(json?.error ?? 'Error');
  }

  useEffect(() => { refresh(); }, []);

  const total = useMemo(() => list.reduce((a, b) => a + (b.balance || 0), 0), [list]);

  async function addAccount() {
    setMsg(null);
    const balance = balanceStr.trim() === '' ? 0 : Number(balanceStr);
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), type, balance }),
    });
    const json = await res.json();
    if (json?.ok) {
      setName('');
      setType('TFSA');
      setBalanceStr('');
      refresh();
    } else {
      setMsg(json?.error ?? 'Error');
    }
  }

  async function updateAccount(id: string, patch: Partial<Pick<Account, 'name' | 'type' | 'balance'>>) {
    const res = await fetch('/api/accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    const json = await res.json();
    if (json?.ok) refresh();
    else setMsg(json?.error ?? 'Error');
  }

  async function deleteAccount(id: string) {
    const res = await fetch(`/api/accounts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const json = await res.json();
    if (json?.ok) refresh();
    else setMsg(json?.error ?? 'Error');
  }

  return (
    <main className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="rounded-xl border bg-white p-4">
        <div className="text-sm font-medium mb-3">Add account</div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Name (e.g., TFSA @ Questrade)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            className="border rounded-lg px-3 py-2"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option>TFSA</option>
            <option>RRSP</option>
            <option>RESP</option>
            <option>Non-Registered</option>
            <option>LIRA</option>
            <option>Other</option>
          </select>
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Balance"
            value={balanceStr}
            onChange={(e) => {
              const v = e.target.value;
              if (/^\d*(\.\d{0,2})?$/.test(v)) setBalanceStr(v);
            }}
            inputMode="decimal"
          />
          <button onClick={addAccount} className="rounded-lg bg-blue-600 text-white px-3 py-2">
            Save
          </button>
        </div>
        {msg && <p className="text-sm text-red-600 mt-2">{msg}</p>}
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium">Your accounts</div>
          <div className="text-sm text-gray-600">Total: ${total.toLocaleString()}</div>
        </div>

        {loading ? (
          <div className="p-3 text-sm">Loading…</div>
        ) : list.length === 0 ? (
          <div className="p-3 text-sm text-gray-500">No accounts yet.</div>
        ) : (
          <ul className="divide-y">
            {list.map((a) => (
              <li key={a.id} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-3">
                  <input
                    className="border rounded px-2 py-1 w-52"
                    value={a.name}
                    onChange={(e) => updateAccount(a.id, { name: e.target.value })}
                  />
                  <select
                    className="border rounded px-2 py-1"
                    value={a.type}
                    onChange={(e) => updateAccount(a.id, { type: e.target.value })}
                  >
                    <option>TFSA</option>
                    <option>RRSP</option>
                    <option>RESP</option>
                    <option>Non-Registered</option>
                    <option>LIRA</option>
                    <option>Other</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    className="border rounded px-2 py-1 w-28 text-right"
                    value={String(a.balance)}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^\d*(\.\d{0,2})?$/.test(v)) {
                        const num = v === '' ? 0 : Number(v);
                        updateAccount(a.id, { balance: num });
                      }
                    }}
                    inputMode="decimal"
                  />
                  <button
                    className="text-sm text-red-600 hover:underline"
                    onClick={() => deleteAccount(a.id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
