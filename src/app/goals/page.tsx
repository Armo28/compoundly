'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';

const CAD = (n:number)=>n.toLocaleString(undefined,{style:'currency',currency:'CAD',maximumFractionDigits:0});

// Types for Web Speech
declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

type Rooms = { tfsa:number; rrsp:number };
type Progress = { tfsa_deposited:number; rrsp_deposited:number };
type Summary = { byType: Record<string, number> }; // from /api/summary

export default function GoalsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  // monthly pledge slider
  const [pledge, setPledge] = useState<number>(1500);

  // portfolio context
  const [rooms, setRooms] = useState<Rooms>({ tfsa:0, rrsp:0 });
  const [progress, setProgress] = useState<Progress>({ tfsa_deposited:0, rrsp_deposited:0 });
  const [summary, setSummary] = useState<Summary|null>(null);

  // mic / notes
  const [note, setNote] = useState<string>('');
  const [notes, setNotes] = useState<{id:string,ts:number,text:string}[]>([]);
  const [micOn, setMicOn] = useState(false);
  const recRef = useRef<any>(null);
  const interimRef = useRef<string>('');       // live text shown
  const lastFinalRef = useRef<string>('');     // prevent duplicates

  // load context
  useEffect(()=>{
    if (!token) return;
    (async ()=>{
      const [r1, r2, r3] = await Promise.all([
        fetch('/api/rooms', { headers:{ authorization:`Bearer ${token}` }}).then(r=>r.json()),
        fetch('/api/rooms/progress', { headers:{ authorization:`Bearer ${token}` }}).then(r=>r.json()),
        fetch('/api/summary', { headers:{ authorization:`Bearer ${token}` }}).then(r=>r.json()),
      ]);
      if (r1?.room) setRooms({ tfsa:Number(r1.room.tfsa||0), rrsp:Number(r1.room.rrsp||0) });
      if (r2?.progress) setProgress({
        tfsa_deposited:Number(r2.progress.tfsa_deposited||0),
        rrsp_deposited:Number(r2.progress.rrsp_deposited||0),
      });
      if (r3?.ok) setSummary({ byType: r3.byType || {} });

      // local notes
      if (typeof window !== 'undefined') {
        const raw = window.localStorage.getItem('goalNotes');
        if (raw) {
          try { setNotes(JSON.parse(raw)); } catch {}
        }
      }
    })();
  },[token]);

  // RESP availability: only show if you have RESP account; otherwise, if user mentions “child”, show a nudge link
  const hasRESPAccount = !!summary?.byType?.RESP;

  // suggested split
  const suggested = useMemo(()=>{
    let rest = pledge;
    let toRESP=0, toTFSA=0, toRRSP=0, toMargin=0;

    // RESP first (only if the user actually has RESP account)
    if (hasRESPAccount) {
      // up to $2,500/year total cap
      const cap = 2500;
      const remaining = cap; // We could subtract deposited so far if you track RESP deposits; 0 for now
      const perMonth = Math.ceil(remaining/12);
      const amt = Math.max(0, Math.min(rest, perMonth));
      toRESP += amt; rest -= amt;
    }

    // TFSA next up to available room
    const tfsaLeft = Math.max(0, rooms.tfsa - progress.tfsa_deposited);
    if (tfsaLeft > 0 && rest > 0) {
      const perMonth = Math.ceil(tfsaLeft / 12);
      const amt = Math.min(rest, perMonth);
      toTFSA += amt; rest -= amt;
    }

    // RRSP next
    const rrspLeft = Math.max(0, rooms.rrsp - progress.rrsp_deposited);
    if (rrspLeft > 0 && rest > 0) {
      const perMonth = Math.ceil(rrspLeft / 12);
      const amt = Math.min(rest, perMonth);
      toRRSP += amt; rest -= amt;
    }

    // remainder -> margin
    toMargin = Math.max(0, rest);

    return { toRESP, toTFSA, toRRSP, toMargin };
  }, [pledge, rooms, progress, hasRESPAccount]);

  // mic controls with interim text (prevents duplicates)
  const startMic = ()=>{
    if (typeof window === 'undefined') return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('Speech recognition not supported in this browser.');
      return;
    }
    const rec = new SR();
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;
    rec.lang = 'en-US';

    rec.onresult = (e:any)=>{
      let finalChunk = '';
      let interim = '';
      for (let i=e.resultIndex; i<e.results.length; i++){
        const res = e.results[i];
        const txt = res[0]?.transcript ?? '';
        if (res.isFinal) {
          // avoid duplicate final segments
          if (txt && txt !== lastFinalRef.current) {
            finalChunk += (finalChunk ? ' ' : '') + txt;
            lastFinalRef.current = txt;
          }
        } else {
          interim += (interim ? ' ' : '') + txt;
        }
      }
      if (finalChunk) setNote(prev => (prev ? prev + ' ' : '') + finalChunk);
      interimRef.current = interim;
      // show interim live by forcing a state update via trailing space trick
      setNote(prev => prev); // render
    };

    rec.onerror = ()=>{};
    rec.onend = ()=> setMicOn(false);

    rec.start();
    recRef.current = rec;
    setMicOn(true);
  };

  const stopMic = ()=>{
    recRef.current?.stop?.();
    setMicOn(false);
    interimRef.current = '';
  };

  const onSaveNote = ()=>{
    const text = (note + (interimRef.current ? (' ' + interimRef.current) : '')).trim();
    if (!text) return;
    const item = { id: String(Date.now()), ts: Date.now(), text };
    const next = [item, ...notes];
    setNotes(next);
    setNote('');
    interimRef.current = '';
    lastFinalRef.current = '';
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('goalNotes', JSON.stringify(next));
    }
  };

  const onDeleteNote = (id:string)=>{
    const next = notes.filter(n=>n.id !== id);
    setNotes(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('goalNotes', JSON.stringify(next));
    }
  };

  const showsChildNudge = !hasRESPAccount && /\b(child|children|kid|kids|RESP)\b/i.test(note || notes[0]?.text || '');

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-6">

      {/* Monthly pledge + split */}
      <section className="rounded-2xl border bg-white p-4">
        <div className="text-sm font-medium mb-3">Monthly pledge</div>
        <input type="range" min={0} max={10000} step={50}
               value={pledge} onChange={e=>setPledge(+e.target.value)} className="w-full"/>
        <div className="mt-2 text-sm text-gray-700">{CAD(pledge)}</div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          {hasRESPAccount && (
            <KPI title="RESP" value={CAD(suggested.toRESP)}/>
          )}
          <KPI title="TFSA" value={CAD(suggested.toTFSA)}/>
          <KPI title="RRSP" value={CAD(suggested.toRRSP)}/>
          <KPI title="Margin/Other" value={CAD(suggested.toMargin)}/>
        </div>

        <div className="mt-2 text-xs text-gray-600">
          Priorities: RESP up to $2,500 per child per year → TFSA to available room → RRSP to available room → remainder to Margin/Other.
          {showsChildNudge && (
            <span className="ml-2">
              Mentioned children but no RESP account yet. <a href="/accounts" className="underline">Add RESP</a>
            </span>
          )}
        </div>
      </section>

      {/* Describe your goals (mic) */}
      <section className="rounded-2xl border bg-white p-4">
        <div className="text-sm font-medium mb-3">Describe your goals</div>
        <div className="flex gap-2 mb-2">
          {!micOn ? (
            <button onClick={startMic} className="rounded-lg bg-emerald-600 text-white px-3 py-2">Start mic</button>
          ) : (
            <button onClick={stopMic} className="rounded-lg bg-rose-600 text-white px-3 py-2">Stop</button>
          )}
          <button onClick={onSaveNote} className="rounded-lg border px-3 py-2">Save note</button>
        </div>
        <textarea
          className="w-full min-h-[140px] border rounded-lg px-3 py-2"
          placeholder="Speak or type your plan…"
          value={note + (interimRef.current ? (' ' + interimRef.current) : '')}
          onChange={e=>{ setNote(e.target.value); interimRef.current=''; }}
        />
        <div className="mt-1 text-xs text-gray-500">
          Your microphone text appears live while you speak. Click “Save note” to keep a record below. (Notes are stored in your browser for now.)
        </div>
      </section>

      {/* Past goals */}
      <section className="rounded-2xl border bg-white p-4">
        <div className="text-sm font-medium mb-3">Past Goals</div>
        {notes.length === 0 ? (
          <div className="text-sm text-gray-500">No saved goals yet.</div>
        ) : (
          <ul className="divide-y">
            {notes.map(n=>(
              <li key={n.id} className="py-3 flex items-center justify-between">
                <details className="w-full mr-3">
                  <summary className="cursor-pointer text-sm">
                    {new Date(n.ts).toLocaleString()}
                  </summary>
                  <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{n.text}</div>
                </details>
                <button onClick={()=>onDeleteNote(n.id)} className="text-rose-600 text-sm">Delete</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function KPI({ title, value }:{title:string,value:string}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-gray-600">{title}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
