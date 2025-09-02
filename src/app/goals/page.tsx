'use client';

/* Goals page — restored original UI + mic/notes + months-left math
   - Monthly pledge slider persists between sessions
   - Recommendation explicitly depends on “months left this year”
   - Priority: RESP (up to $2,500/child/year after deposits) → TFSA room → RRSP room → remainder = Margin/Other
   - Mic: live, low-lag interim text; “Save note” appends to Past Goals with delete; all stored locally
*/

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';

// ---------- helpers ----------
const CAD = (n: number) =>
  n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  });

const today = () => new Date();
const yearNow = () => today().getFullYear();

/** Months left INCLUSIVE of the current month (ex: Sept → 4: Sep, Oct, Nov, Dec). */
function monthsLeftThisYear(d = today()) {
  const m = d.getMonth(); // 0..11
  return Math.max(1, 12 - m);
}

type Rooms = { tfsa: number; rrsp: number; year: number };
type Progress = { tfsa_deposited?: number; rrsp_deposited?: number; resp_deposited?: number; year: number };
type Child = { id: string; name: string; birth_year: number };

// LocalStorage safe helpers
function loadLS<T>(k: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = window.localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveLS<T>(k: string, v: T) {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}

// ---------- page ----------
export default function GoalsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  // pledge slider (persist)
  const [pledge, setPledge] = useState<number>(() => loadLS('goals.pledge', 1000));
  useEffect(() => saveLS('goals.pledge', pledge), [pledge]);

  // fetched state
  const [rooms, setRooms] = useState<Rooms | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [children, setChildren] = useState<Child[]>([]);

  // mic + notes
  const [isMicOn, setIsMicOn] = useState(false);
  const [text, setText] = useState('');
  const [notes, setNotes] = useState<Array<{ id: string; ts: string; text: string }>>(
    () => loadLS('goals.notes', [])
  );
  useEffect(() => saveLS('goals.notes', notes), [notes]);

  // fetch current-year room + progress + children (after login)
  useEffect(() => {
    if (!token) return;
    const hdrs = { authorization: `Bearer ${token}` };

    (async () => {
      try {
        // contribution room (current year)
        const yr = yearNow();
        const r = await fetch('/api/rooms?year=' + yr, { headers: hdrs });
        const roomJ = await r.json();
        if (roomJ?.ok) {
          setRooms({
            tfsa: Number(roomJ.tfsa ?? 0),
            rrsp: Number(roomJ.rrsp ?? 0),
            year: yr,
          });
        }

        // deposited so far this year (tfsa/rrsp/resp if available)
        const p = await fetch('/api/rooms/progress?year=' + yr, { headers: hdrs });
        const progJ = await p.json();
        if (progJ?.ok) {
          setProgress({
            tfsa_deposited: Number(progJ.tfsa_deposited ?? 0),
            rrsp_deposited: Number(progJ.rrsp_deposited ?? 0),
            resp_deposited: Number(progJ.resp_deposited ?? 0),
            year: yr,
          });
        }

        // children
        const c = await fetch('/api/children', { headers: hdrs });
        const cJ = await c.json();
        if (cJ?.ok && Array.isArray(cJ.items)) setChildren(cJ.items as Child[]);
      } catch {
        // swallow — show zeros
      }
    })();
  }, [token]);

  // months left and remaining rooms
  const monthsLeft = monthsLeftThisYear();
  const childCount = children?.length ?? 0;

  const remaining = useMemo(() => {
    const tfsaRoom = Math.max(0, Number(rooms?.tfsa ?? 0));
    const rrspRoom = Math.max(0, Number(rooms?.rrsp ?? 0));
    const tfsaDep = Math.max(0, Number(progress?.tfsa_deposited ?? 0));
    const rrspDep = Math.max(0, Number(progress?.rrsp_deposited ?? 0));
    const respDep = Math.max(0, Number(progress?.resp_deposited ?? 0));
    // RESP target cap = $2,500 per child per year (for CESG max)
    const respTarget = childCount * 2500;
    const respRem = Math.max(0, respTarget - respDep);

    return {
      tfsa: Math.max(0, tfsaRoom - tfsaDep),
      rrsp: Math.max(0, rrspRoom - rrspDep),
      resp: respRem,
    };
  }, [rooms, progress, childCount]);

  // priority allocation function
  const split = useMemo(() => {
    let remainingMonthly = pledge;
    const out = { resp: 0, tfsa: 0, rrsp: 0, margin: 0 };

    // helper: per-month cap based on months left
    const capPerMonth = (room: number) => {
      // If user wants less than "catch-up per month", they’ll just partially fill;
      // we cap the *recommended* at room / monthsLeft
      return Math.ceil(room / monthsLeft);
    };

    // 1) RESP first (only if childCount > 0)
    if (childCount > 0 && remaining.resp > 0) {
      const cap = capPerMonth(remaining.resp);
      const amt = Math.min(remainingMonthly, cap);
      out.resp = amt;
      remainingMonthly -= amt;
    }

    // 2) TFSA
    if (remainingMonthly > 0 && remaining.tfsa > 0) {
      const cap = capPerMonth(remaining.tfsa);
      const amt = Math.min(remainingMonthly, cap);
      out.tfsa = amt;
      remainingMonthly -= amt;
    }

    // 3) RRSP
    if (remainingMonthly > 0 && remaining.rrsp > 0) {
      const cap = capPerMonth(remaining.rrsp);
      const amt = Math.min(remainingMonthly, cap);
      out.rrsp = amt;
      remainingMonthly -= amt;
    }

    // 4) remainder → Margin/Other
    if (remainingMonthly > 0) out.margin = remainingMonthly;

    return out;
  }, [pledge, monthsLeft, remaining, childCount]);

  // ---------- mic (SpeechRecognition) ----------
  const recRef = useRef<SpeechRecognition | null>(null);
  const interimRef = useRef(''); // to reduce duplication flicker
  const lastFinalRef = useRef(''); // de-dup final

  const startMic = () => {
    if (typeof window === 'undefined') return;
    const SR =
      (window as any).webkitSpeechRecognition ||
      (window as any).SpeechRecognition;
    if (!SR) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }
    const rec: SpeechRecognition = new SR();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (ev: any) => {
      let finalChunk = '';
      let interimChunk = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const t = res[0]?.transcript ?? '';
        if (res.isFinal) finalChunk += t;
        else interimChunk += t;
      }

      // Deduplicate finals
      if (finalChunk && finalChunk !== lastFinalRef.current) {
        lastFinalRef.current = finalChunk;
        setText((prev) => (prev + ' ' + finalChunk).trim());
        interimRef.current = '';
      }

      // Show interims live but don’t repeat
      if (interimChunk && interimChunk !== interimRef.current) {
        interimRef.current = interimChunk;
        // Render combined
        setText((prev) => (prev + ' ' + interimChunk).trim());
      }
    };

    rec.onerror = () => stopMic();
    rec.onend = () => setIsMicOn(false);

    recRef.current = rec;
    rec.start();
    setIsMicOn(true);
  };

  const stopMic = () => {
    try {
      recRef.current?.stop();
    } catch {}
    recRef.current = null;
    setIsMicOn(false);
    // clear dangling interim
    interimRef.current = '';
  };

  const toggleMic = () => (isMicOn ? stopMic() : startMic());

  // save a note
  const saveNote = () => {
    const t = text.trim();
    if (!t) return;
    const id = cryptoRandomId();
    const ts = new Date().toISOString();
    setNotes((arr) => [{ id, ts, text: t }, ...arr]);
    setText('');
    lastFinalRef.current = '';
    interimRef.current = '';
  };

  const deleteNote = (id: string) =>
    setNotes((arr) => arr.filter((n) => n.id !== id));

  // ---------- UI ----------
  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      {/* Monthly pledge */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">Monthly pledge</div>
        <div className="flex items-center gap-4">
          <div className="min-w-[120px] text-sm text-gray-700">{CAD(pledge)}</div>
          <input
            className="flex-1 h-2 rounded-lg bg-gray-200 appearance-none accent-indigo-600"
            type="range"
            min={0}
            max={10000}
            step={25}
            value={pledge}
            onChange={(e) => setPledge(Math.max(0, Math.round(+e.target.value)))}
          />
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Recommendation is specific to{' '}
          {new Date().toLocaleString(undefined, { month: 'long', year: 'numeric' })}{' '}
          ({monthsLeft} {monthsLeft === 1 ? 'month' : 'months'} left this year).
        </div>
      </section>

      {/* Recommendation tiles (original compact style) */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">
          Suggested monthly split for{' '}
          {new Date().toLocaleString(undefined, { month: 'long', year: 'numeric' })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {/* RESP only if user has children */}
          {childCount > 0 && (
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-600 mb-1">RESP</div>
              <div className="text-2xl font-semibold">{CAD(split.resp)}</div>
              <div className="text-[11px] text-gray-500 mt-1">
                Remaining this year: {CAD(remaining.resp)}
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

        <div className="text-xs text-gray-500 mt-3">
          Order of priority: RESP (to maximize the 20% grant up to $500/child), then TFSA
          to available room, then RRSP to available room; any remainder goes to an
          unregistered account. Calculations prorate room by{' '}
          <span className="font-medium">{monthsLeft}</span> months left this year.
        </div>
      </section>

      {/* Mic + notes (original section) */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">Describe your goals</div>

        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={toggleMic}
            className={`rounded px-3 py-2 text-white ${
              isMicOn ? 'bg-red-600' : 'bg-emerald-600'
            }`}
          >
            {isMicOn ? 'Stop mic' : 'Start mic'}
          </button>
          <button
            onClick={saveNote}
            className="rounded bg-indigo-600 px-3 py-2 text-white"
          >
            Save note
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full min-h-[160px] rounded-lg border p-3 outline-none"
          placeholder="Speak or type your plan..."
        />

        <div className="mt-2 text-xs text-gray-500">
          Your microphone text appears live while you speak. Click “Save note” to keep a
          record below. (Notes are stored in your browser for now.)
        </div>
      </section>

      {/* Past Goals (collapsible items with delete) */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">Past Goals</div>

        {notes.length === 0 ? (
          <div className="text-sm text-gray-600">No saved goals yet.</div>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">
                    {new Date(n.ts).toLocaleString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                  <button
                    onClick={() => deleteNote(n.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-gray-600">
                    Show note
                  </summary>
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

// ---------- tiny utils ----------
function cryptoRandomId() {
  if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID();
  }
  return 'id-' + Math.random().toString(36).slice(2);
}

/* ---------- SpeechRecognition typings (safe shim to avoid DOM lib conflicts) ---------- */
declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}
// Treat SR types as 'any' to avoid declaration-merge conflicts with lib.dom
type SpeechRecognition = any;
