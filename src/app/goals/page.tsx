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
};

type Rooms = { year:number; tfsa:number; rrsp:number };
type Progress = { tfsa_deposited?:number; rrsp_deposited?:number; resp_deposited?:number; year:number };
type RespProgress = {
  total_value?: number | null;
  lifetime_contrib?: number | null;
  contributed_this_year?: number | null;
  is_family_resp?: boolean | null;
  children_covered?: number | null;
};

export default function GoalsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  const [pledge, setPledge] = useState<number>(1000);

  const [rooms, setRooms] = useState<Rooms| null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [resp, setResp] = useState<RespProgress | null>(null);

  // mic + notes (kept as-is to avoid regressions)
  const [isMicOn, setIsMicOn] = useState(false);
  const [text, setText] = useState('');
  const recRef = useRef<any>(null);
  const interimRef = useRef(''); const lastFinalRef = useRef('');

  const headers: HeadersInit = token ? { authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        // accounts
        const a = await fetch('/api/accounts', { headers });
        const aj = await a.json();
        setAccounts(Array.isArray(aj?.items) ? aj.items : []);

        // rooms
        const r = await fetch('/api/rooms', { headers });
        const rj = await r.json();
        const room = rj?.room;
        setRooms(room ? { year: room.year, tfsa: Number(room.tfsa||0), rrsp: Number(room.rrsp||0) } : null);

        // generic progress (if you have it; safe fallback)
        const p = await fetch('/api/rooms/progress', { headers }).catch(()=>null);
        const pj = (await p?.json()?.catch(()=>null)) ?? null;
        setProgress(pj ? {
          tfsa_deposited: Number(pj.tfsa_deposited||0),
          rrsp_deposited: Number(pj.rrsp_deposited||0),
          resp_deposited: Number(pj.resp_deposited||0),
          year: new Date().getFullYear()
        } : { year: new Date().getFullYear() });

        // RESP progress (optional)
        const hasRESP = (Array.isArray(aj?.items) ? aj.items : []).some((x:any)=> String(x?.type).toUpperCase()==='RESP');
        if (hasRESP) {
          const rp = await fetch('/api/resp-progress', { headers });
          const rpj = await rp.json();
          setResp(rpj?.data ?? null);
        } else {
          setResp(null);
        }
      } catch {}
    })();
  }, [token]); // eslint-disable-line

  const monthsLeft = monthsLeftThisYear();

  // remaining rooms
  const remaining = useMemo(() => {
    const tfsaRoom = Number(rooms?.tfsa||0);
    const rrspRoom = Number(rooms?.rrsp||0);
    const tfsaDep  = Number(progress?.tfsa_deposited||0);
    const rrspDep  = Number(progress?.rrsp_deposited||0);

    return {
      tfsa: Math.max(0, tfsaRoom - tfsaDep),
      rrsp: Math.max(0, rrspRoom - rrspDep)
    };
  }, [rooms, progress]);

  // RESP grant-path remaining this year
  const respGrantPathRemaining = useMemo(() => {
    if (!resp) return 0;
    const kids = Math.max(1, resp?.is_family_resp ? Number(resp?.children_covered||1) : 1);
    const eligibleThisYear = 2500 * kids;        // grant-eligible contributions
    const alreadyThisYear = Number(resp?.contributed_this_year||0);
    return Math.max(0, eligibleThisYear - alreadyThisYear);
  }, [resp]);

  // RESP lifetime remaining (contrib side)
  const respLifetimeRemaining = useMemo(() => {
    if (!resp) return 0;
    const kids = Math.max(1, resp?.is_family_resp ? Number(resp?.children_covered||1) : 1);
    const lifetimeCap = 50000 * kids;
    const life = Number(resp?.lifetime_contrib||0);
    return Math.max(0, lifetimeCap - life);
  }, [resp]);

  // monthly split (CESG-first, then TFSA, RRSP, margin)
  const split = useMemo(() => {
    let left = pledge;
    const out = { resp: 0, tfsa: 0, rrsp: 0, margin: 0 };

    const capPerMonth = (room: number) => Math.ceil(room / monthsLeft);

    if (resp) {
      // prioritize “grant path” first
      if (respGrantPathRemaining > 0 && left > 0) {
        const cap = capPerMonth(respGrantPathRemaining);
        const amt = Math.min(left, cap);
        out.resp += amt; left -= amt;
      }
      // then lifetime remaining
      if (respLifetimeRemaining > 0 && left > 0) {
        const cap = capPerMonth(respLifetimeRemaining);
        const amt = Math.min(left, cap);
        out.resp += amt; left -= amt;
      }
    }

    if (remaining.tfsa > 0 && left > 0) {
      const cap = capPerMonth(remaining.tfsa);
      const amt = Math.min(left, cap);
      out.tfsa = amt; left -= amt;
    }
    if (remaining.rrsp > 0 && left > 0) {
      const cap = capPerMonth(remaining.rrsp);
      const amt = Math.min(left, cap);
      out.rrsp = amt; left -= amt;
    }
    if (left > 0) out.margin = left;

    return out;
  }, [pledge, monthsLeft, resp, respGrantPathRemaining, respLifetimeRemaining, remaining]);

  const showRespTile = accounts.some(a => String(a.type).toUpperCase()==='RESP');

  /** mic toggle (same stable version you okayed earlier) */
  const toggleMic = () => {
    if (isMicOn) {
      try { recRef.current?.stop(); } catch {}
      recRef.current = null; setIsMicOn(false); return;
    }
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) { alert('Speech recognition not supported.'); return; }
    const rec = new SR();
    rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (ev: any) => {
      let finalChunk = ''; let interimChunk = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i]; const t = res[0]?.transcript ?? '';
        if (res.isFinal) finalChunk += t; else interimChunk += t;
      }
      if (finalChunk && finalChunk !== lastFinalRef.current) {
        lastFinalRef.current = finalChunk;
        setText((p) => (p + ' ' + finalChunk).trim());
        interimRef.current = '';
      }
      if (interimChunk && interimChunk !== interimRef.current) {
        interimRef.current = interimChunk;
        setText((p) => (p + ' ' + interimChunk).trim());
      }
    };
    rec.onend = () => setIsMicOn(false);
    rec.onerror = () => setIsMicOn(false);
    recRef.current = rec; rec.start(); setIsMicOn(true);
  };

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      {/* Monthly pledge */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">Monthly pledge</div>
        <div className="flex items-center gap-4">
          <div className="min-w-[120px] text-sm text-gray-700">{CAD(pledge)}</div>
          <input
            type="range"
            className="flex-1 h-2 rounded-lg bg-gray-200 appearance-none accent-indigo-600"
            min={0}
            max={10000}
            step={25}
            value={pledge}
            onChange={(e) => setPledge(Math.max(0, Math.round(+e.target.value)))}
          />
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Recommendation is specific to {new Date().toLocaleString(undefined, { month: 'long', year: 'numeric' })} ({monthsLeft} {monthsLeft === 1 ? 'month' : 'months'} left this year).
        </div>
      </section>

      {/* Recommendation tiles */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {showRespTile && (
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-600 mb-1">RESP</div>
              <div className="text-2xl font-semibold">{CAD(split.resp)}</div>
              <div className="text-[11px] text-gray-500 mt-1">
                Grant path remaining (this year): {CAD(respGrantPathRemaining)}
              </div>
            </div>
          )}
          <div className="rounded-xl border p-4">
            <div className="text-xs text-gray-600 mb-1">TFSA</div>
            <div className="text-2xl font-semibold">{CAD(split.tfsa)}</div>
            <div className="text-[11px] text-gray-500 mt-1">
              Remaining this year: {CAD(remaining.tfsa)}
            </div>
          </div>
          <div className="rounded-xl border p-4">
            <div className="text-xs text-gray-600 mb-1">RRSP</div>
            <div className="text-2xl font-semibold">{CAD(split.rrsp)}</div>
            <div className="text-[11px] text-gray-500 mt-1">
              Remaining this year: {CAD(remaining.rrsp)}
            </div>
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
          <button
            onClick={toggleMic}
            className={`rounded p-2 ${isMicOn ? 'bg-red-600' : 'bg-emerald-600'} text-white`}
            aria-label={isMicOn ? 'Stop mic' : 'Start mic'}
            title={isMicOn ? 'Stop mic' : 'Start mic'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M19 11a7 7 0 0 1-14 0M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button className="rounded bg-indigo-600 px-3 py-2 text-white" onClick={()=>{
            const t = text.trim(); if (!t) return;
            setText(''); lastFinalRef.current=''; interimRef.current='';
          }}>Save note</button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full min-h-[140px] rounded-lg border p-3 outline-none"
          placeholder="Speak or type your plan..."
        />
      </section>
    </main>
  );
}
