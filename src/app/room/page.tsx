'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';

const CAD=(n:number)=>n.toLocaleString(undefined,{style:'currency',currency:'CAD',maximumFractionDigits:0});

function DonutPct({ pct, color, label }:{ pct:number; color:string; label:string }) {
  const p=Math.max(0,Math.min(100,Math.round(pct)));
  const size=120,cx=size/2,cy=size/2,rO=44,rI=32;
  const sweep=(p/100)*2*Math.PI;
  const a0=-Math.PI/2, a1=a0+sweep;
  const sox=cx+Math.cos(a0)*rO, soy=cy+Math.sin(a0)*rO;
  const eox=cx+Math.cos(a1)*rO, eoy=cy+Math.sin(a1)*rO;
  const six=cx+Math.cos(a1)*rI, siy=cy+Math.sin(a1)*rI;
  const esx=cx+Math.cos(a0)*rI, esy=cy+Math.sin(a0)*rI;
  const large=sweep>Math.PI?1:0;
  const dBG=`M ${cx+rO} ${cy} A ${rO} ${rO} 0 1 1 ${cx-rO} ${cy} A ${rO} ${rO} 0 1 1 ${cx+rO} ${cy}
             L ${cx+rI} ${cy} A ${rI} ${rI} 0 1 0 ${cx-rI} ${cy} A ${rI} ${rI} 0 1 0 ${cx+rI} ${cy} Z`;
  const dFG=`M ${sox} ${soy} A ${rO} ${rO} 0 ${large} 1 ${eox} ${eoy} L ${six} ${siy} A ${rI} ${rI} 0 ${large} 0 ${esx} ${esy} Z`;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-32 h-28">
      <path d={dBG} fill="#eef2ff"/>
      <path d={dFG} fill={color}/>
      <circle cx={cx} cy={cy} r={rI-1} fill="#fff"/>
      <text x={cx} y={cy-2} textAnchor="middle" fontSize="14" className="font-semibold">{p}%</text>
      <text x={cx} y={cy+14} textAnchor="middle" fontSize="10" fill="#6b7280">{label}</text>
    </svg>
  );
}

export default function Room() {
  const { session, loading } = useAuth();
  const token = session?.access_token ?? '';
  const year = new Date().getFullYear();

  const [tfsa,setTfsa]=useState<string>(''); // allow empty
  const [rrsp,setRrsp]=useState<string>('');
  const [tfsaDep,setTfsaDep]=useState<string>(''); 
  const [rrspDep,setRrspDep]=useState<string>('');
  const [msg,setMsg]=useState('');

  useEffect(()=>{
    if(!token) return;
    (async()=>{
      const r=await fetch(`/api/room?year=${year}`,{headers:{authorization:`Bearer ${token}`}});
      const j=await r.json();
      if(!j?.ok) return;
      setTfsa(String(j.room?.tfsa ?? ''));
      setRrsp(String(j.room?.rrsp ?? ''));
      setTfsaDep(String(j.progress?.tfsa_deposited ?? ''));
      setRrspDep(String(j.progress?.rrsp_deposited ?? ''));
    })();
  },[token,year]);

  async function saveRoom(){
    const r=await fetch('/api/room',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({year,tfsa:Number(tfsa||0),rrsp:Number(rrsp||0)})});
    const j=await r.json(); setMsg(j?.ok?'Saved.':(j?.error||'Error'));
  }
  async function saveProgress(){
    const r=await fetch('/api/room/progress',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({year,tfsa_deposited:Number(tfsaDep||0),rrsp_deposited:Number(rrspDep||0)})});
    const j=await r.json(); setMsg(j?.ok?'Saved.':(j?.error||'Error'));
  }

  async function onUpload(file:File){
    const fd=new FormData(); fd.append('file',file); fd.append('year',String(year));
    const r=await fetch('/api/room/upload',{method:'POST',headers:{authorization:`Bearer ${token}`},body:fd});
    const j=await r.json();
    if(!j?.ok) { setMsg(j?.error||'Could not read this PDF.'); return; }
    if (j.tfsa) setTfsa(String(j.tfsa));
    if (j.rrsp) setRrsp(String(j.rrsp));
    setMsg(`Parsed ${year} Notice: TFSA ${CAD(j.tfsa||0)}, RRSP ${CAD(j.rrsp||0)}.`);
  }

  const pctTFSA = useMemo(()=> {
    const room=Number(tfsa||0), dep=Number(tfsaDep||0);
    return room>0 ? Math.min(100, Math.round((dep/room)*100)) : 0;
  },[tfsa,tfsaDep]);
  const pctRRSP = useMemo(()=> {
    const room=Number(rrsp||0), dep=Number(rrspDep||0);
    return room>0 ? Math.min(100, Math.round((dep/room)*100)) : 0;
  },[rrsp,rrspDep]);

  if (loading) return <main className="max-w-4xl mx-auto p-4"><div className="border rounded-xl bg-white p-4">Loading…</div></main>;
  if (!session) return <main className="max-w-4xl mx-auto p-4"><div className="border rounded-xl bg-white p-4">Sign in first.</div></main>;

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="rounded-xl border bg-white p-4">
        <div className="text-sm font-medium mb-3">Contribution Room — {year}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-gray-600">TFSA room</span>
            <input value={tfsa} onChange={e=>setTfsa(e.target.value)} inputMode="decimal" className="mt-1 w-full border rounded-lg px-3 py-2" placeholder="e.g. 6500"/>
          </label>
          <label className="block">
            <span className="text-sm text-gray-600">RRSP room</span>
            <input value={rrsp} onChange={e=>setRrsp(e.target.value)} inputMode="decimal" className="mt-1 w-full border rounded-lg px-3 py-2" placeholder="e.g. 18000"/>
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={saveRoom} className="rounded-lg bg-blue-600 text-white px-4 py-2">Save</button>
          <label className="text-sm border rounded-lg px-3 py-2 cursor-pointer">
            Upload CRA Notice (PDF)
            <input type="file" accept="application/pdf" className="hidden" onChange={e=>{const f=e.target.files?.[0]; if(f) onUpload(f);}}/>
          </label>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="text-sm font-medium mb-3">Deposited so far — {year}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-gray-600">TFSA deposited</span>
            <input value={tfsaDep} onChange={e=>setTfsaDep(e.target.value)} inputMode="decimal" className="mt-1 w-full border rounded-lg px-3 py-2" placeholder="e.g. 2200"/>
          </label>
          <label className="block">
            <span className="text-sm text-gray-600">RRSP deposited</span>
            <input value={rrspDep} onChange={e=>setRrspDep(e.target.value)} inputMode="decimal" className="mt-1 w-full border rounded-lg px-3 py-2" placeholder="e.g. 7400"/>
          </label>
        </div>
        <div className="mt-3">
          <button onClick={saveProgress} className="rounded-lg bg-blue-600 text-white px-4 py-2">Save</button>
        </div>

        <div className="mt-4 flex gap-6">
          <DonutPct pct={pctTFSA} color="#34d399" label="TFSA filled"/>
          <DonutPct pct={pctRRSP} color="#60a5fa" label="RRSP filled"/>
        </div>
      </div>

      {msg && <div className="text-sm">{msg}</div>}
    </main>
  );
}
