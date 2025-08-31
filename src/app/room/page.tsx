'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';

const CAD = (n:number)=>n.toLocaleString(undefined,{style:'currency',currency:'CAD',maximumFractionDigits:0});

function SmallDonut({ filled, total, label }:{filled:number,total:number,label:string}) {
  const pct = total>0 ? Math.min(100, Math.max(0, (filled/total)*100)) : 0;
  const r=36, c=2*Math.PI*r;
  const off = c*(1-pct/100);
  return (
    <div className="flex flex-col items-center">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#eef2ff" strokeWidth="12"/>
        <circle cx="48" cy="48" r={r} fill="none" stroke="#6366f1" strokeWidth="12"
                strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
                transform="rotate(-90 48 48)"/>
        <text x="48" y="52" textAnchor="middle" fontSize="14" className="font-medium">{Math.round(pct)}%</text>
      </svg>
      <div className="text-xs text-gray-600">{label} filled</div>
    </div>
  );
}

export default function RoomPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';
  const y = new Date().getFullYear();

  const [tfsaRoom,setTfsaRoom]=useState<string>('');   // allow blank
  const [rrspRoom,setRrspRoom]=useState<string>('');
  const [tfsaDep,setTfsaDep]=useState<string>('');
  const [rrspDep,setRrspDep]=useState<string>('');
  const [msg,setMsg]=useState('');

  async function load() {
    if (!token) return;
    // room
    const r1 = await fetch(`/api/rooms?year=${y}`,{headers:{authorization:`Bearer ${token}`}});
    const j1 = await r1.json();
    if (j1?.ok) {
      setTfsaRoom(j1.room?.tfsa ? String(j1.room.tfsa) : '');
      setRrspRoom(j1.room?.rrsp ? String(j1.room.rrsp) : '');
    }
    // progress
    const r2 = await fetch(`/api/rooms/progress?year=${y}`,{headers:{authorization:`Bearer ${token}`}});
    const j2 = await r2.json();
    if (j2?.ok) {
      setTfsaDep(j2.progress?.tfsa_deposited ? String(j2.progress.tfsa_deposited) : '');
      setRrspDep(j2.progress?.rrsp_deposited ? String(j2.progress.rrsp_deposited) : '');
    }
  }

  useEffect(()=>{ load(); /* eslint-disable-next-line */},[token]);

  async function saveRoom() {
    const body = { year: y, tfsa: Number(tfsaRoom||0), rrsp: Number(rrspRoom||0) };
    const r = await fetch('/api/rooms',{method:'PUT',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(body)});
    const j = await r.json();
    if (!j?.ok) setMsg(`Error: ${j?.error||'Save failed'}`); else setMsg('Saved.');
    setTimeout(()=>setMsg(''),1500);
  }
  async function saveProgress() {
    const body = { year: y, tfsa_deposited: Number(tfsaDep||0), rrsp_deposited: Number(rrspDep||0) };
    const r = await fetch('/api/rooms/progress',{method:'PUT',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(body)});
    const j = await r.json();
    if (!j?.ok) setMsg(`Error: ${j?.error||'Save failed'}`); else setMsg('Saved.');
    setTimeout(()=>setMsg(''),1500);
  }

  const tfsaRoomNum = Number(tfsaRoom||0);
  const rrspRoomNum = Number(rrspRoom||0);
  const tfsaDepNum  = Number(tfsaDep||0);
  const rrspDepNum  = Number(rrspDep||0);

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="rounded-xl border bg-white p-4">
        <div className="text-sm font-medium mb-3">Contribution Room — {y}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input className="border rounded-lg px-3 py-2" placeholder="e.g. 6500" inputMode="decimal" value={tfsaRoom} onChange={e=>setTfsaRoom(e.target.value.replace(/[^\d.]/g,''))}/>
          <input className="border rounded-lg px-3 py-2" placeholder="e.g. 18000" inputMode="decimal" value={rrspRoom} onChange={e=>setRrspRoom(e.target.value.replace(/[^\d.]/g,''))}/>
        </div>
        <div className="mt-3 flex gap-3">
          <button onClick={saveRoom} className="rounded-lg bg-blue-600 text-white px-4 py-2">Save</button>
          <label className="inline-flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer">
            <input type="file" accept="application/pdf" className="hidden" onChange={async(e)=>{
              if (!e.currentTarget.files?.[0]) return;
              // placeholder endpoint – just shows success for now
              const r = await fetch('/api/rooms/upload',{method:'POST',headers:{authorization:`Bearer ${token}`}});
              const j = await r.json();
              setMsg(j?.message || 'Uploaded');
              setTimeout(()=>setMsg(''),1500);
            }}/>
            Upload CRA Notice (PDF)
          </label>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="text-sm font-medium mb-3">Deposited so far — {y}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input className="border rounded-lg px-3 py-2" placeholder="TFSA deposited (e.g. 2200)" inputMode="decimal" value={tfsaDep} onChange={e=>setTfsaDep(e.target.value.replace(/[^\d.]/g,''))}/>
          <input className="border rounded-lg px-3 py-2" placeholder="RRSP deposited (e.g. 7400)" inputMode="decimal" value={rrspDep} onChange={e=>setRrspDep(e.target.value.replace(/[^\d.]/g,''))}/>
        </div>
        <div className="mt-3">
          <button onClick={saveProgress} className="rounded-lg bg-blue-600 text-white px-4 py-2">Save</button>
        </div>

        <div className="mt-4 flex gap-8">
          <SmallDonut filled={tfsaDepNum} total={tfsaRoomNum} label="TFSA"/>
          <SmallDonut filled={rrspDepNum} total={rrspRoomNum} label="RRSP"/>
        </div>
      </div>

      {msg && <div className="text-sm">{msg}</div>}
    </main>
  );
}
