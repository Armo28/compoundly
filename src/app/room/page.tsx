'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';

type Rooms = { year:number; tfsa:number; rrsp:number };
type RespProgress = {
  total_value:number;
  lifetime_contrib:number;
  contributed_this_year:number;
  is_family_resp:boolean;
  children_covered:number;
  catchup_years_per_child:number;
};

type Account = { id:string; type:string; balance?:number|null };

export default function RoomPage(){
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  const headers = useMemo(()=>{
    const h = new Headers();
    if (token) h.set('authorization', `Bearer ${token}`);
    return h as HeadersInit;
  },[token]);

  const jsonHeaders = useMemo(()=>{
    const h = new Headers();
    if (token) h.set('authorization', `Bearer ${token}`);
    h.set('content-type','application/json');
    return h as HeadersInit;
  },[token]);

  // TFSA/RRSP string-backed
  const [tfsaStr,setTfsaStr]=useState('');
  const [rrspStr,setRrspStr]=useState('');
  const [roomsSaved,setRoomsSaved]=useState({tfsaStr:'', rrspStr:''});
  const [roomsSaving,setRoomsSaving]=useState(false);

  // RESP section visible only if the user has a RESP account
  const [hasRespAccount,setHasRespAccount]=useState(false);

  // RESP string-backed form
  const [resp,setResp]=useState({
    total:'', life:'', year:'', family:false, kids:'', catchup:''
  });
  const [respSaved,setRespSaved]=useState(resp);
  const [respSaving,setRespSaving]=useState(false);

  const dirtyRooms = tfsaStr!==roomsSaved.tfsaStr || rrspStr!==roomsSaved.rrspStr;
  const dirtyResp =
    hasRespAccount && (
      resp.total!==respSaved.total ||
      resp.life !==respSaved.life ||
      resp.year !==respSaved.year ||
      resp.family!==respSaved.family ||
      resp.kids !==respSaved.kids ||
      resp.catchup!==respSaved.catchup
    );

  const toNum = (s:string)=> {
    const n = Number((s??'').replace(/,/g,'').trim());
    return Number.isFinite(n)?n:0;
  };
  const fromServer = (n:number|undefined|null)=> n && n!==0 ? String(n) : '';

  // initial load
  useEffect(()=>{ if(!token) return; (async()=>{
    // accounts (to decide RESP visibility & prefill)
    try{
      const r = await fetch('/api/accounts', { headers });
      const j = await r.json();
      const items:Account[] = Array.isArray(j?.items)? j.items : [];
      const respAccounts = items.filter(a=> String(a.type).toUpperCase()==='RESP');
      setHasRespAccount(respAccounts.length>0);

      // rooms
      const r2 = await fetch('/api/rooms', { headers });
      const j2 = await r2.json();
      const room:Rooms|undefined = j2?.room;
      if(room){
        const tfsa = fromServer(room.tfsa);
        const rrsp = fromServer(room.rrsp);
        setTfsaStr(tfsa); setRrspStr(rrsp);
        setRoomsSaved({tfsaStr:tfsa, rrspStr:rrsp});
      }

      // resp progress (only if RESP exists)
      if (respAccounts.length>0){
        const r3 = await fetch('/api/resp-progress', { headers });
        const j3 = await r3.json();
        const d:Partial<RespProgress> = j3?.data ?? {};
        // prefill total from accounts sum if blank/zero
        const sumResp = respAccounts.reduce((s,a)=> s + (Number(a.balance||0)), 0);
        const total = fromServer((d.total_value ?? 0) || sumResp);
        const life  = fromServer(d.lifetime_contrib ?? 0);
        const year  = fromServer(d.contributed_this_year ?? 0);
        const family = !!d.is_family_resp;
        const kids  = fromServer(d.children_covered ?? (family?2:1));
        const catchup = fromServer(d.catchup_years_per_child ?? 0);

        const next = { total, life, year, family, kids, catchup };
        setResp(next);
        setRespSaved(next);
      }
    }catch{}
  })(); },[token,headers]);

  const saveRooms = async ()=>{
    if(!dirtyRooms || roomsSaving) return;
    setRoomsSaving(true);
    try{
      const payload = { tfsa:toNum(tfsaStr), rrsp:toNum(rrspStr) };
      const r = await fetch('/api/rooms', { method:'POST', headers:jsonHeaders, body:JSON.stringify(payload) });
      const j = await r.json(); if(!j?.ok) throw new Error(j?.error ?? 'Save failed');
      setRoomsSaved({ tfsaStr:String(payload.tfsa), rrspStr:String(payload.rrsp) });
    }catch(e:any){ alert(e?.message || 'Save failed'); }
    finally{ setRoomsSaving(false); }
  };

  const saveResp = async ()=>{
    if(!hasRespAccount || !dirtyResp || respSaving) return;
    setRespSaving(true);
    try{
      const payload = {
        total_value: toNum(resp.total),
        lifetime_contrib: toNum(resp.life),
        contributed_this_year: toNum(resp.year),
        is_family_resp: !!resp.family,
        children_covered: resp.family ? Math.max(1, Number(resp.kids||'1')) : 1,
        catchup_years_per_child: Math.max(0, Number(resp.catchup||'0')),
      };
      const r = await fetch('/api/resp-progress', { method:'POST', headers:jsonHeaders, body:JSON.stringify(payload) });
      const j = await r.json(); if(!j?.ok) throw new Error(j?.error ?? 'Save failed');
      const saved = {
        total:String(payload.total_value),
        life:String(payload.lifetime_contrib),
        year:String(payload.contributed_this_year),
        family:!!payload.is_family_resp,
        kids:String(payload.children_covered),
        catchup:String(payload.catchup_years_per_child),
      };
      setRespSaved(saved);
    }catch(e:any){ alert(e?.message || 'Save failed'); }
    finally{ setRespSaving(false); }
  };

  if (!session){
    return <main className="max-w-6xl mx-auto p-4"><div className="rounded-xl border bg-white p-6">Sign in to edit room & RESP progress.</div></main>;
  }

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      {/* TFSA / RRSP */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">TFSA & RRSP Room (this year)</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">TFSA room</label>
            <input className="rounded-md border px-3 py-2" type="text" inputMode="decimal" placeholder="e.g., 6500" value={tfsaStr} onChange={e=>setTfsaStr(e.target.value)} />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">RRSP room</label>
            <input className="rounded-md border px-3 py-2" type="text" inputMode="decimal" placeholder="e.g., 18000" value={rrspStr} onChange={e=>setRrspStr(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button onClick={saveRooms} disabled={!dirtyRooms||roomsSaving} className={(!dirtyRooms||roomsSaving)?'rounded bg-gray-300 px-4 py-2 text-gray-600 cursor-not-allowed':'rounded bg-emerald-600 px-4 py-2 text-white'}>
              {roomsSaving?'Saving…':'Save'}
            </button>
          </div>
        </div>
      </section>

      {/* RESP only if there is a RESP account */}
      {hasRespAccount && (
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm font-medium mb-3">RESP Progress</div>
          <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end">
            <div className="flex flex-col">
              <label className="text-xs text-gray-600">Total current value</label>
              <input className="rounded-md border px-3 py-2" type="text" inputMode="decimal" placeholder="e.g., 20000" value={resp.total} onChange={e=>setResp(s=>({...s,total:e.target.value}))}/>
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-gray-600">Lifetime contributed</label>
              <input className="rounded-md border px-3 py-2" type="text" inputMode="decimal" placeholder="e.g., 12000" value={resp.life} onChange={e=>setResp(s=>({...s,life:e.target.value}))}/>
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-gray-600">Contributed this year</label>
              <input className="rounded-md border px-3 py-2" type="text" inputMode="decimal" placeholder="e.g., 1000" value={resp.year} onChange={e=>setResp(s=>({...s,year:e.target.value}))}/>
            </div>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={resp.family} onChange={e=>setResp(s=>({...s,family:e.target.checked}))}/>
              <span className="text-sm">Family RESP</span>
            </label>
            {resp.family && (
              <div className="flex flex-col">
                <label className="text-xs text-gray-600"># Children covered</label>
                <input className="rounded-md border px-3 py-2" type="text" inputMode="numeric" placeholder="e.g., 2" value={resp.kids} onChange={e=>setResp(s=>({...s,kids:e.target.value}))}/>
              </div>
            )}
            <div className="flex flex-col">
              <label className="text-xs text-gray-600">Catch-up years per child</label>
              <input className="rounded-md border px-3 py-2" type="text" inputMode="numeric" placeholder="e.g., 1" value={resp.catchup} onChange={e=>setResp(s=>({...s,catchup:e.target.value}))}/>
            </div>

            <div className="sm:col-span-6 flex justify-end">
              <button onClick={saveResp} disabled={!dirtyResp||respSaving} className={(!dirtyResp||respSaving)?'rounded bg-gray-300 px-4 py-2 text-gray-600 cursor-not-allowed':'rounded bg-emerald-600 px-4 py-2 text-white'}>
                {respSaving?'Saving…':'Save'}
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
