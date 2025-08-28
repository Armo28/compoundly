'use client';
import { useEffect, useState } from 'react';
import { computePlan } from '@/lib/plan';

const Y = new Date().getFullYear();

type Child = { id: string, name: string|null, birth_year: number };

export default function GoalsPage() {
  const [monthly, setMonthly] = useState(1000);
  const [year, setYear] = useState(Y);
  const [tfsaRoom, setTfsaRoom] = useState(0);
  const [rrspRoom, setRrspRoom] = useState(0);
  const [children, setChildren] = useState<Child[]>([]);
  const [name, setName] = useState('');
  const [birth, setBirth] = useState<number | ''>('');

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/rooms?year=${year}`, { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        setTfsaRoom(d?.tfsa_room ?? 0);
        setRrspRoom(d?.rrsp_room ?? 0);
      }
      const c = await fetch('/api/children', { cache: 'no-store' });
      if (c.ok) setChildren(await c.json());
    })();
  }, [year]);

  async function addChild(e: React.FormEvent) {
    e.preventDefault();
    if (!birth) return;
    const res = await fetch('/api/children', { method: 'POST', body: JSON.stringify({ name, birth_year: Number(birth) }) });
    if (res.ok) {
      setName(''); setBirth('');
      const c = await fetch('/api/children', { cache: 'no-store' });
      if (c.ok) setChildren(await c.json());
    }
  }

  async function delChild(id: string) {
    await fetch(`/api/children?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const c = await fetch('/api/children', { cache: 'no-store' });
    if (c.ok) setChildren(await c.json());
  }

  const plan = computePlan({
    monthlyBudget: monthly,
    childrenBirthYears: children.map(c=>c.birth_year),
    year,
    tfsaRoom,
    rrspRoom,
  });

  return (
    <main className="max-w-6xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="rounded-2xl border bg-white p-5 shadow-sm dark:bg-neutral-900 dark:border-neutral-800">
        <h1 className="text-xl font-semibold">Your goals</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Tell us your monthly capacity and family situation. We’ll suggest where to allocate each month.
        </p>

        <div className="mt-4 space-y-3">
          <label className="text-sm block">
            <span>Monthly contribution</span>
            <input type="range" min={0} max={5000} step={50} value={monthly} onChange={e=>setMonthly(+e.target.value)} className="w-full"/>
            <div className="text-sm text-gray-600 dark:text-gray-300">CA${monthly.toLocaleString()}</div>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm block">
              <span>Tax year</span>
              <input type="number" value={year} onChange={e=>setYear(+e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 dark:bg-neutral-900 dark:border-neutral-700"/>
            </label>
            <label className="text-sm block">
              <span>TFSA room (year)</span>
              <input type="number" value={tfsaRoom} onChange={e=>setTfsaRoom(+e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 dark:bg-neutral-900 dark:border-neutral-700"/>
            </label>
            <label className="text-sm block">
              <span>RRSP room (year)</span>
              <input type="number" value={rrspRoom} onChange={e=>setRrspRoom(+e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 dark:bg-neutral-900 dark:border-neutral-700"/>
            </label>
          </div>

          <div className="mt-4">
            <div className="font-medium mb-2">Children (for RESP planning)</div>
            <form onSubmit={addChild} className="flex flex-col sm:flex-row gap-2">
              <input placeholder="Name (optional)" value={name} onChange={e=>setName(e.target.value)}
                className="rounded-lg border px-3 py-2 dark:bg-neutral-900 dark:border-neutral-700 flex-1"/>
              <input placeholder="Birth year" type="number" value={birth} onChange={e=>setBirth(e.target.value as any)}
                className="rounded-lg border px-3 py-2 dark:bg-neutral-900 dark:border-neutral-700 w-36"/>
              <button className="rounded-lg bg-indigo-600 text-white px-4 py-2">Add</button>
            </form>
            <ul className="mt-2 text-sm">
              {children.map(c=>(
                <li key={c.id} className="flex items-center justify-between py-1 border-b dark:border-neutral-800">
                  <span>{c.name || 'Child'} — {c.birth_year}</span>
                  <button onClick={()=>delChild(c.id)} className="rounded-md border px-2 py-1 text-xs dark:border-neutral-700">Remove</button>
                </li>
              ))}
              {children.length === 0 && <li className="text-gray-500">No children added.</li>}
            </ul>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm dark:bg-neutral-900 dark:border-neutral-800">
        <h2 className="text-lg font-semibold">Recommended monthly split</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border p-3 dark:border-neutral-800">
            <div className="text-gray-500">RESP</div>
            <div className="text-xl font-semibold">CA${Math.round(plan.allocation.RESP).toLocaleString()}</div>
          </div>
          <div className="rounded-xl border p-3 dark:border-neutral-800">
            <div className="text-gray-500">TFSA</div>
            <div className="text-xl font-semibold">CA${Math.round(plan.allocation.TFSA).toLocaleString()}</div>
          </div>
          <div className="rounded-xl border p-3 dark:border-neutral-800">
            <div className="text-gray-500">RRSP</div>
            <div className="text-xl font-semibold">CA${Math.round(plan.allocation.RRSP).toLocaleString()}</div>
          </div>
          <div className="rounded-xl border p-3 dark:border-neutral-800">
            <div className="text-gray-500">Margin</div>
            <div className="text-xl font-semibold">CA${Math.round(plan.allocation.Margin).toLocaleString()}</div>
          </div>
        </div>

        <div className="mt-4 text-sm space-y-2">
          {plan.reasoning.map((r, i)=><div key={i}>• {r}</div>)}
        </div>
        <div className="mt-4 text-xs text-gray-500">
          This is a simple heuristic MVP. You can override anytime by editing your accounts/room.
        </div>
      </div>
    </main>
  );
}
