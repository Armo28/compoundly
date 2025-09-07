'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';

type Account = {
  id: string;
  name?: string | null;
  type?: 'TFSA'|'RRSP'|'RESP'|'Margin'|'Other'|'LIRA'|string | null;
  balance?: number | null;
  created_at?: string | null;
};

type RowState = {
  balanceStr: string;
  dirty: boolean;
  saving: boolean;
  _saved_balanceStr: string;
};

const TYPES: Array<NonNullable<Account['type']>> = [
  'TFSA','RRSP','RESP','Margin','Other','LIRA'
];

function toNum(s: string) {
  const n = Number((s ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}
function asStr(n: number | null | undefined) {
  return n == null ? '' : String(n);
}
async function safeJson(r: Response) {
  try { return await r.json(); } catch { return null; }
}

export default function AccountsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  const authHeaders = useMemo(() => {
    const h = new Headers();
    if (token) h.set('authorization', `Bearer ${token}`);
    return h as HeadersInit;
  }, [token]);

  const jsonHeaders = useMemo(() => {
    const h = new Headers();
    h.set('content-type', 'application/json');
    if (token) h.set('authorization', `Bearer ${token}`);
    return h as HeadersInit;
  }, [token]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<Account[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<NonNullable<Account['type']>>('TFSA');
  const [newBal, setNewBal]   = useState('');
  const [adding, setAdding]   = useState(false);

  const canAdd = newName.trim() !== '' && newType && newBal.trim() !== '' && !adding;

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        if (!token) { setItems([]); return; }
        const r = await fetch('/api/accounts', { headers: authHeaders });
        const j = await safeJson(r);
        const list: Account[] = (j?.items && Array.isArray(j.items)) ? j.items : [];
        if (!alive) return;

        setItems(list);

        setRows(prev => {
          const next: Record<string, RowState> = { ...prev };
          for (const a of list) {
            const id = String(a.id);
            const savedBalance = asStr(a.balance);
            const existing = prev[id];
            if (!existing || (!existing.dirty && !existing.saving)) {
              next[id] = {
                balanceStr: savedBalance,
                dirty: false,
                saving: false,
                _saved_balanceStr: savedBalance,
              };
            }
          }
          for (const id of Object.keys(next)) {
            if (!list.find(a => String(a.id) === id)) delete next[id];
          }
          return next;
        });
      } catch {
        if (!alive) return;
        setErr('Failed to load accounts.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [token, authHeaders]);

  async function addAccount() {
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
      const j = await safeJson(r);
      if (!j?.ok || !j?.item) throw new Error(j?.error || 'Add failed');

      const a: Account = j.item;
      setItems(prev => [...prev, a]);

      setRows(prev => ({
        ...prev,
        [String(a.id)]: {
          balanceStr: asStr(a.balance),
          dirty: false,
          saving: false,
          _saved_balanceStr: asStr(a.balance),
        }
      }));

      setNewName(''); setNewType('TFSA'); setNewBal('');
    } catch (e: any) {
      alert(e?.message || 'Add failed');
    } finally {
      setAdding(false);
    }
  }

  function onEdit(id: string, patch: Partial<RowState>) {
    setRows(prev => {
      const curr = prev[id]; if (!curr) return prev;
      const next: RowState = { ...curr, ...patch };
      next.dirty = next.balanceStr !== curr._saved_balanceStr;
      return { ...prev, [id]: next };
    });
  }

  async function saveRow(a: Account) {
    const id = String(a.id);
    const st = rows[id]; if (!st || st.saving || !st.dirty) return;

    setRows(prev => ({ ...prev, [id]: { ...prev[id], saving: true }}));
    try {
      const payload = { balance: toNum(st.balanceStr) };
      const r = await fetch(`/api/accounts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      const j = await safeJson(r);
      if (!j?.ok || !j?.item) throw new Error(j?.error || 'Save failed');

      const saved: Account = j.item;
      setItems(prev => prev.map(x => String(x.id) === id ? saved : x));
      const savedStr = asStr(saved.balance);

      setRows(prev => ({
        ...prev,
        [id]: { balanceStr: savedStr, _saved_balanceStr: savedStr, dirty: false, saving: false }
      }));
    } catch (e: any) {
      alert(e?.message || 'Save failed');
      setRows(prev => ({ ...prev, [id]: { ...prev[id], saving: false }}));
    }
  }

  async function deleteRow(id: string) {
    if (!confirm('Delete this account?')) return;
    try {
      const r = await fetch(`/api/accounts/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const j = await safeJson(r);
      if (!j?.ok) throw new Error(j?.error || 'Delete failed');

      setItems(prev => prev.filter(a => String(a.id) !== id));
      setRows(prev => {
        const n = { ...prev }; delete n[id]; return n;
      });
    } catch (e: any) {
      alert(e?.message || 'Delete failed');
    }
  }

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
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-600">Institution / Name</label>
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="e.g., RBC RESP"
              value={newName}
              onChange={e => setNewName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-600">Type</label>
            <select
              className="mt-1 w-full rounded-md border px-3 py-2"
              value={newType}
              onChange={e => setNewType(e.target.value as NonNullable<Account['type']>)}
            >
              {TYPES.map(t => (<option key={t} value={t}>{t}</option>))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600">Total current value (equity)</label>
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              type="text"
              inputMode="decimal"
              placeholder="e.g., 12000"
              value={newBal}
              onChange={e => setNewBal(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={addAccount}
              disabled={!canAdd}
              className={
                canAdd
                  ? 'w-full rounded bg-blue-600 px-4 py-2 text-white'
                  : 'w-full rounded bg-gray-300 px-4 py-2 text-gray-600 cursor-not-allowed'
              }
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Enter the <strong>total current value</strong> of each account. RESP configuration
          (family, number of kids, per-year tracking) is on the <strong>Room</strong> page.
        </p>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-medium">Your accounts</div>
        {loading ? (
          <div className="text-sm text-gray-600">Loading…</div>
        ) : err ? (
          <div className="text-sm text-red-600">{err}</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-gray-600">No accounts yet.</div>
        ) : (
          <ul className="space-y-3">
            {items.map((a) => {
              const id = String(a.id);
              const st = rows[id];
              if (!st) return null;
              const canSave = st.dirty && !st.saving;

              return (
                <li key={id} className="rounded-lg border p-3">
                  <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end">
                    <div className="sm:col-span-2">
                      <div className="text-[11px] text-gray-600">Institution / Name</div>
                      <div className="mt-1 text-sm">{a?.name || '—'}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-600">Type</div>
                      <div className="mt-1 text-sm">{a?.type || '—'}</div>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[11px] text-gray-600">Total current value (equity)</label>
                      <input
                        className="mt-1 w-full rounded-md border px-3 py-2"
                        type="text"
                        inputMode="decimal"
                        placeholder="e.g., 25000"
                        value={st.balanceStr}
                        onChange={e => onEdit(id, { balanceStr: e.target.value })}
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => saveRow(a)}
                        disabled={!canSave}
                        className={
                          canSave
                            ? 'rounded bg-emerald-600 px-3 py-1.5 text-white'
                            : 'rounded bg-gray-300 px-3 py-1.5 text-gray-600 cursor-not-allowed'
                        }
                      >
                        {st.saving ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={() => deleteRow(id)}
                        className="rounded bg-red-500 px-3 py-1.5 text-white"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
