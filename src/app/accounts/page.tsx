'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';

type Account = {
  id: string;
  institution: string;
  type: 'TFSA' | 'RRSP' | 'RESP' | 'Margin' | 'Other' | 'LIRA';
  balance: number;
  source?: 'manual' | 'broker';
  created_at?: string;
};

const TYPES: Account['type'][] = ['TFSA','RRSP','RESP','Margin','Other','LIRA'];

export default function AccountsPage() {
  const { session, loading } = useAuth();
  const token = session?.access_token ?? '';

  const [rows, setRows] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Add form
  const [institution, setInstitution] = useState('');
  const [aType, setAType] = useState<Account['type']>('TFSA');
  const [balanceStr, setBalanceStr] = useState('');

  type RowEdit = {
    institution: string;
    type: Account['type'];
    balanceStr: string;
    dirty: boolean;
    saving: boolean;
    deleting: boolean;
  };
  const [edit, setEdit] = useState<Record<string, RowEdit>>({});

  useEffect(() => {
    if (!token) return;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch('/api/accounts', { headers: { authorization: `Bearer ${token}` } });
        const j = await res.json();
        if (!res.ok || !j?.ok) throw new Error(j?.error || 'Failed to load accounts');
        const list: Account[] = j.accounts ?? [];
        setRows(list);
        const map: Record<string, RowEdit> = {};
        for (const a of list) {
          map[a.id] = {
            institution: a.institution ?? '',
            type: a.type ?? 'Other',
            balanceStr: String(Number(a.balance || 0)),
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

  const normalizeNumStr = (s: string) => {
    const n = Number((s || '').replace(/,/g, ''));
    return Number.isFinite(n) ? String(n) : 'NaN';
  };

  const handleRowChange = (id: string, key: 'institution'|'type'|'balanceStr', val: string) => {
    setEdit(prev => {
      const cur = prev[id]; if (!cur) return prev;
      const next = { ...cur, [key]: val };

      const orig = rows.find(r => r.id === id);
      const oInst = orig?.institution ?? '';
      const oType = orig?.type ?? 'Other';
      const oBalStr = String(Number(orig?.balance || 0));

      next.dirty =
        next.institution.trim() !== oInst.trim() ||
        next.type !== oType ||
        normalizeNumStr(next.balanceStr) !== normalizeNumStr(oBalStr);

      return { ...prev, [id]: next };
    });
  };

  const saveRow = async (id: string) => {
    const e = edit[id]; if (!e || e.saving || !e.dirty) return;
    const n = Number(e.balanceStr.replace(/,/g, ''));
    if (!Number.isFinite(n)) { setError('Please enter a valid number.'); return; }

    setEdit(prev => ({ ...prev, [id]: { ...prev[id], saving: true }}));
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ institution: e.institution.trim(), type: e.type, balance: n }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Save failed');

      const updated: Account = j.account;
      setRows(prev => prev.map(r => r.id === id ? updated : r));
      setEdit(prev => ({ ...prev, [id]: {
        ...prev[id],
        institution: updated.institution ?? e.institution,
        type: updated.type ?? e.type,
        balanceStr: String(Number(updated.balance ?? n)),
        dirty: false,
        saving: false,
      }}));
    } catch (err:any) {
      setEdit(prev => ({ ...prev, [id]: { ...prev[id], saving: false }}));
      setError(err?.message || 'Save failed');
    }
  };

  const deleteRow = async (id: string) => {
    const e = edit[id]; if (!e || e.deleting) return;
    setEdit(prev => ({ ...prev, [id]: { ...prev[id], deleting: true }}));
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
      const j = await res.json();
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Delete failed');

      setRows(prev => prev.filter(r => r.id !== id));
      setEdit(prev => { const { [id]: _, ...rest } = prev; return rest; });
    } catch (err:any) {
      setEdit(prev => ({ ...prev, [id]: { ...prev[id], deleting: false }}));
      setError(err?.message || 'Delete failed');
    }
  };

  const parsedBalance = useMemo(() => {
    if (balanceStr.trim() === '') return NaN;
    const n = Number(balanceStr.replace(/,/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }, [balanceStr]);

  const canAdd = institution.trim().length > 0 && Number.isFinite(parsedBalance);

  const addRow = async () => {
    if (!canAdd) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ institution: institution.trim(), type: aType, balance: parsedBalance }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Create failed');

      const a: Account = j.account;
      setRows(prev => [a, ...prev]);
      setEdit(prev => ({
        [a.id]: {
          institution: a.institution ?? '',
          type: a.type ?? 'Other',
          balanceStr: String(Number(a.balance || 0)),
          dirty: false, saving: false, deleting: false
        },
        ...prev
      }));

      setInstitution('');
      setAType('TFSA');
      setBalanceStr('');
    } catch (err:any) {
      setError(err?.message || 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <main className="max-w-6xl mx-auto p-4"><div className="rounded-xl border bg-white p-6">Loading…</div></main>;
  }
  if (!session) {
    return <main className="max-w-6xl mx-auto p-4"><div className="rounded-xl border bg-white p-6">Please sign in.</div></main>;
  }

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">Add account</div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Institution (e.g., BMO)"
            value={institution}
            onChange={(e)=>setInstitution(e.target.value)}
          />
          <select
            className="border rounded-lg px-3 py-2"
            value={aType}
            onChange={(e)=>setAType(e.target.value as Account['type'])}
          >
            {TYPES.map(t=> <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Balance"
            inputMode="decimal"
            value={balanceStr}
            onChange={(e)=>setBalanceStr(e.target.value)}
          />
          <button
            onClick={addRow}
            disabled={!canAdd || busy}
            className="rounded-lg px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">Tip: balances can be updated anytime; Save becomes clickable only when a change is made.</p>
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
            {rows.map(a => {
              const e = edit[a.id];
              const saveDisabled = !e?.dirty || e?.saving;
              return (
                <li key={a.id} className="p-3">
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-center">
                    <div className="sm:col-span-2">
                      <label className="text-xs text-gray-500">Institution</label>
                      <input
                        className="mt-1 w-full border rounded-lg px-3 py-2"
                        value={e?.institution ?? ''}
                        onChange={(v)=>handleRowChange(a.id,'institution',v.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Type</label>
                      <select
                        className="mt-1 w-full border rounded-lg px-3 py-2"
                        value={e?.type ?? 'Other'}
                        onChange={(v)=>handleRowChange(a.id,'type',v.target.value)}
                      >
                        {TYPES.map(t=> <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Balance</label>
                      <input
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-right"
                        inputMode="decimal"
                        value={e?.balanceStr ?? ''}
                        onChange={(v)=>handleRowChange(a.id,'balanceStr',v.target.value)}
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <button
                        onClick={()=>saveRow(a.id)}
                        disabled={saveDisabled}
                        className={`rounded-lg px-3 py-2 text-white ${saveDisabled ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
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
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
