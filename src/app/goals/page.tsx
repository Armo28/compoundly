'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';

/* ---------- helpers ---------- */
const CAD = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

const monthsLeftThisYear = () => Math.max(1, 12 - new Date().getMonth());
const num = (x: any) => (Number.isFinite(Number(x)) ? Number(x) : 0);

type Rooms = { tfsa: number; rrsp: number };
type Progress = { tfsa_deposited: number; rrsp_deposited: number };
type Account = {
  id: string;
  name: string;
  type: string; // 'TFSA' | 'RRSP' | 'RESP' | 'MARGIN' ...
  balance?: number;
  is_family_resp?: boolean;
  children_covered?: number;
};

type RespProgress = {
  contributed_ytd: number;        // total $ contributed this calendar year across all RESP
  lifetime_contributed: number;   // cumulative $ contributed (not market value)
};

/* ---------- page ---------- */
export default function GoalsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  const [pledge, setPledge] = useState<number>(() => {
    if (typeof window === 'undefined') return 1000;
    const raw = window.localStorage.getItem('goals.pledge');
    return raw ? Number(raw) : 1000;
  });
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem('goals.pledge', String(pledge));
  }, [pledge]);

  const [rooms, setRooms] = useState<Rooms>({ tfsa: 0, rrsp: 0 });
  const [prog, setProg] = useState<Progress>({ tfsa_deposited: 0, rrsp_deposited: 0 });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [respProg, setRespProg] = useState<RespProgress>({ contributed_ytd: 0, lifetime_contributed: 0 });

  // mic + notes (unchanged; compact + resilient)
  const [isMicOn, setIsMicOn] = useState(false);
  const [text, setText] = useState('');
  const recRef = useRef<any>(null);
  const interimRef = useRef('');
  const lastFinalRef = useRef('');

  const toggleMic = () => {
    if (isMicOn) {
      try { recRef.current?.stop(); } catch {}
      setIsMicOn(false);
      recRef.current = null;
      return;
    }
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) { alert('Speech recognition not supported in this browser.'); return; }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (ev: any) => {
      let finalChunk = '';
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        const t = (r?.[0]?.transcript ?? '').trim();
        if (!t) continue;
        if (r.isFinal) finalChunk += (finalChunk ? ' ' : '') + t;
        else interim += (interim ? ' ' : '') + t;
      }
      if (finalChunk && finalChunk !== lastFinalRef.current) {
        lastFinalRef.current = finalChunk;
        setText((p) => (p ? p + ' ' : '') + finalChunk);
      }
      if (interim !== interimRef.current) {
        interimRef.current = interim;
        // show interim but don’t permanently append it
        // (keep text area controlled by text only)
      }
    };
    rec.onend = () => setIsMicOn(false);
    rec.onerror = () => setIsMicOn(false);
    recRef.current = rec;
    rec.start();
    setIsMicOn(true);
  };

  const saveNote = () => {
    const t = text.trim();
    if (!t) return;
    const all = JSON.parse(localStorage.getItem('goals.notes') || '[]');
    all.unshift({ id: 'id-' + Math.random().toString(36).slice(2), ts: new Date().toISOString(), text: t });
    localStorage.setItem('goals.notes', JSON.stringify(all));
    setText('');
    interimRef.current = '';
    lastFinalRef.current = '';
  };

  /* ---------- load data from API ---------- */
  useEffect(() => {
    if (!token) return;
    const headers = { authorization: `Bearer ${token}` };

    (async () => {
      // rooms (TFSA/RRSP contribution room for current year)
      try {
        const r = await fetch('/api/rooms', { headers });
        const j = await r.json();
        const room = j?.room ?? j ?? {};
        setRooms({ tfsa: num(room.tfsa), rrsp: num(room.rrsp) });
      } catch {}

      // progress (how much already deposited to TFSA/RRSP this year)
      try {
        const r = await fetch('/api/rooms/progress', { headers });
        const j = await r.json();
        setProg({
          tfsa_deposited: num(j?.tfsa_deposited),
          rrsp_deposited: num(j?.rrsp_deposited),
        });
      } catch {}

      // accounts (to detect RESP + children_covered)
      try {
        const r = await fetch('/api/accounts', { headers });
        const j = await r.json();
        setAccounts(Array.isArray(j?.items) ? (j.items as Account[]) : []);
      } catch {}

      // RESP progress (contributed_ytd + lifetime_contributed)
      try {
        const r = await fetch('/api/resp-progress', { headers });
        const j = await r.json();
        setRespProg({
          contributed_ytd: num(j?.contributed_ytd),
          lifetime_contributed: num(j?.lifetime_contributed),
        });
      } catch {
        setRespProg({ contributed_ytd: 0, lifetime_contributed: 0 });
      }
    })();
  }, [token]);

  /* ---------- computed values ---------- */
  // RESP: compute total children covered by all RESP accounts (family or regular).
  const hasRESP = accounts.some((a) => String(a.type).toUpperCase() === 'RESP');
  const childrenCovered = accounts
    .filter((a) => String(a.type).toUpperCase() === 'RESP')
    .map((a) => (a.is_family_resp ? Math.max(1, num(a.children_covered)) : 1))
    .reduce((s, n) => s + n, 0);

  // caps
  const monthsLeft = monthsLeftThisYear();
  const respYearRoom = Math.max(0, childrenCovered * 2500 - respProg.contributed_ytd);
  const respLifetimeRoom = Math.max(0, childrenCovered * 50000 - respProg.lifetime_contributed);
  const respRoomThisYearCapped = Math.min(respYearRoom, respLifetimeRoom);

  const remainingTFSA = Math.max(0, rooms.tfsa - prog.tfsa_deposited);
  const remainingRRSP = Math.max(0, rooms.rrsp - prog.rrsp_deposited);

  // allocation
  const split = useMemo(() => {
    let left = pledge;
    const out = { resp: 0, tfsa: 0, rrsp: 0, margin: 0 };

    // 1) RESP (if any RESP account exists)
    if (hasRESP && respRoomThisYearCapped > 0 && left > 0) {
      const capPerMonth = Math.ceil(respRoomThisYearCapped / monthsLeft);
      const amt = Math.min(left, capPerMonth);
      out.resp = amt;
      left -= amt;
    }

    // 2) TFSA
    if (remainingTFSA > 0 && left > 0) {
      const tfsaCapPerMonth = Math.ceil(remainingTFSA / monthsLeft);
      const amt = Math.min(left, tfsaCapPerMonth);
      out.tfsa = amt;
      left -= amt;
    }

    // 3) RRSP
    if (remainingRRSP > 0 && left > 0) {
      const rrspCapPerMonth = Math.ceil(remainingRRSP / monthsLeft);
      const amt = Math.min(left, rrspCapPerMonth);
      out.rrsp = amt;
      left -= amt;
    }

    // 4) Remainder
    out.margin = Math.max(0, left);
    return out;
  }, [pledge, hasRESP, respRoomThisYearCapped, monthsLeft, remainingTFSA, remainingRRSP]);

  /* ---------- UI ---------- */
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
            max={20000}
            step={25}
            value={pledge}
            onChange={(e) => setPledge(Math.max(0, Math.round(+e.target.value)))}
          />
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Recommendation is specific to{' '}
          {new Date().toLocaleString(undefined, { month: 'long', year: 'numeric' })} (
          {monthsLeft} {monthsLeft === 1 ? 'month' : 'months'} left this year).
        </div>
      </section>

      {/* Recommendation tiles */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* RESP appears when at least one RESP account exists */}
          {hasRESP && (
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-600 mb-1">RESP</div>
              <div className="text-2xl font-semibold">{CAD(split.resp)}</div>
              <div className="text-[11px] text-gray-500 mt-1">
                Remaining this year: {CAD(respYearRoom)} · Lifetime left: {CAD(respLifetimeRoom)}
              </div>
            </div>
          )}
          <div className="rounded-xl border p-4">
            <div className="text-xs text-gray-600 mb-1">TFSA</div>
            <div className="text-2xl font-semibold">{CAD(split.tfsa)}</div>
            <div className="text-[11px] text-gray-500 mt-1">Remaining this year: {CAD(remainingTFSA)}</div>
          </div>
          <div className="rounded-xl border p-4">
            <div className="text-xs text-gray-600 mb-1">RRSP</div>
            <div className="text-2xl font-semibold">{CAD(split.rrsp)}</div>
            <div className="text-[11px] text-gray-500 mt-1">Remaining this year: {CAD(remainingRRSP)}</div>
          </div>
          <div className="rounded-xl border p-4">
            <div className="text-xs text-gray-600 mb-1">Margin/Other</div>
            <div className="text-2xl font-semibold">{CAD(split.margin)}</div>
          </div>
        </div>
        <div className="mt-3 text-xs text-gray-500">
          Order: RESP (up to caps) → TFSA → RRSP → remainder to Margin/Other.
        </div>
      </section>

      {/* Mic + note */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">Describe your goals</div>
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={toggleMic}
            className={`rounded p-2 ${isMicOn ? 'bg-red-600' : 'bg-emerald-600'} text-white`}
            title={isMicOn ? 'Stop mic' : 'Start mic'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M19 11a7 7 0 0 1-14 0M12 18v3"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button onClick={() => saveNote()} className="rounded bg-indigo-600 px-3 py-2 text-white">
            Save note
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Speak or type your plan..."
          className="w-full min-h-[140px] rounded-lg border p-3 outline-none"
        />
        <div className="mt-2 text-xs text-gray-500">
          Your microphone text appears live while you speak. Click “Save note” to keep a record. (Notes are
          stored in your browser for now.)
        </div>
      </section>
    </main>
  );
}
