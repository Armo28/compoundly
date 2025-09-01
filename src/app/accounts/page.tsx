'use client';

/* ACCOUNTS_PAGE_TIDY_V3 */

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';

type Account = {
  id: string | number;
  institution: string;
  type: string;
  balance: number;
  changed?: boolean; // enables Save only after an edit
};

const TYPES = ['TFSA', 'RRSP', 'RESP', 'LIRA', 'Margin', 'Other'] as const;

function normalizeAccounts(input: any): Account[] {
  const arr = Array.isArray(input) ? input : [];
  return arr.map((r: any) => ({
    id: r.id ?? r.ID ?? r.pk ?? String(Math.random()),
    institution: String(r.institution ?? r.name ?? '').trim(),
    type: String(r.type ?? 'Other'),
    balance: Number(r.balance ?? 0),
  }));
}

export default function AccountsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';
  const [error, setError] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);

  // “Add” row state
  const [newInstitution, setNewInstitution] = useState('');
  const [newType, setNewType] = useState<(typeof TYPES)[number]>('TFSA');
  const [newBalance, setNewBalance] = useState<string>(''); // keep as string to allow blank

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/accounts', {
          headers: { authorization: `Bearer ${token}` },
        });
        const j = await res.json().catch(() => ({}));
        const raw =
          j?.data ??
          j?.accounts ??
          j?.rows ??
          (Array.isArray(j) ? j : []);
        setAccounts(normalizeAccounts(raw));
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load accounts.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function addAccount() {
    try {
      setError(null);
      if (!newInstitution.trim() || newBalance === '') return;
      const body = {
        institution: newInstitution.trim(),
        type: newType,
        balance: Number(newBalance) || 0,
      };
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      // accept {ok, account} OR return entire list again
      if (j?.account) {
        setAccounts((a) => [...a, ...normalizeAccounts([j.account])]);
      } else {
        const raw =
          j?.data ??
          j?.accounts ??
          j?.rows ??
          (Array.isArray(j) ? j : []);
        if (Array.isArray(raw) && raw.length) {
          setAccounts(normalizeAccounts(raw));
        } else {
          // best effort: push local optimistic row
          setAccounts((a) => [
            ...a,
            {
              id: crypto.randomUUID?.() ?? Math.random(),
              institution: body.institution,
              type: body.type,
              balance: body.balance,
            },
          ]);
        }
      }
      setNewInstitution('');
      setNewType('TFSA');
      setNewBalance('');
    } catch (e: any) {
      setError(e?.message ?? 'Failed to add account.');
    }
  }

  async function saveAccount(id: string | number) {
    try {
      setError(null);
      const row = accounts.find((a) => a.id === id);
      if (!row) return;
      const res = await fetch(`/api/accounts/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          institution: row.institution ?? '',
          type: row.type ?? 'Other',
          balance: Number(row.balance) || 0,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (j?.ok !== false) {
        setAccounts((prev) =>
          prev.map((a) => (a.id === id ? { ...a, changed: false } : a))
        );
      } else {
        setError(j?.message ?? 'Failed to save account.');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save account.');
    }
  }

  async function deleteAccount(id: string | number) {
    try {
      setError(null);
      const res = await fetch(`/api/accounts/${id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      });
      const j = await res.json().catch(() => ({}));
      if (j?.ok !== false) {
        setAccounts((prev) => prev.filter((a) => a.id !== id));
      } else {
        setError(j?.message ?? 'Failed to delete account.');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to delete account.');
    }
  }

  function setRow<K extends keyof Account>(id: string | number, key: K, val: Account[K]) {
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [key]: val, changed: true } : a))
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-4 space-y-6">
      {/* Add account */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <input
            value={newInstitution}
            onChange={(e) => setNewInstitution(e.target.value)}
            className="w-40 rounded border px-2 py-1"
            placeholder="Institution (e.g., BMO)"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as any)}
            className="w-32 rounded border px-2 py-1"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            type="number"
            inputMode="decimal"
            value={newBalance}
            onChange={(e) => setNewBalance(e.target.value)}
            className="w-32 rounded border px-2 py-1 text-right"
            placeholder="Balance"
          />
          <button
            onClick={addAccount}
            className="rounded bg-blue-600 px-4 py-1.5 text-white"
          >
            Add
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Save becomes clickable only after you change a row.
        </p>
      </section>

      {/* Your accounts */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-medium">Your accounts</div>

        {error && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="p-3 text-sm text-gray-600">Loading…</div>
        ) : accounts.length === 0 ? (
          <div className="p-3 text-sm text-gray-500">No accounts yet.</div>
        ) : (
          <div className="space-y-2">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center gap-3">
                <input
                  value={a.institution ?? ''}
                  onChange={(e) => setRow(a.id, 'institution', e.target.value)}
                  className="w-40 rounded border px-2 py-1"
                  placeholder="Institution"
                />
                <select
                  value={a.type ?? 'Other'}
                  onChange={(e) => setRow(a.id, 'type', e.target.value)}
                  className="w-32 rounded border px-2 py-1"
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  inputMode="decimal"
                  value={Number.isFinite(a.balance) ? a.balance : 0}
                  onChange={(e) =>
                    setRow(a.id, 'balance', Number(e.target.value))
                  }
                  className="w-32 rounded border px-2 py-1 text-right"
                  placeholder="Balance"
                />
                <button
                  onClick={() => saveAccount(a.id)}
                  disabled={!a.changed}
                  className={
                    a.changed
                      ? 'rounded bg-blue-600 px-3 py-1.5 text-white'
                      : 'rounded bg-gray-300 px-3 py-1.5 text-gray-600 cursor-not-allowed'
                  }
                >
                  Save
                </button>
                <button
                  onClick={() => deleteAccount(a.id)}
                  className="rounded bg-red-500 px-3 py-1.5 text-white"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

