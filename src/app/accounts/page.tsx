'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';

type Item = {
  id: string;
  name: string;                     // institution / label
  type: 'TFSA'|'RRSP'|'RESP'|'Margin'|'Other'|'LIRA';
  balance: number | null;
  created_at?: string;
};

type RowState = {
  balanceStr: string;               // string-backed to avoid forced zeros
  dirty: boolean;
  saving: boolean;
  _saved_balanceStr: string;        // snapshot for grey/enable logic
};

const TYPES: Item['type'][] = ['TFSA','RRSP','RESP','Margin','Other','LIRA'];

export default function AccountsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  // headers that NEVER contain undefined keys (prevents TS build errors)
  const authHeaders: HeadersInit = useMemo(() => {
    const h: Record<string,string> = {};
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  const jsonHeaders: HeadersInit = useMemo(() => {
    const h: Record<string,string> = { 'content-type':'application/json' };
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string|null>(null);
  const [row, setRow] = useState<Record<string, RowState>>({});

  const toNum = (s: string) => {
    const n = Number((s ?? '').replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  };
  const asStr = (n: number | null | undefined) => (n == null ? '' : String(n));

  // load
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!token) { setLoading(false); return; }
      setLoading(true); setErr(null);
      try {
        const r = await fetch('/api/accounts', { headers: authHeaders });
        const j = await r.json();
        if (!j?.ok) throw new Error(j?.error ?? 'Failed to load accounts');
        const list: Item[] = Array.isArray(j.items) ? j.items : [];
        if (!mounted) return;

        setItems(list);
        setRow(prev => {
          const next = { ...prev };
          for (const a of list) {
            const savedBal = asStr(a.balance);
            const curr = prev[a.id];
            if (!curr || (!curr.dirty && !curr.saving)) {
              next[a.id] = {
                balanceStr: savedBal,
                _saved_balanceStr: savedBal,
                dirty: false,
                saving: false,
              };
            }
          }
          // prune removed
          Object.keys(next).forEach(id => {
            if (!list.find(x => x.id === id)) delete (next as any)[id];
          });
          return next;
        });
      } catch (e:any) {
        if (mounted) setErr(e?.message || 'Error loading');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [token, authHeaders]);

  // add
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<Item['type']>('TFSA');
  const [newBal, setNewBal]   = useState('');
  const [adding, setAdding]   = useState(false);

  const canAdd = newName.trim() !== '' && newType && newBal.trim() !== '';

  const addAccount = async () => {
    if (!canAdd) return;
    setAdding(true);
    try {
      const payload = {
        name: newName.trim(),
        type: newType,
        balance: toNum(newBal),
      };
      const r = await fetch('/api/accounts', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? 'Add failed');
      const a: Item = j.item;
      setItems(prev => [...prev, a]);
      setRow(prev => ({
        ...prev,
        [a.id]: {
          balanceStr: asStr(a.balance),
          _saved_balanceStr: asStr(a.balance),
          dirty: false,
          saving: false,
        }
      }));
      setNewName(''); setNewType('TFSA'); setNewBal('');
    } catch (e:any) {
      alert(e?.message || 'Add failed');
    } finally {
      setAdding(false);
    }
  };

  // row edits
  const onEdit = (id: string, patch: Partial<RowState>) => {
    setRow(prev => {
      const curr = prev[id];
      if (!curr) return prev;
      const next: RowState = { ...curr, ...patch };
      next.dirty = next.balanceStr !== next._saved_balanceStr;
      return { ...prev, [id]: next };
    });
  };

  const saveRow = async (a: Item) => {
    const st = row[a.id];
    if (!st || st.saving || !st.dirty) return;
    setRow(prev => ({ ...prev, [a.id]: { ...prev[a.id], saving: true } }));
    try {
      const payload = { balance: toNum(st.balanceStr) };
      const r = await fetch(`/api/accounts/${a.id}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? 'Save failed');
      const saved: Item = j.item ?? { ...a, ...payload };
      setItems(prev => prev.map(x => x.id === a.id ? saved : x));
      // snapshot -> greys Save
      setRow(prev => ({
        ...prev,
        [a.id]: {
          balanceStr: asStr(saved.balance),
          _saved_balanceStr: asStr(saved.balance),
          dirty: false,
          saving: false,
        }
      }));
    } catch (e:any) {
      alert(e?.message || 'Save failed');
      setRow(prev => ({ ...prev, [a.id]: { ...prev[a.id], saving: false } }));
    }
  };

  const deleteRow = async (id: string) => {
    if (!confirm('Delete this account?')) return;
    try {
      const r = await fetch(`/api/accounts/${id}`, { method: 'DELETE', headers: authHeaders });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? 'Delete failed');
      setItems(prev => prev.filter(x => x.id !== id));
      setRow(prev => { const c = { ...prev }; delete (c as any)[id]; return c; });
    } catch (e:any) {
      alert(e?.message || 'Delete failed');
    }
  };

  if (!session) {
    return (
      <main className="max-w-6xl mx-auto p-4">
        <div className="rounded-xl border bg-white p-6">Sign in to manage accounts.</div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-medium">Add account</div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Institution / Name</label>
            <input className="w-56 rounded-md border px-3 py-2" placeholder="e.g., RBC RESP"
              value={newName} onChange={e=>setNewName(e.target.value)} />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Type</label>
            <select className="w-40 rounded-md border px-3 py-2" value={newType}
              onChange={e=>setNewType(e.target.value as Item['type'])}>
              {TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Total current value (equity)</label>
            <input className="w-40 rounded-md border px-3 py-2" type="text" inputMode="decimal"
              placeholder="e.g., 12000" value={newBal} onChange={e=>setNewBal(e.target.value)} />
          </div>
          <button onClick={addAccount} disabled={!canAdd || adding}
            className={(!canAdd || adding)
              ? 'rounded bg-gray-300 px-4 py-2 text-gray-600 cursor-not-allowed'
              : 'rounded bg-blue-600 px-4 py-2 text-white'}>
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Enter the <b>total current value</b> of each account. RESP configuration (family, kids, per-year tracking) is on the <b>Room</b> page.
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-medium">Your accounts</div>
        {loading ? <div className="text-sm text-gray-600">Loading…</div>
         : err ? <div className="text-sm text-red-600">{err}</div>
         : items.length === 0 ? <div className="text-sm text-gray-600">No accounts yet.</div>
         : (
          <div className="space-y-2">
            {items.map(a => {
              const st = row[a.id]; if (!st) return null;
              const canSave = st.dirty && !st.saving;
              return (
                <div key={a.id} className="grid grid-cols-1 sm:grid-cols-12 items-end gap-3 border rounded-lg p-3">
                  <div className="sm:col-span-4">
                    <div className="text-xs text-gray-600">Institution / Name</div>
                    <div className="mt-1 text-sm">{a.name}</div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="text-xs text-gray-600">Type</div>
                    <div className="mt-1 text-sm">{a.type}</div>
                  </div>
                  <div className="sm:col-span-3">
                    <label className="text-xs text-gray-600">Total current value (equity)</label>
                    <input className="mt-1 w-full rounded-md border px-3 py-2" type="text" inputMode="decimal"
                      placeholder="e.g., 12000" value={st.balanceStr}
                      onChange={e=>onEdit(a.id, { balanceStr: e.target.value })}/>
                  </div>
                  <div className="sm:col-span-12 flex justify-end gap-2">
                    <button onClick={()=>saveRow(a)} disabled={!canSave}
                      className={canSave
                        ? 'rounded bg-emerald-600 px-3 py-1.5 text-white'
                        : 'rounded bg-gray-300 px-3 py-1.5 text-gray-600 cursor-not-allowed'}>
                      {st.saving ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={()=>deleteRow(a.id)} className="rounded bg-red-500 px-3 py-1.5 text-white">Delete</button>
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
