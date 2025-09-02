'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';

/* ---------- helpers ---------- */

const CAD = (n: number) =>
  n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  });

const now = () => new Date();
const year = () => now().getFullYear();
const monthIndex = () => now().getMonth(); // 0..11
const monthsLeftThisYear = () => Math.max(0, 12 - (monthIndex() + 1)); // e.g. September -> 3 months left

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/* ---------- types (what the API returns) ---------- */

type Rooms = { tfsa: number; rrsp: number; year: number } | null;
type Progress = { tfsa_deposited: number; rrsp_deposited: number; year: number } | null;
type Child = { id: string; name: string; birth_year: number };

/* ---------- mic / notes persistence ---------- */

type GoalNote = { id: string; ts: number; text: string };

const NOTES_KEY = 'compoundly.goalNotes.v1';
const PLEDGE_KEY = 'compoundly.monthlyPledge.v1';

function loadNotes(): GoalNote[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    return raw ? (JSON.parse(raw) as GoalNote[]) : [];
  } catch {
    return [];
  }
}
function saveNotes(notes: GoalNote[]) {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  } catch {}
}
function loadPledge(): number {
  if (typeof window === 'undefined') return 1000;
  const v = Number(localStorage.getItem(PLEDGE_KEY));
  return Number.isFinite(v) && v > 0 ? v : 1000; // default first-time: $1,000
}
function savePledge(v: number) {
  try {
    localStorage.setItem(PLEDGE_KEY, String(v));
  } catch {}
}

/* ---------- page ---------- */

export default function GoalsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  const [pledge, setPledge] = useState<number>(loadPledge());
  useEffect(() => savePledge(pledge), [pledge]);

  const [rooms, setRooms] = useState<Rooms>(null);
  const [progress, setProgress] = useState<Progress>(null);
  const [children, setChildren] = useState<Child[]>([]);

  // mic state
  const [recognizing, setRecognizing] = useState(false);
  const [liveText, setLiveText] = useState('');
  const recogRef = useRef<SpeechRecognition | null>(null);
  const lastChunkRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const [notes, setNotes] = useState<GoalNote[]>(loadNotes());

  useEffect(() => saveNotes(notes), [notes]);

  /* ----- fetch current-year room + progress + children ----- */
  useEffect(() => {
    if (!token) return;

    (async () => {
      try {
        // Contribution room (TFSA / RRSP)
        const r = await fetch('/api/rooms', {
          headers: { authorization: `Bearer ${token}` },
        });
        const rj = await r.json();
        if (rj?.ok && rj?.room?.year === year()) {
          setRooms({ tfsa: Number(rj.room.tfsa || 0), rrsp: Number(rj.room.rrsp || 0), year: rj.room.year });
        } else {
          setRooms({ tfsa: 0, rrsp: 0, year: year() });
        }

        // Deposited so far this year
        const p = await fetch('/api/rooms/progress', {
          headers: { authorization: `Bearer ${token}` },
        });
        const pj = await p.json();
        if (pj?.ok && pj?.progress?.year === year()) {
          setProgress({
            tfsa_deposited: Number(pj.progress.tfsa_deposited || 0),
            rrsp_deposited: Number(pj.progress.rrsp_deposited || 0),
            year: pj.progress.year,
          });
        } else {
          setProgress({ tfsa_deposited: 0, rrsp_deposited: 0, year: year() });
        }

        // Children
        const c = await fetch('/api/children', { headers: { authorization: `Bearer ${token}` } });
        const cj = await c.json();
        setChildren(Array.isArray(cj?.data) ? (cj.data as Child[]) : []);
      } catch (e) {
        // keep soft-failing
      }
    })();
  }, [token]);

  /* ----- allocation logic (RESP -> TFSA -> RRSP -> Margin) ----- */

  // remaining room for this year
  const remaining = useMemo(() => {
    const tfsaRoom = Math.max(0, (rooms?.tfsa || 0) - (progress?.tfsa_deposited || 0));
    const rrspRoom = Math.max(0, (rooms?.rrsp || 0) - (progress?.rrsp_deposited || 0));
    // For RESP, we cap at $2,500 per child per year to maximize grant (we don’t yet track “RESP contributed this year”, so assume 0 for now)
    const respCap = (children?.length || 0) * 2500;
    const respRemaining = Math.max(0, respCap); // assume not deposited yet; when you track RESP deposits, subtract them here.
    return { tfsaRoom, rrspRoom, respRemaining };
  }, [rooms, progress, children]);

  const monthsLeft = Math.max(1, monthsLeftThisYear()); // avoid divide-by-0; if Dec -> treat 1 month left

  const split = useMemo(() => {
    let left = Math.max(0, pledge);
    const out = { resp: 0, tfsa: 0, rrsp: 0, margin: 0 };

    // RESP first (only if there are children)
    if (remaining.respRemaining > 0) {
      const respPerMonth = Math.ceil(remaining.respRemaining / monthsLeft);
      const alloc = Math.min(left, respPerMonth);
      out.resp = alloc;
      left -= alloc;
    }

    // TFSA next
    if (remaining.tfsaRoom > 0 && left > 0) {
      const tfsaPerMonth = Math.ceil(remaining.tfsaRoom / monthsLeft);
      const alloc = Math.min(left, tfsaPerMonth);
      out.tfsa = alloc;
      left -= alloc;
    }

    // RRSP next
    if (remaining.rrspRoom > 0 && left > 0) {
      const rrspPerMonth = Math.ceil(remaining.rrspRoom / monthsLeft);
      const alloc = Math.min(left, rrspPerMonth);
      out.rrsp = alloc;
      left -= alloc;
    }

    // Remainder to Margin/Other
    out.margin = Math.max(0, left);

    return out;
  }, [pledge, remaining, monthsLeft]);

  /* ----- microphone (live) ----- */

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR: any = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) return;

    const rec: SpeechRecognition = new SR();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = true;

    rec.onresult = (ev: SpeechRecognitionEvent) => {
      let txt = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const chunk = res[0]?.transcript ?? '';
        // filter immediate duplicate short chunks that cause repeats
        const last = lastChunkRef.current;
        const nowT = Date.now();
        if (chunk && !(chunk === last.text && nowT - last.at < 600)) {
          txt += chunk;
          lastChunkRef.current = { text: chunk, at: nowT };
        }
        if (res.isFinal) {
          setLiveText((t) => (t.endsWith(' ') ? t : t + ' ') + chunk.trim() + ' ');
        }
      }
      if (txt) {
        // show interim quickly
        setLiveText((t) => {
          // don’t explode with whitespace repeats
          const merged = (t + ' ' + txt).replace(/\s+/g, ' ');
          return merged;
        });
      }
    };

    rec.onerror = () => {
      setRecognizing(false);
      try {
        rec.stop();
      } catch {}
      recogRef.current = null;
    };
    rec.onend = () => {
      setRecognizing(false);
      recogRef.current = null;
    };

    recogRef.current = rec;
  }, []);

  const toggleMic = () => {
    const rec = recogRef.current as any;
    if (!rec) return;
    if (recognizing) {
      try {
        rec.stop();
      } catch {}
      setRecognizing(false);
      return;
    }
    try {
      lastChunkRef.current = { text: '', at: 0 };
      rec.start();
      setRecognizing(true);
    } catch {}
  };

  const saveNote = () => {
    const text = liveText.trim();
    if (!text) return;
    const note: GoalNote = { id: crypto.randomUUID(), ts: Date.now(), text };
    setNotes((arr) => [note, ...arr]);
    setLiveText('');
  };
  const deleteNote = (id: string) => {
    setNotes((arr) => arr.filter((n) => n.id !== id));
  };

  /* ---------- UI ---------- */

  const monthName = new Date(year(), monthIndex(), 1).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      {/* Pledge */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-2">Monthly pledge</div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-700 min-w-[100px]">{CAD(pledge)}</div>
          <input
            className="w-full h-2 rounded-lg bg-gray-200 appearance-none accent-blue-600"
            type="range"
            min={0}
            max={20000}
            step={50}
            value={pledge}
            onChange={(e) => setPledge(clamp(Math.round(+e.target.value / 50) * 50, 0, 20000))}
          />
        </div>
        <div className="mt-2 text-xs text-gray-600">
          Recommendation is specific to {monthName} ({monthsLeft} {monthsLeft === 1 ? 'month' : 'months'} left this year).
        </div>
      </section>

      {/* Suggested split cards (keep your old look) */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">Suggested monthly split</div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {/* RESP card only if has children */}
          {children.length > 0 && (
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-500 mb-1">RESP</div>
              <div className="text-2xl font-semibold">{CAD(split.resp)}</div>
              <div className="text-xs text-gray-500 mt-1">
                Remaining this year (cap): {CAD(remaining.respRemaining)}
              </div>
            </div>
          )}

          <div className="rounded-xl border p-4">
            <div className="text-xs text-gray-500 mb-1">TFSA</div>
            <div className="text-2xl font-semibold">{CAD(split.tfsa)}</div>
            <div className="text-xs text-gray-500 mt-1">
              Remaining room this year: {CAD(remaining.tfsaRoom)}
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-xs text-gray-500 mb-1">RRSP</div>
            <div className="text-2xl font-semibold">{CAD(split.rrsp)}</div>
            <div className="text-xs text-gray-500 mt-1">
              Remaining room this year: {CAD(remaining.rrspRoom)}
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-xs text-gray-500 mb-1">Margin/Other</div>
            <div className="text-2xl font-semibold">{CAD(split.margin)}</div>
          </div>
        </div>

        <div className="text-xs text-gray-600 mt-3">
          Priority used: RESP (to maximize the 20% grant up to $500/child, $2,500 contribution per child/year) → TFSA → RRSP → remainder to
          an unregistered account. Split uses months left in the year for per-month targets.
        </div>
      </section>

      {/* Mic + notes (as before) */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">Describe your goals</div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleMic}
            className={`rounded px-3 py-2 text-white ${recognizing ? 'bg-red-600' : 'bg-emerald-600'}`}
          >
            {recognizing ? 'Stop mic' : 'Start mic'}
          </button>
          <button onClick={saveNote} className="rounded bg-gray-900 px-3 py-2 text-white">
            Save note
          </button>
        </div>

        <textarea
          className="mt-3 w-full rounded-lg border p-3 min-h-[140px]"
          placeholder="Speak or type your plan…"
          value={liveText}
          onChange={(e) => setLiveText(e.target.value)}
        />

        <div className="mt-2 text-xs text-gray-600">
          Your microphone text appears live while you speak. Click “Save note” to keep a record below. (Notes are stored in your browser for
          now.)
        </div>
      </section>

      {/* Past Goals list (collapsible, delete) */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">Past Goals</div>
        {notes.length === 0 ? (
          <div className="text-sm text-gray-600">No saved goals yet.</div>
        ) : (
          <ul className="divide-y">
            {notes.map((n) => (
              <PastNoteRow key={n.id} note={n} onDelete={() => deleteNote(n.id)} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

/* ---------- small row component ---------- */

function PastNoteRow({ note, onDelete }: { note: GoalNote; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const when = new Date(note.ts).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <li className="py-2">
      <div className="flex items-center justify-between">
        <button onClick={() => setOpen((v) => !v)} className="text-left">
          <div className="text-sm font-medium">{when}</div>
          {open && <div className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{note.text}</div>}
        </button>
        <button onClick={onDelete} className="text-xs text-red-600 hover:underline">
          Delete
        </button>
      </div>
    </li>
  );
}

/* ---------- SpeechRecognition typings (for TS) ---------- */
/* These definitions allow TS to compile in the client bundle. */
declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
  interface SpeechRecognition extends EventTarget {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    start: () => void;
    stop: () => void;
    onresult: (ev: SpeechRecognitionEvent) => void;
    onerror: (ev: any) => void;
    onend: () => void;
  }
  interface SpeechRecognitionEvent extends Event {
    resultIndex: number;
    results: SpeechRecognitionResultList;
  }
  interface SpeechRecognitionResultList {
    length: number;
    item: (index: number) => SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
  }
  interface SpeechRecognitionResult {
    isFinal: boolean;
    length: number;
    item: (index: number) => SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
  }
  interface SpeechRecognitionAlternative {
    transcript: string;
    confidence: number;
  }
}
