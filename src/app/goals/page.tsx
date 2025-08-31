'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';

// ---------- Minimal SpeechRecognition shim (no DOM type collisions) ----------
declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

// ---------- Helpers ----------
const CAD = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

type Child = { id: string; name: string; birth_year: number };
type Rooms = { year: number; tfsa: number; rrsp: number } | null;

type PastGoal = { id: string; ts: number; text: string };

// LocalStorage helpers with SSR guards
const loadGoals = (): PastGoal[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('compoundly.pastGoals');
    return raw ? (JSON.parse(raw) as PastGoal[]) : [];
  } catch {
    return [];
  }
};
const saveGoals = (goals: PastGoal[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('compoundly.pastGoals', JSON.stringify(goals));
  } catch {}
};

// ---------- Page ----------
export default function GoalsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  // Mic / text
  const [isListening, setIsListening] = useState(false);
  const [liveText, setLiveText] = useState('');
  const recRef = useRef<any | null>(null);

  // Persisted goals
  const [past, setPast] = useState<PastGoal[]>([]);

  // Inputs
  const [pledge, setPledge] = useState<number>(1800);

  // Data fetched for planning
  const [children, setChildren] = useState<Child[]>([]);
  const [room, setRoom] = useState<Rooms>(null);

  // ---------- Effects: load past goals from localStorage ----------
  useEffect(() => {
    setPast(loadGoals());
  }, []);

  // ---------- Effects: fetch children & room ----------
  useEffect(() => {
    if (!token) return;

    (async () => {
      try {
        // Children
        const cRes = await fetch('/api/children', {
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const cJ = await cRes.json();
        if (cJ?.ok && Array.isArray(cJ.children)) setChildren(cJ.children);

        // Contribution room (current year)
        const y = new Date().getFullYear();
        const rRes = await fetch(`/api/rooms?year=${y}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const rJ = await rRes.json();
        if (rJ?.ok && rJ.room) setRoom(rJ.room);
      } catch {
        // ignore
      }
    })();
  }, [token]);

  // ---------- Mic handlers ----------
  const startListening = () => {
    if (typeof window === 'undefined') return;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-CA';

    rec.onresult = (ev: any) => {
      // Aggregate interim + final transcripts live
      let interim = '';
      let final = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const txt = res[0]?.transcript ?? '';
        if (res.isFinal) final += txt + ' ';
        else interim += txt + ' ';
      }
      setLiveText((prev) => (final ? (prev + ' ' + final).trim() : (prev + ' ' + interim).trim()));
    };
    rec.onerror = () => {
      setIsListening(false);
    };
    rec.onend = () => {
      setIsListening(false);
    };

    rec.start();
    recRef.current = rec;
    setIsListening(true);
  };

  const stopListening = () => {
    recRef.current?.stop?.();
    recRef.current = null;
    setIsListening(false);
  };

  // ---------- Save goal note ----------
  const saveNote = () => {
    const text = liveText.trim();
    if (!text) return;
    const entry: PastGoal = { id: crypto.randomUUID(), ts: Date.now(), text };
    const next = [entry, ...past];
    setPast(next);
    saveGoals(next);
    setLiveText('');
  };

  const deleteNote = (id: string) => {
    const next = past.filter((p) => p.id !== id);
    setPast(next);
    saveGoals(next);
  };

  // ---------- Suggested split ----------
  const split = useMemo(() => {
    let remaining = Math.max(0, pledge);

    // RESP first: $2,500/child/year → ~ per month
    const kids = children.length;
    const respYearlyMax = kids * 2500;
    const respMonthlyMax = respYearlyMax / 12;
    const toRESP = Math.min(respMonthlyMax, remaining);
    remaining -= toRESP;

    // TFSA next (cap monthly by room/12 if we have room data)
    const tfsaMonthlyCap =
      room ? Math.max(0, Number(room.tfsa || 0)) / 12 : Number.POSITIVE_INFINITY;
    const toTFSA = Math.min(tfsaMonthlyCap, remaining);
    remaining -= toTFSA;

    // RRSP next (cap monthly by room/12 if we have room data)
    const rrspMonthlyCap =
      room ? Math.max(0, Number(room.rrsp || 0)) / 12 : Number.POSITIVE_INFINITY;
    const toRRSP = Math.min(rrspMonthlyCap, remaining);
    remaining -= toRRSP;

    // Remainder to margin/other
    const toMargin = Math.max(0, remaining);

    return { toRESP, toTFSA, toRRSP, toMargin };
  }, [pledge, children, room]);

  // ---------- UI ----------
  return (
    <main className="max-w-4xl mx-auto p-4 space-y-4">
      {/* Pledge → split */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">Monthly pledge</div>
        <div className="flex items-center gap-3">
          <span className="w-28 text-right text-sm text-gray-600">{CAD(pledge)}</span>
          <input
            type="range"
            min={0}
            max={10000}
            step={50}
            className="w-full h-2 bg-gray-200 rounded-lg accent-blue-600"
            value={pledge}
            onChange={(e) => setPledge(Math.round(+e.target.value))}
          />
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg border p-3">
            <div className="text-gray-600">RESP</div>
            <div className="font-semibold">{CAD(split.toRESP)}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-gray-600">TFSA</div>
            <div className="font-semibold">{CAD(split.toTFSA)}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-gray-600">RRSP</div>
            <div className="font-semibold">{CAD(split.toRRSP)}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-gray-600">Margin/Other</div>
            <div className="font-semibold">{CAD(split.toMargin)}</div>
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Priorities: RESP up to $2,500 per child per year → TFSA to available room →
          RRSP to available room → remainder to Margin/Other.
        </p>
      </section>

      {/* Voice-to-text + note saving */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-sm font-medium">Describe your goals</div>
        <div className="flex flex-wrap items-center gap-2">
          {!isListening ? (
            <button
              onClick={startListening}
              className="rounded-md bg-emerald-600 text-white text-sm px-4 py-1.5"
            >
              🎙️ Start mic
            </button>
          ) : (
            <button
              onClick={stopListening}
              className="rounded-md bg-red-600 text-white text-sm px-4 py-1.5"
            >
              ⏹ Stop
            </button>
          )}
          <button
            onClick={saveNote}
            disabled={!liveText.trim()}
            className="rounded-md border text-sm px-4 py-1.5 disabled:opacity-50"
          >
            Save note
          </button>
        </div>
        <textarea
          value={liveText}
          onChange={(e) => setLiveText(e.target.value)}
          placeholder="Speak or type your goal here…"
          className="w-full h-28 rounded-lg border px-3 py-2 text-sm"
        />
        <p className="text-xs text-gray-500">
          Your microphone text appears live while you speak. Click “Save note” to keep a record
          below. (Notes are stored in your browser for now.)
        </p>
      </section>

      {/* Past goals (list + expand + delete) */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-2">Past Goals</div>
        {past.length === 0 ? (
          <div className="text-sm text-gray-500">No saved goals yet.</div>
        ) : (
          <ul className="divide-y">
            {past.map((g) => (
              <PastGoalRow key={g.id} goal={g} onDelete={() => deleteNote(g.id)} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

// Row with disclosure
function PastGoalRow({ goal, onDelete }: { goal: PastGoal; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const date = new Date(goal.ts);
  const title = date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-left flex-1 text-sm font-medium hover:underline"
          title="Show details"
        >
          {title}
        </button>
        <button onClick={onDelete} className="text-xs text-red-600 hover:underline">
          Delete
        </button>
      </div>
      {open && (
        <div className="mt-2 text-sm whitespace-pre-wrap text-gray-800 bg-gray-50 border rounded-md p-3">
          {goal.text}
        </div>
      )}
    </li>
  );
}
