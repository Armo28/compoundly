'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';

const CAD=(n:number)=> n.toLocaleString(undefined,{style:'currency',currency:'CAD',maximumFractionDigits:0});
const monthsLeftThisYear=()=> Math.max(1, 12 - new Date().getMonth());

type Account={ id:string; type:string; balance?:number|null };
type Rooms={ tfsa:number; rrsp:number; year:number };
type Progress={ tfsa_deposited?:number; rrsp_deposited?:number; resp_deposited?:number; year:number };
type RespProgress={
  total_value:number;
  lifetime_contrib:number;
  contributed_this_year:number;
  is_family_resp:boolean;
  children_covered:number;
  catchup_years_per_child:number;
};

export default function GoalsPage(){
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  const headers = useMemo(()=>{
    const h = new Headers();
    if (token) h.set('authorization', `Bearer ${token}`);
    return h as HeadersInit;
  },[token]);

  const [pledge,setPledge]=useState<number>(()=> {
    const v = typeof window!=='undefined' ? window.localStorage.getItem('goals.pledge') : null;
    return v? Number(v) : 1000;
  });
  useEffect(()=>{ try{ window.localStorage.setItem('goals.pledge', String(pledge)); }catch{} },[pledge]);

  const [accounts,setAccounts]=useState<Account[]>([]);
  const [rooms,setRooms]=useState<Rooms|null>(null);
  const [progress,setProgress]=useState<Progress|null>(null);
  const [resp,setResp]=useState<RespProgress|null>(null);

  // mic
  const [isMicOn,setIsMicOn]=useState(false);
  const [text,setText]=useState('');
  const [notes,setNotes]=useState<Array<{id:string;ts:string;text:string}>>(()=> {
    try{ const v=localStorage.getItem('goals.notes'); return v? JSON.parse(v):[]; }catch{return [];}
  });
  useEffect(()=>{ try{ localStorage.setItem('goals.notes', JSON.stringify(notes)); }catch{} },[notes]);
  const recRef=useRef<any>(null), interimRef=useRef(''), lastFinalRef=useRef('');

  const monthsLeft = monthsLeftThisYear();

  useEffect(()=>{ if(!token) return; (async()=>{
    try{
      const a=await fetch('/api/accounts',{headers}); const aj=await a.json(); setAccounts(Array.isArray(aj?.items)?aj.items:[]);
    }catch{}
    try{
      const r=await fetch('/api/rooms',{headers}); const rj=await r.json(); const room=rj?.room;
      if(room) setRooms({year:room.year, tfsa:Number(room.tfsa||0), rrsp:Number(room.rrsp||0)});
    }catch{}
    try{
      const p=await fetch('/api/rooms/progress',{headers}); const pj=await p.json();
      setProgress({ year:new Date().getFullYear(), tfsa_deposited:Number(pj?.tfsa_deposited||0), rrsp_deposited:Number(pj?.rrsp_deposited||0), resp_deposited:Number(pj?.resp_deposited||0) });
    }catch{}
    try{
      const rp=await fetch('/api/resp-progress',{headers}); const rpj=await rp.json();
      const d:Partial<RespProgress>=rpj?.data??{};
      setResp({
        total_value:Number(d.total_value||0),
        lifetime_contrib:Number(d.lifetime_contrib||0),
        contributed_this_year:Number(d.contributed_this_year||0),
        is_family_resp: !!d.is_family_resp,
        children_covered: Math.max(1, Number(d.children_covered||1)),
        catchup_years_per_child: Math.max(0, Number(d.catchup_years_per_child||0)),
      });
    }catch{}
  })(); },[token,headers]);

  const hasRespAccount = useMemo(()=> accounts.some(a=> String(a.type).toUpperCase()==='RESP'),[accounts]);

  // remaining
  const remaining = useMemo(()=>{
    const tfsaRoom = Number(rooms?.tfsa||0);
    const rrspRoom = Number(rooms?.rrsp||0);
    const tfsaDep  = Number(progress?.tfsa_deposited||0);
    const rrspDep  = Number(progress?.rrsp_deposited||0);
    return {
      tfsa: Math.max(0, tfsaRoom - tfsaDep),
      rrsp: Math.max(0, rrspRoom - rrspDep),
    };
  },[rooms,progress]);

  // CESG-first allocation
  function calcRespGrantableMonthly(resp:RespProgress|null, monthsLeft:number){
    if (!resp) return 0;
    const children = Math.max(1, resp.is_family_resp ? resp.children_covered : 1);
    const PER_CHILD_LIFETIME_CONTRIB_CAP = 50000;
    const PER_CHILD_BASE_GRANTABLE_PER_YEAR = 2500;
    const PER_CHILD_MAX_GRANTABLE_PER_YEAR_WITH_CATCHUP = 5000; // grants max $1,000
    const lifetimeRemainingPerChild = Math.max(0, PER_CHILD_LIFETIME_CONTRIB_CAP - (resp.lifetime_contrib / children));
    const grantableThisYearPerChild = Math.min(
      PER_CHILD_MAX_GRANTABLE_PER_YEAR_WITH_CATCHUP,
      PER_CHILD_BASE_GRANTABLE_PER_YEAR * (1 + Math.max(0, resp.catchup_years_per_child))
    );
    const contributedPerChildThisYear = resp.contributed_this_year / children;
    const remainingGrantablePerChildThisYear = Math.max(0, Math.min(
      grantableThisYearPerChild - contributedPerChildThisYear,
      lifetimeRemainingPerChild
    ));
    const totalRemainingGrantableThisYear = remainingGrantablePerChildThisYear * children;
    return Math.ceil(totalRemainingGrantableThisYear / monthsLeft); // monthly cap to max grant
  }

  const split = useMemo(()=>{
    let left = pledge;
    const out = { resp:0, tfsa:0, rrsp:0, margin:0 };

    // RESP grantable monthly cap (only if account exists)
    const respGrantMonthly = hasRespAccount ? calcRespGrantableMonthly(resp, monthsLeft) : 0;

    // RESP (grantable)
    if (respGrantMonthly>0 && left>0){
      const amt = Math.min(left, respGrantMonthly);
      out.resp = amt; left -= amt;
    }

    // TFSA
    if (remaining.tfsa>0 && left>0){
      const cap = Math.ceil(remaining.tfsa / monthsLeft);
      const amt = Math.min(left, cap);
      out.tfsa = amt; left -= amt;
    }

    // RRSP
    if (remaining.rrsp>0 && left>0){
      const cap = Math.ceil(remaining.rrsp / monthsLeft);
      const amt = Math.min(left, cap);
      out.rrsp = amt; left -= amt;
    }

    // RESP (non-grantable, towards lifetime cap) – optional: we can nudge here later.
    // For now, we leave remainder to margin unless you want to push RESP again.
    if (left>0) out.margin = left;

    return out;
  },[pledge, monthsLeft, remaining, hasRespAccount, resp]);

  // mic
  const toggleMic = ()=>{
    if (isMicOn){ try{recRef.current?.stop();}catch{} recRef.current=null; setIsMicOn(false); return; }
    const SR=(window as any).webkitSpeechRecognition||(window as any).SpeechRecognition;
    if(!SR){ alert('Speech recognition not supported.'); return; }
    const rec=new SR(); rec.lang='en-US'; rec.continuous=true; rec.interimResults=true;
    rec.onresult=(ev:any)=>{
      let finalChunk='', interimChunk='';
      for(let i=ev.resultIndex; i<ev.results.length; i++){
        const res=ev.results[i]; const t=res[0]?.transcript??'';
        if(res.isFinal) finalChunk += t; else interimChunk += t;
      }
      if(finalChunk && finalChunk!==lastFinalRef.current){
        lastFinalRef.current=finalChunk;
        setText(p=>(p+' '+finalChunk).trim()); interimRef.current='';
      }
      if(interimChunk && interimChunk!==interimRef.current){
        interimRef.current=interimChunk;
        setText(p=>(p+' '+interimChunk).trim());
      }
    };
    rec.onend=()=>setIsMicOn(false);
    rec.onerror=()=>setIsMicOn(false);
    recRef.current=rec; rec.start(); setIsMicOn(true);
  };
  const saveNote=()=>{
    const t=text.trim(); if(!t) return;
    const note={ id:'id-'+Math.random().toString(36).slice(2), ts:new Date().toISOString(), text:t };
    setNotes(a=>[note,...a]); setText(''); interimRef.current=''; lastFinalRef.current='';
  };

  if (!session){
    return <main className="max-w-6xl mx-auto p-4"><div className="rounded-xl border bg-white p-6">Sign in to view goals.</div></main>;
  }

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      {/* Pledge */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">Monthly pledge</div>
        <div className="flex items-center gap-4">
          <div className="min-w-[120px] text-sm text-gray-700">{CAD(pledge)}</div>
          <input className="flex-1 h-2 rounded-lg bg-gray-200 appearance-none accent-indigo-600" type="range" min={0} max={20000} step={25} value={pledge} onChange={e=>setPledge(Math.max(0,Math.round(+e.target.value)))}/>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Recommendation is specific to {new Date().toLocaleString(undefined,{month:'long',year:'numeric'})} ({monthsLeft} {monthsLeft===1?'month':'months'} left this year).
        </div>
      </section>

      {/* Recommendation tiles */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {hasRespAccount && (
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-600 mb-1">RESP</div>
              <div className="text-2xl font-semibold">{CAD(split.resp)}</div>
              {resp && (
                <div className="text-[11px] text-gray-500 mt-1">
                  Lifetime left: {CAD(Math.max(0, (resp.is_family_resp? resp.children_covered:1)*50000 - resp.lifetime_contrib))}<br/>
                  Grantable this year (remaining): {CAD(calcRespGrantableMonthly(resp, monthsLeft)*monthsLeft)}
                </div>
              )}
            </div>
          )}
          <div className="rounded-xl border p-4">
            <div className="text-xs text-gray-600 mb-1">TFSA</div>
            <div className="text-2xl font-semibold">{CAD(split.tfsa)}</div>
            <div className="text-[11px] text-gray-500 mt-1">Remaining this year: {CAD(remaining.tfsa)}</div>
          </div>
          <div className="rounded-xl border p-4">
            <div className="text-xs text-gray-600 mb-1">RRSP</div>
            <div className="text-2xl font-semibold">{CAD(split.rrsp)}</div>
            <div className="text-[11px] text-gray-500 mt-1">Remaining this year: {CAD(remaining.rrsp)}</div>
          </div>
          <div className="rounded-xl border p-4">
            <div className="text-xs text-gray-600 mb-1">Margin/Other</div>
            <div className="text-2xl font-semibold">{CAD(split.margin)}</div>
          </div>
        </div>
      </section>

      {/* Mic + Notes */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">Describe your goals</div>
        <div className="flex items-center gap-2 mb-3">
          <button onClick={toggleMic} className={`rounded p-2 ${isMicOn?'bg-red-600':'bg-emerald-600'} text-white`} aria-label={isMicOn?'Stop mic':'Start mic'}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M19 11a7 7 0 0 1-14 0M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button onClick={saveNote} className="rounded bg-indigo-600 px-3 py-2 text-white">Save note</button>
        </div>
        <textarea value={text} onChange={e=>setText(e.target.value)} className="w-full min-h-[140px] rounded-lg border p-3 outline-none" placeholder="Speak or type your plan..." />
        <div className="mt-2 text-xs text-gray-500">Your microphone text appears live while you speak. Click “Save note” to keep a record below. (Notes are stored in your browser.)</div>
      </section>

      {/* Past notes */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">Past Goals</div>
        {notes.length===0 ? <div className="text-sm text-gray-600">No saved goals yet.</div> : (
          <ul className="space-y-2">
            {notes.map(n=>(
              <li key={n.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">
                    {new Date(n.ts).toLocaleString(undefined,{year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'})}
                  </div>
                  <button onClick={()=>setNotes(a=>a.filter(x=>x.id!==n.id))} className="text-xs text-red-600 hover:underline">Delete</button>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-gray-600">Show note</summary>
                  <div className="mt-2 whitespace-pre-wrap text-sm">{n.text}</div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
