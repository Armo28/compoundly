'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';

const CAD = (n:number)=>n.toLocaleString(undefined,{style:'currency',currency:'CAD',maximumFractionDigits:0});

export default function RoomPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  const year = new Date().getFullYear();

  // contribution room
  const [tfsaRoom, setTfsaRoom] = useState<string>(''); // keep as string to avoid forced "0"
  const [rrspRoom, setRrspRoom] = useState<string>('');
  // deposited so far
  const [tfsaDep, setTfsaDep] = useState<string>('');
  const [rrspDep, setRrspDep] = useState<string>('');
  const [msg, setMsg] = useState<string>('');

  // load saved values
  useEffect(()=>{
    if (!token) return;
    (async ()=>{
      const [r1, r2] = await Promise.all([
        fetch('/api/rooms', { headers:{ authorization:`Bearer ${token}`}}).then(r=>r.json()),
        fetch('/api/rooms/progress', { headers:{ authorization:`Bearer ${token}`}}).then(r=>r.json()),
      ]);

      if (r1?.room) {
        setTfsaRoom(r1.room.tfsa ? String(r1.room.tfsa) : '');
        setRrspRoom(r1.room.rrsp ? String(r1.room.rrsp) : '');
      }
      if (r2?.progress) {
        setTfsaDep(r2.progress.tfsa_deposited ? String(r2.progress.tfsa_deposited) : '');
        setRrspDep(r2.progress.rrsp_deposited ? String(r2.progress.rrsp_deposited) : '');
      }
    })();
  },[token]);

  const saveRoom = async ()=>{
    setMsg('');
    const res = await fetch('/api/rooms', {
      method:'POST',
      headers:{ 'content-type':'application/json', authorization:`Bearer ${token}` },
      body: JSON.stringify({
        tfsa: Number(tfsaRoom||0),
        rrsp: Number(rrspRoom||0),
      })
    });
    const j = await res.json();
    setMsg(j?.ok ? 'Saved!' : `Error: ${j?.error ?? 'Unknown'}`);
  };

  const saveProgress = async ()=>{
    setMsg('');
    const res = await fetch('/api/rooms/progress', {
      method:'POST',
      headers:{ 'content-type':'application/json', authorization:`Bearer ${token}` },
      body: JSON.stringify({
        tfsa_deposited: Number(tfsaDep||0),
        rrsp_deposited: Number(rrspDep||0),
      })
    });
    const j = await res.json();
    setMsg(j?.ok ? 'Saved!' : `Error: ${j?.error ?? 'Unknown'}`);
  };

  const tfsaPct = useMemo(()=>{
    const room = Number(tfsaRoom||0);
    const dep  = Number(tfsaDep||0);
    if (room<=0) return 0;
    return Math.max(0, Math.min(100, Math.round((dep/room)*100)));
  },[tfsaRoom, tfsaDep]);

  const rrspPct = useMemo(()=>{
    const room = Number(rrspRoom||0);
    const dep  = Number(rrspDep||0);
    if (room<=0) return 0;
    return Math.max(0, Math.min(100, Math.round((dep/room)*100)));
  },[rrspRoom, rrspDep]);

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-6">

      <section className="rounded-2xl border bg-white p-4">
        <div className="text-sm font-medium mb-3">Contribution Room — {year}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm text-gray-600">TFSA room</span>
            <input
              inputMode="decimal"
              className="mt-1 w-full border rounded-lg px-3 py-2"
              placeholder="e.g. 6500"
              value={tfsaRoom}
              onChange={e=>setTfsaRoom(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm text-gray-600">RRSP room</span>
            <input
              inputMode="decimal"
              className="mt-1 w-full border rounded-lg px-3 py-2"
              placeholder="e.g. 18000"
              value={rrspRoom}
              onChange={e=>setRrspRoom(e.target.value)}
            />
          </label>
        </div>
        <button
          onClick={saveRoom}
          disabled={!token}
          className="mt-3 rounded-lg bg-blue-600 text-white px-4 py-2 disabled:opacity-50"
        >Save</button>
      </section>

      <section className="rounded-2xl border bg-white p-4">
        <div className="text-sm font-medium mb-3">Deposited so far — {year}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm text-gray-600">TFSA deposited</span>
            <input
              inputMode="decimal"
              className="mt-1 w-full border rounded-lg px-3 py-2"
              placeholder="e.g. 2200"
              value={tfsaDep}
              onChange={e=>setTfsaDep(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm text-gray-600">RRSP deposited</span>
            <input
              inputMode="decimal"
              className="mt-1 w-full border rounded-lg px-3 py-2"
              placeholder="e.g. 7400"
              value={rrspDep}
              onChange={e=>setRrspDep(e.target.value)}
            />
          </label>
        </div>
        <button
          onClick={saveProgress}
          disabled={!token}
          className="mt-3 rounded-lg bg-blue-600 text-white px-4 py-2 disabled:opacity-50"
        >Save</button>

        {/* little donuts */}
        <div className="mt-4 flex gap-8">
          <MiniDonut label="TFSA filled" pct={tfsaPct}/>
          <MiniDonut label="RRSP filled" pct={rrspPct}/>
        </div>
      </section>

      {msg && <div className="text-sm">{msg}</div>}
    </main>
  );
}

function MiniDonut({ pct, label }:{pct:number,label:string}) {
  const R=40, C=2*Math.PI*R;
  const off = C*(1 - pct/100);
  return (
    <div className="flex items-center gap-3">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={R} stroke="#e5e7eb" strokeWidth="10" fill="none"/>
        <circle cx="50" cy="50" r={R} stroke="#3b82f6" strokeWidth="10" fill="none"
                strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 50 50)"/>
        <text x="50" y="52" textAnchor="middle" fontSize="14" className="font-semibold">{pct}%</text>
      </svg>
      <div className="text-xs text-gray-600">{label}</div>
    </div>
  );
}
