'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';

type Account = {
  id: string;
  institution: string;
  type: string;
  balance: number;
  changed?: boolean; // track whether Save should be enabled
};

export default function AccountsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [newInstitution, setNewInstitution] = useState('');
  const [newType, setNewType] = useState('TFSA');
  const [newBalance, setNewBalance] = useState<number | ''>('');

  // Fetch accounts
  useEffect(() => {
    if (!token) return;
    (async () => {
      const res = await fetch('/api/accounts', {
        headers: { authorization: `Bearer ${token}` },
      });
      const j = await res.json();
      if (j?.ok) setAccounts(j.data);
    })();
  }, [token]);

  // Handle add
  const handleAdd = async () => {
    if (!newInstitution || newBalance === '') return;
    const body = { institution: newInstitution, type: newType, balance: +newBalance };
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    if (j?.ok) {
      setAccounts([...accounts, j.account]);
      setNewInstitution('');
      setNewType('TFSA');
      setNewBalance('');
    }
  };

  // Handle save
  const handleSave = async (id: string) => {
    const acct = accounts.find((a) => a.id === id);
    if (!acct) return;
    const res = await fetch(`/api/accounts/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ balance: acct.balance }),
    });
    const j = await res.json();
    if (j?.ok) {
      setAccounts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, changed: false } : a))
      );
    }
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/accounts/${id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    const j = await res.json();
    if (j?.ok) {
      setAccounts(accounts.filter((a) => a.id !== id));
    }
  };

  // Handle change tracking
  const handleInstitutionChange = (id: string, value: string) => {
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, institution: value, changed: true } : a
      )
    );
  };

  const handleTypeChange = (id: string, value: string) => {
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, type: value, changed: true } : a))
    );
  };

  const handleBalanceChange = (id: string, value: string) => {
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, balance: +value, changed: true } : a
      )
    );
  };

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Add Account Row */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={newInstitution}
            onChange={(e) => setNewInstitution(e.target.value)}
            className="border rounded px-2 py-1 w-40"
            placeholder="Institution (e.g., BMO)"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            className="border rounded px-2 py-1 w-32"
          >
            <option value="TFSA">TFSA</option>
            <option value="RRSP">RRSP</option>
            <option value="RESP">RESP</option>
            <option value="LIRA">LIRA</option>
            <option value="Margin">Margin</option>
            <option value="Other">Other</option>
          </select>
          <input
            type="number"
            value={newBalance}
            onChange={(e) => setNewBalance(e.target.value === '' ? '' : +e.target.value)}
            className="border rounded px-2 py-1 w-32 text-right"
            placeholder="Balance"
          />
          <button
            onClick={handleAdd}
            className="px-3 py-1 rounded bg-blue-500 text-white"
          >
            Add
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Tip: balances can be updated anytime; Save becomes clickable only when a change is made.
        </p>
      </div>

      {/* Accounts List */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-2">
        <h2 className="text-sm font-medium mb-2">Your accounts</h2>
        {accounts.map((acct) => (
          <div key={acct.id} className="flex items-center gap-3">
            {/* Institution */}
            <input
              type="text"
              value={acct.institution}
              onChange={(e) => handleInstitutionChange(acct.id, e.target.value)}
              className="border rounded px-2 py-1 w-40"
              placeholder="Institution"
            />
            {/* Type */}
            <select
              value={acct.type}
              onChange={(e) => handleTypeChange(acct.id, e.target.value)}
              className="border rounded px-2 py-1 w-32"
            >
              <option value="TFSA">TFSA</option>
              <option value="RRSP">RRSP</option>
              <option value="RESP">RESP</option>
              <option value="LIRA">LIRA</option>
              <option value="Margin">Margin</option>
              <option value="Other">Other</option>
            </select>
            {/* Balance */}
            <input
              type="number"
              value={acct.balance}
              onChange={(e) => handleBalanceChange(acct.id, e.target.value)}
              className="border rounded px-2 py-1 w-32 text-right"
              placeholder="Balance"
            />
            {/* Buttons */}
            <button
              onClick={() => handleSave(acct.id)}
              disabled={!acct.changed}
              className={`px-3 py-1 rounded ${
                acct.changed
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-300 text-gray-600 cursor-not-allowed'
              }`}
            >
              Save
            </button>
            <button
              onClick={() => handleDelete(acct.id)}
              className="px-3 py-1 rounded bg-red-500 text-white"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
