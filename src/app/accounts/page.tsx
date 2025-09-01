'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';

type Account = {
  id: string;
  name: string;         // institution or label
  type: 'TFSA' | 'RRSP' | 'RESP' | 'Margin' | 'Other' | 'LIRA';
  balance: number;
  source?: 'manual' | 'broker'; // if present, we dim editing for broker-fed rows
  created_at?: string;
};

const TYPES: Account['type'][] = ['TFSA','RRSP','RESP','Margin','Other','LIRA'];

const CAD = (n:number)=>n.toLocaleString(undefined,{style:'currency',currency:'CAD',maximumFractionDigits:0});

export default function AccountsPage() {
  const { session, loading } = useAuth();
  const token = session?.access_token ?? '';

  const [rows, setRows] = useState<Account[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add form (allow empty string for balance field so user can clear)
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<Account['type']>('TFSA');
  const [newBalanceStr, setNewBalanceStr] = useState(''); // keep as string for better UX
  const parsedNewBalance = useMemo(()=> {
    if (newBalanceStr.trim()==='') return NaN;
    const v = Number(newBalanceStr.replace(/,/g,''));
    return Number.isFinite(v) ? v : NaN;
  },[newBalanceStr]);

  // Local editable state per row
  type RowEdit = {
    name: string;
    type: Account['type'];
    balanceStr: string;      // keep as string while typing
    dirty: boolean;          // has user changed anything?
    saving: boolean;         // currently saving this row
    deleting: boolean;       // currently deleting this row
  };
  const [edit, setEdit] = useState<Record<string, RowEdit>>({});

  // load list
  useEffect(() => {
    if (!token) return;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch('/api/accounts', {
          headers: { authorization: `Bearer ${token}` }
        });
        const j = await res.json();
        if (!res.ok || !j?.ok) throw new Error(j?.error || 'Failed to load accounts');
        const list: Account[] = j.accounts ?? [];
        setRows(list);
        // seed edit map
        const map: Record<string, RowEdit> = {};
        for (const a of list) {
          map[a.id] = {
            name: a.name ?? '',
            type: (a.type as Account['type']) ?? 'Other',
            balanceStr: (Number(a.balance || 0)).toString(),
            dirty: false,
            saving: false,
            deleting: false,
          };
        }
        setEdit(map);
      } catch (e:any) {
        setError(e?.message || 'Load error');
      } finally {
        setBusy(false);
      }
    })();
  }, [token]);

  // helpers
  const setRow = (id: string, updater: (prev: RowEdit)=>RowEdit) => {
    setEdit(prev => {
      const cur = prev[id];
      if (!cur) return prev;
      const next = updater(cur);
      return { ...prev, [id]: next };
    });
  };

  const handleFieldChange = (id: string, key: 'name'|'type'|'balanceStr', val: string) => {
    setEdit(prev => {
      const cur = prev[id];
      if (!cur) return prev;
      const next: RowEdit = { ...cur, [key]: val };
      // compute dirty vs original from rows[]
      const orig = rows.find(r => r.id === id);
      const origName = orig?.name ?? '';
      const origType = (orig?.type as Account['type']) ?? 'Other';
      const origBalStr = (Number(orig?.balance || 0)).toString();

      next.dirty =
        next.name.trim() !== origName.trim() ||
        next.type !== origType ||
        normalizeNumStr(next.balanceStr) !== normalizeNumStr(origBalStr);

      return { ...prev, [id]: next };
    });
  };

  function normalizeNumStr(s: string) {
    const v = Number((s || '').replace(/,/g,''));
    if (!Number.isFinite(v)) return 'NaN';
    return String(v);
  }

  // Save a row (PATCH)
  const saveRow = async (id: string) => {
    const e = edit[id];
    if (!e || e.saving || !e.dirty) return;
    // parse number
    const n = Number(e.balanceStr.replace(/,/g,''));
    if (!Number.isFinite(n)) {
      setError('Please enter a valid number for balance.');
      return;
    }

    setRow(id, prev => ({ ...prev, saving: true }));
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: e.name.trim(),
          type: e.type,
          balance: n,
        })
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Save failed');

      // Update rows[] with server's version
      setRows(prev => prev.map(r => r.id === id ? { ...r, ...j.account } : r));
      // Reset dirty/disabled save button
      setRow(id, prev => ({ ...prev, dirty: false, saving: false, balanceStr: String(j.account.balance ?? n) }));
    } catch (err:any) {
      setRow(id, prev => ({ ...prev, saving: false }));
      setError(err?.message || 'Save failed');
    }
  };

  // Delete a row
  const deleteRow = async (id: string) => {
    const e = edit[id];
    if (!e || e.deleting) return;
    setRow(id, prev => ({ ...prev, deleting: true }));
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` }
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Delete failed');

      setRows(prev => prev.filter(r => r.id !== id));
      setEdit(prev => {
        const { [id]: _drop, ...rest } = prev;
        return rest;
      });
    } catch (err:any) {
      setRow(id, prev => ({ ...prev, deleting: false }));
      setError(err?.message || 'Delete failed');
    }
  };

  // Add new row (POST)
  const canAdd = useMemo(()=>{
    return !!token &&
      newName.trim().length > 0 &&
      TYPES.includes(newType) &&
      Number.isFinite(parsedNewBalance);
  },[token, newName, newType, parsedNewBalance]);

  const addRow = async () => {
    if (!canAdd) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newName.trim(),
          type: newType,
          balance: parsedNewBalance,
        })
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Create failed');

      const a: Account = j.account;
      setRows(prev => [a, ...prev]);
      setEdit(prev => ({
        [a.id]: {
          name: a.name ?? '',
          type: (a.type as Account['type']) ?? 'Other',
          balanceStr: (Number(a.balance || 0)).toString(),
          dirty: false,
          saving: false,
          deleting: false,
        },
        ...prev
      }));
      // reset form
      setNewName('');
      setNewType('TFSA');
      setNewBalanceStr('');
    } catch (err:any) {
      setError(err?.message || 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <main className="max-w-6xl mx-auto p-4">
        <div className="rounded-xl border bg-white p-6">Loading…</div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="max-w-6xl mx-auto p-4">
        <div className="rounded-xl border bg-white p-6">Please sign in to manage accounts.</div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">Add account</div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Institution (e.g., BMO)"
            value={newName}
            onChange={(e)=>setNewName(e.target.value)}
          />
          <select
            className="border rounded-lg px-3 py-2"
            value={newType}
            onChange={(e)=>setNewType(e.target.value as Account['type'])}
          >
            {TYPES.map(t=> <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Balance"
            value={newBalanceStr}
            onChange={(e)=>setNewBalanceStr(e.target.value)}
            inputMode="decimal"
          />
          <button
            onClick={addRow}
            disabled={!canAdd || busy}
            className={`rounded-lg px-4 py-2 text-white ${(!canAdd || busy) ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            Add
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Tip: balances can be updated anytime; Save is enabled only when a change is made.
        </p>
      </div>

      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b text-sm font-medium">Your accounts</div>
        {error && <div className="px-4 py-2 text-sm text-red-600">{error}</div>}
        {busy && rows.length === 0 ? (
          <div className="p-4 text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">No accounts yet.</div>
        ) : (
          <ul className="divide-y">
            {rows.map((a) => {
              const e = edit[a.id];
              const brokerFed = (a.source === 'broker'); // visually hint if broker-fed
              const canEdit = !brokerFed; // you can change this rule later
              const saveDisabled = !e?.dirty || e?.saving;

              return (
                <li key={a.id} className="p-3">
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-center">
                    {/* Institution / name */}
                    <div className="sm:col-span-2">
                      <label className="text-xs text-gray-500">Institution</label>
                      <input
                        className={`mt-1 w-full border rounded-lg px-3 py-2 ${!canEdit ? 'bg-gray-50 text-gray-500' : ''}`}
                        value={e?.name ?? ''}
                        onChange={(ev)=>canEdit && handleFieldChange(a.id, 'name', ev.target.value)}
                        disabled={!canEdit}
                      />
                    </div>

                    {/* Type */}
                    <div>
                      <label className="text-xs text-gray-500">Type</label>
                      <select
                        className={`mt-1 w-full border rounded-lg px-3 py-2 ${!canEdit ? 'bg-gray-50 text-gray-500' : ''}`}
                        value={e?.type ?? 'Other'}
                        onChange={(ev)=>canEdit && handleFieldChange(a.id, 'type', ev.target.value)}
                        disabled={!canEdit}
                      >
                        {TYPES.map(t=> <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>

                    {/* Balance */}
                    <div>
                      <label className="text-xs text-gray-500">Balance</label>
                      <input
                        className={`mt-1 w-full border rounded-lg px-3 py-2 text-right ${!canEdit ? 'bg-gray-50 text-gray-500' : ''}`}
                        value={e?.balanceStr ?? ''}
                        onChange={(ev)=>canEdit && handleFieldChange(a.id, 'balanceStr', ev.target.value)}
                        inputMode="decimal"
                        disabled={!canEdit}
                      />
                      <div className="text-xs text-gray-500 mt-1">= {CAD(Number((e?.balanceStr || '0').replace(/,/g,'')) || 0)}</div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={()=>saveRow(a.id)}
                        disabled={saveDisabled || !canEdit}
                        className={`rounded-lg px-3 py-2 text-white ${(!canEdit || saveDisabled) ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                        title={!canEdit ? 'Broker-synced accounts cannot be edited manually' : (saveDisabled ? 'No unsaved changes' : 'Save changes')}
                      >
                        {e?.saving ? 'Saving…' : 'Save'}
                      </button>

                      <button
                        onClick={()=>deleteRow(a.id)}
                        disabled={e?.deleting}
                        className={`rounded-lg px-3 py-2 ${e?.deleting ? 'bg-gray-200 text-gray-400 cursor-wait' : 'bg-white border hover:bg-gray-50'}`}
                      >
                        {e?.deleting ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>

                  {/* Broker-fed badge */}
                  {brokerFed && (
                    <div className="mt-1 text-xs text-amber-600">
                      This account is kept in sync with your brokerage; manual editing is disabled.
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
