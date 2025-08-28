'use client';
import { useEffect, useState } from 'react';

const Y = new Date().getFullYear();

export default function RoomPage() {
  const [year, setYear] = useState(Y);
  const [tfsa, setTfsa] = useState<string>('');
  const [rrsp, setRrsp] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>('');

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/rooms?year=${year}`, { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        setTfsa(d?.tfsa_room ?? '');
        setRrsp(d?.rrsp_room ?? '');
      } else {
        setTfsa(''); setRrsp('');
      }
    })();
  }, [year]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg('');
    const res = await fetch('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ year, tfsa_room: Number(tfsa || 0), rrsp_room: Number(rrsp || 0) })
    });
    setSaving(false);
    setMsg(res.ok ? 'Saved.' : `Error: ${await res.text()}`);
  }

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    // Placeholder: store file or send to OCR later.
    setMsg(`Uploaded ${f.name}. Auto-extraction coming soon — please enter numbers below for now.`);
  }

  return (
    <main className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="rounded-2xl border bg-white p-5 shadow-sm dark:bg-neutral-900 dark:border-neutral-800">
        <h1 className="text-xl font-semibold">Contribution room</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Drag & drop your CRA Notice of Assessment (PDF or image) to auto-fill (coming soon), or enter numbers manually.
        </p>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm dark:bg-neutral-900 dark:border-neutral-800">
        <div className="mb-3">
          <input type="file" accept=".pdf,image/*" onChange={onUpload} />
        </div>

        <form onSubmit={save} className="grid grid-cols-1 gap-3">
          <label className="text-sm">
            <span>Tax year</span>
            <input type="number" value={year} onChange={e=>setYear(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border px-3 py-2 dark:bg-neutral-900 dark:border-neutral-700" />
          </label>
          <label className="text-sm">
            <span>TFSA room (this year)</span>
            <input type="number" value={tfsa} onChange={e=>setTfsa(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 dark:bg-neutral-900 dark:border-neutral-700" />
          </label>
          <label className="text-sm">
            <span>RRSP room (this year)</span>
            <input type="number" value={rrsp} onChange={e=>setRrsp(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 dark:bg-neutral-900 dark:border-neutral-700" />
          </label>
          <div className="flex items-center gap-2">
            <button disabled={saving} className="rounded-lg bg-indigo-600 text-white px-4 py-2">
              {saving ? 'Saving…' : 'Save'}
            </button>
            {msg && <span className="text-sm text-gray-600 dark:text-gray-300">{msg}</span>}
          </div>
        </form>
      </div>
    </main>
  );
}
