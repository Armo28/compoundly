'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';

type Account = {
  id: string;
  name: string;
  type: string;
  balance: number;
  is_family_resp?: boolean;
  children_covered?: number;
};

const TYPES = ['TFSA', 'RRSP', 'RESP', 'LIRA', 'Margin', 'Other'] as const;

export default function AccountsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  // EXPLICIT: only defined if we have a token
  const authHeaders = useMemo<HeadersInit | undefined>(
    () =>
      token
        ? {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          }
        : undefined,
    [token]
  );

  const [items, setItems] = useState<Account[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Account>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // add form
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<(typeof TYPES)[number]>('TFSA');
  const [newBalance, setNewBalance] = useState<number | ''>('');
  const [newIsFamilyResp, setNewIsFamilyResp] = useState(false);
  const [newChildrenCovered, setNewChildrenCovered] = useState<number>(1);

  const fetchAccounts = async () => {
    if (!authHeaders) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/accounts', { headers: authHeaders });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? 'Failed to load accounts');
      setItems(j.items ?? []);
      const map: Record<string, Account> = {};
      for (const it of j.items ?? []) map[it.id] = { ...it };
      setDrafts(map);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, [authHeaders]);

  const addAccount = async () => {
    if (!authHeaders) return;
    try {
      const payload: any = {
        name: newName.trim(),
        type: newType,
        balance: Number(newBalance || 0),
      };
      if (newType.toUpperCase() === 'RESP') {
        payload.is_family_resp = newIsFamilyResp;
        payload.children_covered = Math.max(1, Number(newChildrenCovered || 1));
      }
      const r = await fetch('/api/accounts', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? 'Add failed');
      await fetchAccounts();
      setNewName('');
      setNewType('TFSA');
      setNewBalance('');
      setNewIsFamilyResp(false);
      setNewChildrenCovered(1);
    } catch (e: any) {
      setError(e?.message ?? 'Add failed');
    }
  };

  const saveLine = async (a: Account) => {
    if (!authHeaders) return;
    try {
      const r = await fetch(`/api/accounts/${a.id}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({
          name: a.name,
          type: a.type,
          balance: a.balance,
          is_family_resp: !!a.is_family_resp,
          children_covered: Math.max(1, Number(a.children_covered || 1)),
        }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? 'Save failed');
      await fetchAccounts();
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
    }
  };

  const deleteLine = async (id: string) => {
    if (!authHeaders) return;
    try {
      const r = await fetch(`/api/accounts/${id}`, { method: 'DELETE', headers: authHeaders });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? 'Delete failed');
      await fetchAccounts();
    } catch (e: any) {
      setError(e?.message ?? 'Delete failed');
    }
  };

  const changed = (id: string) => {
    const d = drafts[id];
    const o = items.find((x) => x.id === id);
    return JSON.stringify(d) !== JSON.stringify(o);
  };

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-6">
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-2">Add account</div>
        <div className="grid grid-cols-12 gap-3 items-center">
          <input
            className="col-span-4 rounded border px-3 py-2"
            placeholder="Institution (e.g., BMO)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <select
            className="col-span-2 rounded border px-3 py-2"
            value={newType}
            onChange={(e) => setNewType(e.target.value as any)}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            className="col-span-2 rounded border px-3 py-2"
            placeholder="Balance"
            type="number"
            min={0}
            value={newBalance}
            onChange={(e) => setNewBalance(e.target.value === '' ? '' : Number(e.target.value))}
          />
          {newType.toUpperCase() === 'RESP' && (
            <>
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newIsFamilyResp}
                  onChange={(e) => setNewIsFamilyResp(e.target.checked)}
                />
                Family RESP
              </label>
              <div className="col-span-2 flex items-center gap-2">
                <span className="text-sm">Children covered</span>
                <input
                  type="number"
                  min={1}
                  className="w-20 rounded border px-2 py-2"
                  value={newChildrenCovered}
                  onChange={(e) => setNewChildrenCovered(Math.max(1, Number(e.target.value || 1)))}
                />
              </div>
            </>
          )}
          <div className="col-span-2 flex justify-end">
            <button onClick={addAccount} className="rounded bg-indigo-600 px-4 py-2 text-white">
              Add
            </button>
          </div>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Tip: balances can be updated anytime; Save becomes clickable only when a change is made.
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-2">Your accounts</div>
        {error && <div className="text-red-600 text-sm mb-3">{error}</div>}
        {loading ? (
          <div className="text-sm text-gray-600">Loading…</div>
        ) : (
          <div className="space-y-3">
            {items.map((a) => {
              const d = drafts[a.id];
              return (
                <div key={a.id} className="grid grid-cols-12 items-center gap-3 rounded border p-3">
                  <input
                    className="col-span-4 rounded border px-3 py-2"
                    value={d?.name ?? ''}
                    onChange={(e) =>
                      setDrafts((m) => ({ ...m, [a.id]: { ...m[a.id], name: e.target.value } }))
                    }
                  />
                  <select
                    className="col-span-2 rounded border px-3 py-2"
                    value={d?.type ?? 'TFSA'}
                    onChange={(e) =>
                      setDrafts((m) => ({
                        ...m,
                        [a.id]: { ...m[a.id], type: e.target.value.toUpperCase() },
                      }))
                    }
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <input
                    className="col-span-2 rounded border px-3 py-2"
                    type="number"
                    min={0}
                    value={d?.balance ?? 0}
                    onChange={(e) =>
                      setDrafts((m) => ({
                        ...m,
                        [a.id]: { ...m[a.id], balance: Number(e.target.value || 0) },
                      }))
                    }
                  />
                  {String(d?.type).toUpperCase() === 'RESP' ? (
                    <>
                      <label className="col-span-2 flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={!!d?.is_family_resp}
                          onChange={(e) =>
                            setDrafts((m) => ({
                              ...m,
                              [a.id]: { ...m[a.id], is_family_resp: e.target.checked },
                            }))
                          }
                        />
                        Family RESP
                      </label>
                      <div className="col-span-1 flex items-center gap-2">
                        <span className="text-sm">Kids</span>
                        <input
                          type="number"
                          min={1}
                          className="w-16 rounded border px-2 py-2"
                          value={Number(d?.children_covered || 1)}
                          onChange={(e) =>
                            setDrafts((m) => ({
                              ...m,
                              [a.id]: {
                                ...m[a.id],
                                children_covered: Math.max(1, Number(e.target.value || 1)),
                              },
                            }))
                          }
                        />
                      </div>
                    </>
                  ) : (
                    <div className="col-span-3" />
                  )}
                  <div className="col-span-1 flex justify-end gap-2">
                    <button
                      onClick={() => d && saveLine(d)}
                      disabled={!changed(a.id)}
                      className={
                        changed(a.id)
                          ? 'rounded bg-indigo-600 px-3 py-1.5 text-white'
                          : 'rounded bg-gray-300 px-3 py-1.5 text-gray-600 cursor-not-allowed'
                      }
                    >
                      Save
                    </button>
                    <button
                      onClick={() => deleteLine(a.id)}
                      className="rounded bg-red-500 px-3 py-1.5 text-white"
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
