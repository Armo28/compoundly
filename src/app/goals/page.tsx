'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';

const CAD = (n:number)=>n.toLocaleString(undefined,{style:'currency',currency:'CAD',maximumFractionDigits:0});
const monthsLeftThisYear = ()=> Math.max(1, 12 - new Date().getMonth());

type Account = {
  id: string;
  type: string;
  name?: string;
  institution?: string;
  balance?: number;
  is_family_resp?: boolean;
  children_covered?: number;
  resp_lifetime_contributed?: number;
};

type RespYearRow = {
  year: number;
  contributed_ytd: number;
  grant_eligible_contrib_lifetime: number | null;
  carry_forward_grantable_per_child: number | null;
};

type Rooms = { year:number; tfsa:number; rrsp:number };
type RoomsProgress = { year:number; tfsa_deposited?:number; rrsp_deposited?:number };

function loadLS<T>(k:string, fb:T):T{
  if(typeof window==='undefined') return fb;
  try{ const v=localStorage.getItem(k); return v? JSON.parse(v) as T : fb; }catch{return fb;}
}
function saveLS<T>(k:string,v:T){
  try{ if(typeof window!=='undefined') localStorage.setItem(k, JSON.stringify(v)); }catch{}
}

export default function GoalsPage(){
  const { session } = useAuth();
  const token = session?.access_token ?? '';
  const headers = token ? { authorization: `Bearer ${token}` } : undefined;

  const [pledge, setPledge] = useState<number>(()=>loadLS('goals.pledge', 1000));
  useEffect(()=>saveLS('goals.pledge', pledge), [pledge]);

  const [rooms, setRooms] = useState<Rooms|null>(null);
  const [progress, setProgress] = useState<RoomsProgress|null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [respYear, setRespYear] = useState<RespYearRow|null>(null);

  // mic + notes
  const [isMicOn, setIsMicOn] = useState(false);
  const [text, setText] = useState('');
  const [notes, setNotes] = useState<Array<{id:string, ts:string, text:string}>>(()=>loadLS('goals.notes', []));
  useEffect(()=>saveLS('goals.notes', notes), [notes]);

  // fetch
  useEffect(()=>{
    if(!headers) return;
    (async()=>{
      // rooms
      const r = await fetch('/api/rooms', { headers });
      const rj = await r.json();
      const roomObj = rj?.room ?? rj ?? null;
      if (roomObj) setRooms({ year: Number(roomObj.year ?? new Date().getFullYear()), tfsa: Number(roomObj.tfsa ?? 0), rrsp: Number(roomObj.rrsp ?? 0) });

      // progress TFSA/RRSP
      const p = await fetch('/api/rooms/progress', { headers });
      const pj = await p.json();
      if (pj) setProgress({ year: Number(pj.year ?? new Date().getFullYear()), tfsa_deposited: Number(pj.tfsa_deposited ?? 0), rrsp_deposited: Number(pj.rrsp_deposited ?? 0) });

      // accounts
      const a = await fetch('/api/accounts', { headers });
      const aj = await a.json();
      setAccounts(aj?.items ?? []);

      // resp year
      const yr = new Date().getFullYear();
      const y = await fetch(`/api/resp-progress?year=${yr}`, { headers });
      const yj = await y.json();
      setRespYear({
        year: Number(yj?.year ?? yr),
        contributed_ytd: Number(yj?.contributed_ytd ?? 0),
        grant_eligible_contrib_lifetime: yj?.grant_eligible_contrib_lifetime == null ? null : Number(yj.grant_eligible_contrib_lifetime),
        carry_forward_grantable_per_child: yj?.carry_forward_grantable_per_child == null ? null : Number(yj.carry_forward_grantable_per_child),
      });
    })();
  },[headers]);

  // RESP account (if any)
  const respAcc = useMemo(()=> accounts.find(a=>String(a.type).toUpperCase()==='RESP') ?? null, [accounts]);

  // Remaining TFSA/RRSP this year
  const tfsaRemaining = Math.max(0, Number(rooms?.tfsa ?? 0) - Number(progress?.tfsa_deposited ?? 0));
  const rrspRemaining = Math.max(0, Number(rooms?.rrsp ?? 0) - Number(progress?.rrsp_deposited ?? 0));

  // RESP math
  const monthsLeft = monthsLeftThisYear();
  const isFamily = Boolean(respAcc?.is_family_resp);
  const children = Math.max(1, Number(respAcc?.children_covered ?? 1));
  const lifetimeContrib = Math.max(0, Number(respAcc?.resp_lifetime_contributed ?? 0));

  // Lifetime caps
  const lifetimeCap = children * 50000;   // contributions
  const lifetimeRoomRemaining = Math.max(0, lifetimeCap - lifetimeContrib);

  // Grant lifetime cap: 36k per child
  const grantLifetimeCap = children * 36000;
  const grantEligibleLifetimeUsed = (() => {
    const precise = respYear?.grant_eligible_contrib_lifetime;
    if (precise != null) return Math.max(0, Math.min(grantLifetimeCap, precise));
    return Math.max(0, Math.min(grantLifetimeCap, lifetimeContrib)); // fallback
  })();
  const grantEligibleLifetimeRemaining = Math.max(0, grantLifetimeCap - grantEligibleLifetimeUsed);

  // This-year CESG cap: 2500 per child + up to one extra 2500 per child if carry-forward (manual override)
  const carryOverride = Math.max(0, Math.min(2500, Number(respYear?.carry_forward_grantable_per_child ?? 0)));
  const perChildGrantableThisYear = 2500 + carryOverride;
  const thisYearGrantCap = children * perChildGrantableThisYear;

  const respYTD = Math.max(0, Number(respYear?.contributed_ytd ?? 0));
  const thisYearGrantRemaining = Math.max(0, thisYearGrantCap - respYTD);

  // Final CESG-first target for this year (also bounded by remaining lifetime grant path)
  const respGrantTargetThisYear = Math.min(thisYearGrantRemaining, grantEligibleLifetimeRemaining);
  const respGrantTargetPerMonth = Math.ceil(respGrantTargetThisYear / monthsLeft);

  // Allocation engine (priority: RESP grant → TFSA → RRSP → RESP to lifetime → Margin)
  const allocation = useMemo(()=>{
    let left = pledge;
    const out = { resp: 0, tfsa: 0, rrsp: 0, margin: 0 };

    // 1) RESP grant-first
    if (left > 0 && respAcc) {
      const amt = Math.min(left, Math.max(0, respGrantTargetPerMonth));
      out.resp += amt;
      left -= amt;
    }

    // 2) TFSA
    if (left > 0 && tfsaRemaining > 0) {
      const cap = Math.ceil(tfsaRemaining / monthsLeft);
      const amt = Math.min(left, cap);
      out.tfsa += amt;
      left -= amt;
    }

    // 3) RRSP
    if (left > 0 && rrspRemaining > 0) {
      const cap = Math.ceil(rrspRemaining / monthsLeft);
      const amt = Math.min(left, cap);
      out.rrsp += amt;
      left -= amt;
    }

    // 4) RESP toward lifetime (beyond grant)
    if (left > 0 && respAcc && lifetimeRoomRemaining > 0) {
      const cap = Math.ceil(lifetimeRoomRemaining / monthsLeft);
      const amt = Math.min(left, cap);
      out.resp += amt;
      left -= amt;
    }

    // 5) Margin
    if (left > 0) out.margin = left;

    return out;
  }, [pledge, respAcc, respGrantTargetPerMonth, tfsaRemaining, rrspRemaining, lifetimeRoomRemaining, monthsLeft]);

  // Show RESP tile only if there is RESP account
  const showRESP = Boolean(respAcc);

  // mic
  const recRef = useRef<any>(null);
  const interimRef = useRef('');
  const lastFinalRef = useRef('');
  const [interim, setInterim] = useState('');

  const toggleMic = ()=>{
    if (isMicOn) {
      try{recRef.current?.stop();}catch{}
      recRef.current=null;
      setIsMicOn(false);
      return;
    }
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if(!SR){ alert('Speech recognition not supported.'); return; }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (ev:any)=>{
      let finalChunk='', interimChunk='';
      for(let i=ev.resultIndex;i<ev.results.length;i++){
        const res = ev.results[i];
        const t = res[0]?.transcript ?? '';
        if(res.isFinal) finalChunk += t;
        else interimChunk += t;
      }
      if (finalChunk && finalChunk!==lastFinalRef.current){
        lastFinalRef.current = finalChunk;
        setText(p=>(p+' '+finalChunk).trim());
        interimRef.current='';
        setInterim('');
      }
      if (interimChunk && interimChunk!==interimRef.current){
        interimRef.current = interimChunk;
        setInterim(interimChunk);
      }
    };
    rec.onend = ()=>setIsMicOn(false);
    rec.onerror = ()=>setIsMicOn(false);
    recRef.current = rec;
    rec.start();
    setIsMicOn(true);
  };

  const saveNote = ()=>{
    const t = (text + (interim? ' '+interim : '')).trim();
    if(!t) return;
    const id = 'n-'+Math.random().toString(36).slice(2);
    setNotes(arr=>[{id, ts:new Date().toISOString(), text:t}, ...arr]);
    setText(''); setInterim(''); interimRef.current=''; lastFinalRef.current='';
  };
  const deleteNote = (id:string)=> setNotes(arr=>arr.filter(n=>n.id!==id));

  const displayText = (text + (interim? ' '+interim : '')).trim();

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      {/* Monthly pledge */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">Monthly pledge</div>
        <div className="flex items-center gap-4">
          <div className="min-w-[120px] text-sm text-gray-700">{CAD(pledge)}</div>
          <input type="range" className="flex-1 h-2 rounded-lg bg-gray-200 appearance-none accent-indigo-600"
            min={0} max={10000} step={25} value={pledge}
            onChange={e=>setPledge(Math.max(0, Math.round(+e.target.value)))} />
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Recommendation is specific to {new Date().toLocaleString(undefined,{month:'long', year:'numeric'})}
          {' '}({monthsLeft} {monthsLeft===1?'month':'months'} left this year).
        </div>
      </section>

      {/* Recommendation tiles */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {showRESP && (
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-600 mb-1">RESP</div>
              <div className="text-2xl font-semibold">{CAD(allocation.resp)}</div>
              <div className="text-[11px] text-gray-500 mt-1">
                Grant path remaining (this year): {CAD(Math.max(0, Math.min(respGrantTargetThisYear, thisYearGrantCap)))}
              </div>
            </div>
          )}
          <div className="rounded-xl border p-4">
            <div className="text-xs text-gray-600 mb-1">TFSA</div>
            <div className="text-2xl font-semibold">{CAD(allocation.tfsa)}</div>
            <div className="text-[11px] text-gray-500 mt-1">Remaining this year: {CAD(tfsaRemaining)}</div>
          </div>
          <div className="rounded-xl border p-4">
            <div className="text-xs text-gray-600 mb-1">RRSP</div>
            <div className="text-2xl font-semibold">{CAD(allocation.rrsp)}</div>
            <div className="text-[11px] text-gray-500 mt-1">Remaining this year: {CAD(rrspRemaining)}</div>
          </div>
          <div className="rounded-xl border p-4">
            <div className="text-xs text-gray-600 mb-1">Margin/Other</div>
            <div className="text-2xl font-semibold">{CAD(allocation.margin)}</div>
          </div>
        </div>
      </section>

      {/* Mic + Notes */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">Describe your goals</div>
        <div className="flex items-center gap-2 mb-3">
          <button onClick={toggleMic}
            className={`rounded p-2 ${isMicOn? 'bg-red-600':'bg-emerald-600'} text-white`}>
            {/* mic icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M19 11a7 7 0 0 1-14 0M12 18v3"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button onClick={saveNote} className="rounded bg-indigo-600 px-3 py-2 text-white">Save note</button>
        </div>
        <textarea value={displayText} onChange={e=>setText(e.target.value)}
          className="w-full min-h-[140px] rounded-lg border p-3 outline-none"
          placeholder="Speak or type your plan..." />
        <div className="mt-2 text-xs text-gray-500">
          Your microphone text appears live while you speak. Click “Save note” to keep a record below. (Notes are stored in your browser for now.)
        </div>
      </section>

      {/* Past notes */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">Past Goals</div>
        {notes.length===0? (
          <div className="text-sm text-gray-600">No saved goals yet.</div>
        ):(
          <ul className="space-y-2">
            {notes.map(n=>(
              <li key={n.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">
                    {new Date(n.ts).toLocaleString(undefined,{year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'})}
                  </div>
                  <button onClick={()=>deleteNote(n.id)} className="text-xs text-red-600 hover:underline">Delete</button>
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
