'use client';
import { useEffect, useState } from 'react';

type Account = {
  id: string;
  name: string | null;
  institution: string | null;
  type: string;
  balance: number;
};

const TYPES = ['TFSA', 'RRSP', 'RESP', 'Margin', 'Other'];

export default function AccountsPage() {
  const [rows, setRows] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', institution: '', type: 'TFSA', balance: '' });

  async function load() {
    setLoading(true);
    const res = await fetch('/api/accounts', { cache: 'no-store' });
    setLoading(false);
    if (res.ok) setRows(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const body = { ...form, balance: Number(form.balance || 0) };
    const res = await fetch('/api/accounts', { method: 'POST', body: JSON.stringify(body) });
    if (res.ok) {
      setForm({ name: '', institution: '', type: 'TFSA', balance: '' });
      load();
    } else {
      alert(await res.text());
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/accounts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.status === 204) load();
  }

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="rounded-2xl border bg-white p-5 shadow-sm dark:bg-neutral-900 dark:border-neutral-800">
        <h1 className="text-xl font-semibold">Your accounts (manual)</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Add any account from any institution. You can connect brokerages later; manual is always available.
        </p>
      </div>

      <form onSubmit={add} className="rounded-2xl border bg-white p-4 shadow-sm grid grid-cols-1 md:grid-cols-5 gap-3 dark:bg-neutral-900 dark:border-neutral-800">
        <input
          placeholder="Name (optional)"
          className="rounded-lg border px-3 py-2 dark:bg-neutral-900 dark:border-neutral-700"
          value={form.name} onChange={e=>setForm(s=>({...s, name:e.target.value}))}
        />
        <input
          placeholder="Institution (optional)"
          className="rounded-lg border px-3 py-2 dark:bg-neutral-900 dark:border-neutral-700"
          value={form.institution} onChange={e=>setForm(s=>({...s, institution:e.target.value}))}
        />
        <select
          className="rounded-lg border px-3 py-2 dark:bg-neutral-900 dark:border-neutral-700"
          value={form.type} onChange={e=>setForm(s=>({...s, type:e.target.value}))}
        >
          {TYPES.map(t=><option key={t}>{t}</option>)}
        </select>
        <input
          placeholder="Balance (CAD)"
          type="number" min="0" step="0.01"
          className="rounded-lg border px-3 py-2 dark:bg-neutral-900 dark:border-neutral-700"
          value={form.balance} onChange={e=>setForm(s=>({...s, balance:e.target.value}))}
        />
        <button className="rounded-lg bg-indigo-600 text-white px-4 py-2">Add account</button>
      </form>

      <div className="rounded-2xl border bg-white p-0 overflow-hidden shadow-sm dark:bg-neutral-900 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-neutral-800">
            <tr className="text-left">
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Institution</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Balance</th>
              <th className="px-4 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-3" colSpan={5}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-3" colSpan={5}>No accounts yet.</td></tr>
            ) : rows.map(r=>(
              <tr key={r.id} className="border-t dark:border-neutral-800">
                <td className="px-4 py-2">{r.name || '—'}</td>
                <td className="px-4 py-2">{r.institution || '—'}</td>
                <td className="px-4 py-2">{r.type}</td>
                <td className="px-4 py-2">CA${Number(r.balance||0).toLocaleString()}</td>
                <td className="px-4 py-2">
                  <button onClick={()=>remove(r.id)} className="rounded-md border px-2 py-1 dark:border-neutral-700">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
