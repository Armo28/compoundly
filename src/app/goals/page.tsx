'use client';

/* Goals page — original UI + mic icon + robust months-left split
   - Tries /api/rooms?year=YYYY and /api/rooms (fallback)
   - Tries /api/rooms/progress?year=YYYY and /api/rooms/progress (fallback)
   - Also fetches /api/children and /api/accounts to decide RESP tile visibility
   - Priority: RESP (only if user has a child) → TFSA → RRSP → remainder to Margin
   - Slider value persists between sessions (defaults: CA$1,000; first run)
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

const now = () => new Date();
const currentYear = () => now().getFullYear();

/** Months left INCLUSIVE of this month (Sep → 4: Sep, Oct, Nov, Dec). */
function monthsLeftThisYear(d = now()) {
  return Math.max(1, 12 - d.getMonth());
}

type Rooms = { tfsa: number; rrsp: number; year: number };
type Progress = {
  tfsa_deposited?: number;
  rrsp_deposited?: number;
  resp_deposited?: number;
  year: number;
};
type Child = { id: string; name: string; birth_year: number };
type Account = { id: string; type: string; name?: string; balance?: number };

// localStorage (safe)
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

async function fetchJson(url: string, headers: Record<string, string>) {
  try {
    const r = await fetch(url, { headers });
    return await r.json();
  } catch {
    return null;
  }
}

function num(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

// ---------- page ----------
export default function GoalsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  // pledge slider (persist; default CA$1,000 for first-time users)
  const [pledge, setPledge] = useState<number>(() => loadLS('goals.pledge', 1000));
  useEffect(() => saveLS('goals.pledge', pledge), [pledge]);

  // fetched state
  const [rooms, setRooms] = useState<Rooms | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [hasRespAccount, setHasRespAccount] = useState(false);

  // mic + notes
  const [isMicOn, setIsMicOn] = useState(false);
  const [text, setText] = useState('');
  const [notes, setNotes] = useState<Array<{ id: string; ts: string; text: string }>>(
    () => loadLS('goals.notes', [])
  );
  useEffect(() => saveLS('goals.notes', notes), [notes]);

  // fetch current-year room / progress / children / accounts
  useEffect(() => {
    if (!token) return;
    const headers = { authorization: `Bearer ${token}` };
    const yr = currentYear();

    (async () => {
      // ----- contribution rooms -----
      let roomJ =
        (await fetchJson(`/api/rooms?year=${yr}`, headers)) ??
        (await fetchJson(`/api/rooms`, headers));
      if (roomJ && roomJ.ok !== false) {
        // tolerate different shapes
        const tfsa = num(roomJ.tfsa ?? roomJ?.data?.tfsa);
        const rrsp = num(roomJ.rrsp ?? roomJ?.data?.rrsp);
        setRooms({ tfsa, rrsp, year: yr });
      } else {
        setRooms({ tfsa: 0, rrsp: 0, year: yr });
      }

      // ----- deposited so far -----
      let progJ =
        (await fetchJson(`/api/rooms/progress?year=${yr}`, headers)) ??
        (await fetchJson(`/api/rooms/progress`, headers));
      if (progJ && progJ.ok !== false) {
        setProgress({
          tfsa_deposited: num(progJ.tfsa_deposited),
          rrsp_deposited: num(progJ.rrsp_deposited),
          resp_deposited: num(progJ.resp_deposited),
          year: yr,
        });
      } else {
        setProgress({ tfsa_deposited: 0, rrsp_deposited: 0, resp_deposited: 0, year: yr });
      }

      // ----- children -----
      const childrenJ = await fetchJson(`/api/children`, headers);
      if (childrenJ?.ok && Array.isArray(childrenJ.items)) setChildren(childrenJ.items);

      // ----- accounts (for RESP tile visibility even if no child yet) -----
      const accountsJ = await fetchJson(`/api/accounts`, headers);
      if (accountsJ?.ok && Array.isArray(accountsJ.items)) {
        const items = accountsJ.items as Account[];
        setHasRespAccount(items.some((a) => String(a.type).toUpperCase() === 'RESP'));
      }
    })();
  }, [token]);

  const monthsLeft = monthsLeftThisYear();
  const childCount = children?.length ?? 0;

  // compute remaining rooms (room - deposited)
  const remaining = useMemo(() => {
    const tfsaRoom = num(rooms?.tfsa);
    const rrspRoom = num(rooms?.rrsp);
    const tfsaDep = num(progress?.tfsa_deposited);
    const rrspDep = num(progress?.rrsp_deposited);
    const respDep = num(progress?.resp_deposited);

    // RESP target = $2,500 per child per year (grant max)
    const respTarget = childCount * 2500;
    const respRem = Math.max(0, respTarget - respDep);

    return {
      tfsa: Math.max(0, tfsaRoom - tfsaDep),
      rrsp: Math.max(0, rrspRoom - rrspDep),
      resp: respRem, // 0 if no child
    };
  }, [rooms, progress, childCount]);

  // priority allocation for this month
  const split = useMemo(() => {
    let left = pledge;
    const out = { resp: 0, tfsa: 0, rrsp: 0, margin: 0 };

    // helper: max to contribute this month to fully use room by year-end
    const capPerMonth = (room: number) => Math.ceil(room / monthsLeft);

    // 1) RESP only if user has a child (priority rule)
    if (childCount > 0 && remaining.resp > 0 && left > 0) {
      const cap = capPerMonth(remaining.resp);
      const amt = Math.min(left, cap);
      out.resp = amt;
      left -= amt;
    }

    // 2) TFSA
    if (remaining.tfsa > 0 && left > 0) {
      const cap = capPerMonth(remaining.tfsa);
      const amt = Math.min(left, cap);
      out.tfsa = amt;
      left -= amt;
    }

    // 3) RRSP
    if (remaining.rrsp > 0 && left > 0) {
      const cap = capPerMonth(remaining.rrsp);
      const amt = Math.min(left, cap);
      out.rrsp = amt;
      left -= amt;
    }

    // 4) remainder
    if (left > 0) out.margin = left;

    return out;
  }, [pledge, monthsLeft, remaining, childCount]);

  // ---------- mic (icon) ----------
  const recRef = useRef<SpeechRecognition | null>(null);
  const interimRef = useRef('');
  const lastFinalRef = useRef('');

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
      if (finalChunk && finalChunk !== lastFinalRef.current) {
        lastFinalRef.current = finalChunk;
        setText((prev) => (prev + ' ' + finalChunk).trim());
        interimRef.current = '';
      }
      if (interimChunk && interimChunk !== interimRef.current) {
        interimRef.current = interimChunk;
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
    interimRef.current = '';
  };

  const toggleMic = () => (isMicOn ? stopMic() : startMic());

  // notes
  const saveNote = () => {
    const t = text.trim();
    if (!t) return;
    const id = cryptoId();
    const ts = new Date().toISOString();
    setNotes((arr) => [{ id, ts, text: t }, ...arr]);
    setText('');
    lastFinalRef.current = '';
    interimRef.current = '';
  };
  const deleteNote = (id: string) => setNotes((arr) => arr.filter((n) => n.id !== id));

  // RESP tile visible: child OR RESP account present
  const showRespTile = childCount > 0 || hasRespAccount;

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

      {/* Recommendation tiles (original style) */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">
          Suggested monthly split for{' '}
          {new Date().toLocaleString(undefined, { month: 'long', year: 'numeric' })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {showRespTile && (
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-600 mb-1">RESP</div>
              <div className="text-2xl font-semibold">{CAD(split.resp)}</div>
              <div className="text-[11px] text-gray-500 mt-1">
                Remaining this year: {CAD(remaining.resp)}
                {childCount === 0 && hasRespAccount && (
                  <span className="ml-1 text-[11px] text-amber-600">
                    (add a child to prioritize RESP)
                  </span>
                )}
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
          Order of priority: RESP (only when you have a child) → TFSA to available room → RRSP to
          available room → remainder to an unregistered account. Calculations prorate by{' '}
          <span className="font-medium">{monthsLeft}</span> months left this year.
        </div>
      </section>

      {/* Mic + notes (original section, with MIC ICON toggle) */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">Describe your goals</div>

        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={toggleMic}
            aria-label={isMicOn ? 'Stop microphone' : 'Start microphone'}
            title={isMicOn ? 'Stop microphone' : 'Start microphone'}
            className={`rounded p-2 ${isMicOn ? 'bg-red-600' : 'bg-emerald-600'} text-white`}
          >
            {/* mic icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M19 11a7 7 0 0 1-14 0M12 18v3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <button onClick={saveNote} className="rounded bg-indigo-600 px-3 py-2 text-white">
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
          Your microphone text appears live while you speak. Click “Save note” to keep a record
          below. (Notes are stored in your browser for now.)
        </div>
      </section>

      {/* Past Goals list (collapsible) */}
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

// ---------- tiny utils ----------
function cryptoId() {
  if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID();
  }
  return 'id-' + Math.random().toString(36).slice(2);
}

/* ---------- SpeechRecognition typings (safe shim) ---------- */
declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}
// Avoid conflicts with lib.dom — treat as 'any'
type SpeechRecognition = any;
