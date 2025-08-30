'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';

const CAD=(n:number)=>n.toLocaleString(undefined,{style:'currency',currency:'CAD',maximumFractionDigits:0});
type Child={id:number; name:string; birth_year:number};

export default function Goals() {
  const { session, loading } = useAuth();
  const token = session?.access_token ?? '';
  const year = new Date().getFullYear();

  const [pledge,setPledge]=useState<number>(1000);
  const [children,setChildren]=useState<Child[]>([]);
  const [room,setRoom]=useState<{tfsa:number; rrsp:number}>({tfsa:0, rrsp:0});

  useEffect(()=>{
    if(!token) return;
    (async()=>{
      const r1=await fetch(`/api/room?year=${year}`,{headers:{authorization:`Bearer ${token}`}});
      const j1=await r1.json(); if(j1?.ok) setRoom({tfsa:Number(j1.room?.tfsa||0), rrsp:Number(j1.room?.rrsp||0)});
      // re-use children table if you have it; otherwise start empty list
      // (not adding CRUD here to keep this page focused)
      setChildren(children); // no-op placeholder if you don't have child input yet
    })();
  },[token,year]);

  const suggested = useMemo(()=>{
    let remaining = pledge;
    const monthsLeft = 12 - (new Date().getMonth());
    const out = { toRESP:0, toTFSA:0, toRRSP:0, toMargin:0 };

    // RESP first: up to $2,500/child/year
    const respAnnualCap = children.length * 2500;
    const respMonthlyCap = respAnnualCap / 12;
    const resp = Math.min(remaining, respMonthlyCap);
    out.toRESP = resp; remaining -= resp;

    // TFSA next: spread room over remaining months
    const tfsaMonthlyCap = room.tfsa > 0 ? room.tfsa / monthsLeft : 0;
    const tfsa = Math.min(remaining, tfsaMonthlyCap);
    out.toTFSA = tfsa; remaining -= tfsa;

    // RRSP next
    const rrspMonthlyCap = room.rrsp > 0 ? room.rrsp / monthsLeft : 0;
    const rrsp = Math.min(remaining, rrspMonthlyCap);
    out.toRRSP = rrsp; remaining -= rrsp;

    out.toMargin = Math.max(0, remaining);
    return out;
  },[pledge, children, room]);

  if (loading) return <main className="max-w-4xl mx-auto p-4"><div className="border rounded-xl bg-white p-4">Loading…</div></main>;
  if (!session) return <main className="max-w-4xl mx-auto p-4"><div className="border rounded-xl bg-white p-4">Sign in first.</div></main>;

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="rounded-xl border bg-white p-4">
        <div className="text-sm font-medium mb-2">Monthly pledge</div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600 min-w-[80px] text-right">{CAD(pledge)}</span>
          <input className="w-80 h-2 rounded-lg bg-gray-200 appearance-none accent-blue-600" type="range" min={0} max={5000} step={50} value={pledge} onChange={e=>setPledge(+e.target.value)}/>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="text-sm font-medium mb-2">Suggested monthly split (prototype)</div>
        <ul className="text-sm space-y-1">
          <li>RESP: <span className="font-medium">{CAD(suggested.toRESP)}</span></li>
          <li>TFSA: <span className="font-medium">{CAD(suggested.toTFSA)}</span></li>
          <li>RRSP: <span className="font-medium">{CAD(suggested.toRRSP)}</span></li>
          <li>Margin/Other: <span className="font-medium">{CAD(suggested.toMargin)}</span></li>
        </ul>
        <div className="text-xs text-gray-500 mt-2">RESP prioritized up to $2,500/child/year, then TFSA &gt; RRSP to room, then remainder to Margin.</div>
      </div>
    </main>
  );
}
