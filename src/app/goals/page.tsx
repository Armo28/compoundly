'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';

const CAD=(n:number)=>n.toLocaleString(undefined,{style:'currency',currency:'CAD',maximumFractionDigits:0});

type Rooms = { tfsa: number; rrsp: number };
type Child = { id: string; name: string; birth_year: number };

export default function GoalsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';
  const year = new Date().getFullYear();

  const [pledge,setPledge]=useState(1000);
  const [rooms,setRooms]=useState<Rooms>({tfsa:0, rrsp:0});
  const [children,setChildren]=useState<Child[]>([]);
  const [notes,setNotes]=useState<string>('');
  const [history,setHistory]=useState<string[]>(()=>JSON.parse(localStorage.getItem('goal_notes_history')||'[]'));

  useEffect(()=>{
    if (!token) return;
    (async()=>{
      const r1 = await fetch(`/api/rooms?year=${year}`,{headers:{authorization:`Bearer ${token}`}});
      const j1 = await r1.json();
      if (j1?.ok) setRooms({tfsa: Number(j1.room?.tfsa||0), rrsp: Number(j1.room?.rrsp||0)});
      const r2 = await fetch('/api/children',{headers:{authorization:`Bearer ${token}`}});
      const j2 = await r2.json();
      if (j2?.ok) setChildren(j2.children||[]);
    })();
  },[token,year]);

  // simple planner: RESP (if children) up to $2,500/child/year → TFSA room → RRSP room → margin
  const suggestion = useMemo(()=>{
    let remaining = pledge;
    const monthsLeft = 12 - new Date().getMonth();
    const out = { RESP: 0, TFSA: 0, RRSP: 0, Margin: 0 };

    const kids = children.length;
    if (kids>0) {
      const respCapYear = kids * 2500;                    // per calendar year
      const respMonthlyMax = respCapYear / 12;
      const toResp = Math.min(remaining, respMonthlyMax);
      out.RESP = toResp;
      remaining -= toResp;
    }

    const tfsaMonthlyCap = rooms.tfsa / 12;
    const toTfsa = Math.min(remaining, Math.max(0, tfsaMonthlyCap));
    out.TFSA = toTfsa;
    remaining -= toTfsa;

    const rrspMonthlyCap = rooms.rrsp / 12;
    const toRrsp = Math.min(remaining, Math.max(0, rrspMonthlyCap));
    out.RRSP = toRrsp;
    remaining -= toRrsp;

    out.Margin = Math.max(0, remaining);
    return out;
  },[pledge, rooms, children]);

  // voice-to-text (best-effort; works in Chrome/Safari)
  const recRef = useRef<any>(null);
  const [listening,setListening]=useState(false);
  function toggleMic() {
    const SR:any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Voice input not supported on this browser.'); return; }
    if (listening && recRef.current) { recRef.current.stop(); setListening(false); return; }
    const rec = new SR(); rec.lang='en-US'; rec.interimResults=false;
    rec.onresult = (e:any)=>{ const t = e.results[0][0].transcript; setNotes(prev=> (prev? (prev+'\n') : '') + t ); };
    rec.onend = ()=>setListening(false);
    recRef.current = rec; setListening(true); rec.start();
  }

  function commitNote() {
    if (!notes.trim()) return;
    const newHist = [notes.trim(), ...history].slice(0,50);
    setHistory(newHist);
    localStorage.setItem('goal_notes_history', JSON.stringify(newHist));
    setNotes('');
  }

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="rounded-xl border bg-white p-4 space-y-4">
        <div className="text-sm font-medium">Monthly pledge</div>
        <div className="flex items-center gap-3">
          <span className="min-w-[80px] text-right">{CAD(pledge)}</span>
          <input type="range" min={0} max={5000} step={50} value={pledge} onChange={e=>setPledge(+e.target.value)}
                 className="w-full h-2 rounded-lg bg-gray-200 appearance-none accent-blue-600"/>
        </div>

        <div className="rounded-lg border p-3">
          <div className="text-sm font-medium mb-2">Suggested monthly split</div>
          <ul className="text-sm space-y-1">
            <li>RESP: <span className="font-semibold">{CAD(suggestion.RESP)}</span></li>
            <li>TFSA: <span className="font-semibold">{CAD(suggestion.TFSA)}</span></li>
            <li>RRSP: <span className="font-semibold">{CAD(suggestion.RRSP)}</span></li>
            <li>Margin/Other: <span className="font-semibold">{CAD(suggestion.Margin)}</span></li>
          </ul>
          <div className="text-xs text-gray-500 mt-2">
            Priority: RESP (if kids) up to $2,500/child/year → TFSA to room → RRSP to room → Margin.
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 space-y-3">
        <div className="text-sm font-medium">Tell us your goals (text or voice)</div>
        <textarea className="w-full border rounded-lg px-3 py-2 min-h-[90px]" placeholder='e.g., "I have two kids (2 and 4). I want $1M by 60 and to fund their university."' value={notes} onChange={e=>setNotes(e.target.value)}/>
        <div className="flex gap-3">
          <button onClick={commitNote} className="rounded-lg bg-blue-600 text-white px-4 py-2">Save note</button>
          <button onClick={toggleMic} className="rounded-lg border px-4 py-2">{listening?'Stop 🎙️':'Speak 🎤'}</button>
        </div>
        {history.length>0 && (
          <div className="mt-2">
            <div className="text-sm font-medium mb-1">Previous goal notes (local to this browser)</div>
            <ul className="text-sm list-disc pl-5 space-y-1">
              {history.map((h,i)=><li key={i}>{h}</li>)}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
