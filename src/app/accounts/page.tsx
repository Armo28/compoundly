'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';

type Item = {
  id: string;
  name: string;            // institution
  type: string;            // TFSA | RRSP | RESP | Margin...
  balance: number;
  is_family_resp?: boolean;
  children_covered?: number;
};

const TYPES = ['TFSA', 'RRSP', 'RESP', 'Margin'];

export default function AccountsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  const headers: HeadersInit = token ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' } : {};

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // add form
  const [addName, setAddName] = useState('');
  const [addType, setAddType] = useState('TFSA');
  const [addBal, setAddBal] = useState<number>(0);

  const load = async () => {
    setErr(null);
    setLoading(true);
    try {
      const r = await fetch('/api/accounts', { headers });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? 'Failed to load accounts');
      setItems(j.items ?? []);
    } catch (e: any) {
      setErr(e?.message ?? 'Error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (token) load(); }, [token]); // eslint-disable-line

  const add = async () => {
    try {
      const r = await fetch('/api/accounts', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: addName.trim(), type: addType, balance: Number(addBal) }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? 'Add failed');
      setAddName(''); setAddBal(0); setAddType('TFSA');
      await load();
    } catch (e: any) { setErr(e?.message ?? 'Add failed'); }
  };

  const save = async (row: Item) => {
    try {
      const r = await fetch(`/api/accounts/${row.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          name: row.name,
          type: row.type,
          balance: row.balance,
          is_family_resp: !!row.is_family_resp,
          children_covered: Math.max(1, Number(row.children_covered || 1)),
        }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? 'Save failed');
      await load();
    } catch (e: any) { setErr(e?.message ?? 'Save failed'); }
  };

  const del = async (id: string) => {
    try {
      const r = await fetch(`/api/accounts/${id}`, { method: 'DELETE', headers });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? 'Delete failed');
      await load();
    } catch (e: any) { setErr(e?.message ?? 'Delete failed'); }
  };

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      {/* Add account */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">Add account</div>
        <div className="grid grid-cols-12 gap-3">
          <input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Institution (e.g., BMO)"
            className="col-span-12 sm:col-span-5 rounded-lg border px-3 py-2"
          />
          <select
            value={addType}
            onChange={(e) => setAddType(e.target.value)}
            className="col-span-6 sm:col-span-3 rounded-lg border px-3 py-2"
          >
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <input
            type="number"
            value={addBal}
            onChange={(e) => setAddBal(Number(e.target.value))}
            placeholder="Balance"
            className="col-span-6 sm:col-span-2 rounded-lg border px-3 py-2"
          />
          <div className="col-span-12 sm:col-span-2 flex items-center">
            <button onClick={add} className="w-full rounded bg-indigo-600 px-4 py-2 text-white">
              Add
            </button>
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-2">
          Tip: balances can be updated anytime; Save becomes clickable only when a change is made.
        </div>
      </section>

      {/* Your accounts */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">Your accounts</div>
        {err && <div className="text-red-600 text-sm mb-2">{err}</div>}
        {loading ? (
          <div className="text-gray-600 text-sm">Loading…</div>
        ) : (
          <div className="space-y-3">
            {items.map((row, idx) => {
              const isRESP = String(row.type).toUpperCase() === 'RESP';
              return (
                <div key={row.id} className="grid grid-cols-12 gap-3 items-center">
                  {/* Institution */}
                  <input
                    value={row.name}
                    onChange={(e) => {
                      const v = e.target.value;
                      setItems((cur) => cur.map((it, i) => (i === idx ? { ...it, name: v } : it)));
                    }}
                    className="col-span-12 sm:col-span-4 rounded-lg border px-3 py-2"
                  />

                  {/* Type */}
                  <select
                    value={row.type}
                    onChange={(e) => {
                      const v = e.target.value;
                      setItems((cur) => cur.map((it, i) => (i === idx ? { ...it, type: v } : it)));
                    }}
                    className="col-span-6 sm:col-span-2 rounded-lg border px-3 py-2"
                  >
                    {TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>

                  {/* Balance */}
                  <input
                    type="number"
                    value={row.balance ?? 0}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setItems((cur) => cur.map((it, i) => (i === idx ? { ...it, balance: v } : it)));
                    }}
                    className="col-span-6 sm:col-span-2 rounded-lg border px-3 py-2"
                  />

                  {/* Family RESP + kids (only when RESP) */}
                  <div className="col-span-12 sm:col-span-2 flex items-center gap-3">
                    {isRESP && (
                      <>
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={!!row.is_family_resp}
                            onChange={(e) => {
                              const v = e.target.checked;
                              setItems((cur) => cur.map((it, i) =>
                                i === idx ? { ...it, is_family_resp: v } : it
                              ));
                            }}
                          />
                          Family RESP
                        </label>
                        <div className="flex items-center gap-1">
                          <span className="text-sm text-gray-600">Kids</span>
                          <input
                            type="number"
                            min={1}
                            value={Math.max(1, Number(row.children_covered || 1))}
                            onChange={(e) => {
                              const v = Math.max(1, Number(e.target.value || 1));
                              setItems((cur) => cur.map((it, i) =>
                                i === idx ? { ...it, children_covered: v } : it
                              ));
                            }}
                            className="w-20 rounded-lg border px-2 py-2"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Actions (fixed width; prevents overlap) */}
                  <div className="col-span-12 sm:col-span-2 flex justify-end gap-2">
                    <button
                      onClick={() => save({
                        ...row,
                        children_covered: isRESP ? Math.max(1, Number(row.children_covered || 1)) : undefined,
                        is_family_resp: isRESP ? !!row.is_family_resp : undefined,
                      })}
                      className="rounded bg-gray-700 px-3 py-2 text-white"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => del(row.id)}
                      className="rounded bg-red-500 px-3 py-2 text-white"
                    >
                      Delete
                    </button>
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
