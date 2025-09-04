'use client';

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
function monthsLeftThisYear(d = now()) {
  // months remaining including current month window
  return Math.max(1, 12 - d.getMonth());
}

type Rooms = { tfsa: number; rrsp: number; year: number };
type Progress = {
  tfsa_deposited?: number;
  rrsp_deposited?: number;
  resp_deposited?: number;
  year: number;
};
type Child = {
  id: string;
  name: string;
  birth_year: number;
  lifetime_contrib_to_date?: number; // optional, default 0
  cesg_received_to_date?: number;    // optional, default 0
};
type Account = { id: string; type: string; name?: string; balance?: number };

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

const num = (x: any) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

const CESG_LIFETIME_CAP = 7200;     // per child lifetime grant
const RESP_LIFETIME_CONTRIB_CAP = 50000; // per child lifetime contributions
const BASE_PER_YEAR_CONTRIB = 2500; // earns base $500 grant (20%)
const CATCHUP_PER_YEAR_CONTRIB = 2500; // extra $500 grant if carry-forward exists
const MAX_GRANTABLE_PER_YEAR = BASE_PER_YEAR_CONTRIB + CATCHUP_PER_YEAR_CONTRIB; // 5000

// Decide if catch-up can be considered (simple heuristic per your instruction)
function allowCatchupForChild(child: Child) {
  const age = currentYear() - Number(child.birth_year || currentYear());
  // simple: if child is > 1 year old and still has lifetime CESG headroom, allow catch-up
  const cesgReceived = num(child.cesg_received_to_date);
  const lifetimeGrantLeft = Math.max(0, CESG_LIFETIME_CAP - cesgReceived);
  return age > 1 && lifetimeGrantLeft >= 500; // at least one extra $500 grant possible
}

// ---------- page ----------
export default function GoalsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  // Monthly pledge slider (persisted)
  const [pledge, setPledge] = useState<number>(() => loadLS('goals.pledge', 1000));
  useEffect(() => saveLS('goals.pledge', pledge), [pledge]);

  const [rooms, setRooms] = useState<Rooms | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // mic + notes
  const [isMicOn, setIsMicOn] = useState(false);
  const [text, setText] = useState('');
  const [notes, setNotes] = useState<Array<{ id: string; ts: string; text: string }>>(
    () => loadLS('goals.notes', [])
  );
  useEffect(() => saveLS('goals.notes', notes), [notes]);

  // fetch rooms/progress/children/accounts
  useEffect(() => {
    if (!token) return;
    const headers = { authorization: `Bearer ${token}` };
    const yr = currentYear();

    (async () => {
      // rooms
      let roomJ =
        (await fetchJson(`/api/rooms?year=${yr}`, headers)) ??
        (await fetchJson(`/api/rooms`, headers));
      setRooms({
        tfsa: num(roomJ?.tfsa ?? roomJ?.data?.tfsa),
        rrsp: num(roomJ?.rrsp ?? roomJ?.data?.rrsp),
        year: yr,
      });

      // progress (tfsa/rrsp/resp deposited so far this year)
      let progJ =
        (await fetchJson(`/api/rooms/progress?year=${yr}`, headers)) ??
        (await fetchJson(`/api/rooms/progress`, headers));
      setProgress({
        tfsa_deposited: num(progJ?.tfsa_deposited),
        rrsp_deposited: num(progJ?.rrsp_deposited),
        resp_deposited: num(progJ?.resp_deposited),
        year: yr,
      });

      // children (now may include lifetime fields; default 0 if absent)
      const childrenJ = await fetchJson(`/api/children`, headers);
      if (childrenJ?.ok && Array.isArray(childrenJ.items)) {
        const list = (childrenJ.items as any[]).map((c) => ({
          id: String(c.id),
          name: String(c.name ?? ''),
          birth_year: Number(c.birth_year ?? currentYear()),
          lifetime_contrib_to_date: num(c.lifetime_contrib_to_date),
          cesg_received_to_date: num(c.cesg_received_to_date),
        })) as Child[];
        setChildren(list);
      }

      // accounts
      const accountsJ = await fetchJson(`/api/accounts`, headers);
      if (accountsJ?.ok && Array.isArray(accountsJ.items)) {
        setAccounts(accountsJ.items as Account[]);
      }
    })();
  }, [token]);

  const monthsLeft = monthsLeftThisYear();
  const childCount = children?.length ?? 0;
  const hasRespAccount = (accounts ?? []).some(
    (a) => String(a.type).toUpperCase() === 'RESP'
  );

  // remaining TFSA/RRSP for THIS year (based on Room + Progress)
  const remaining = useMemo(() => {
    const tfsaRoom = num(rooms?.tfsa);
    const rrspRoom = num(rooms?.rrsp);
    const tfsaDep = num(progress?.tfsa_deposited);
    const rrspDep = num(progress?.rrsp_deposited);

    return {
      tfsa: Math.max(0, tfsaRoom - tfsaDep),
      rrsp: Math.max(0, rrspRoom - rrspDep),
    };
  }, [rooms, progress]);

  // RESP: compute TOTAL grantable contribution remaining THIS year across all children,
  // respecting per-child annual caps and lifetime caps, with simple catch-up.
  const respGrantableThisYear = useMemo(() => {
    if (childCount === 0) return 0;

    const totalRespDeposited = num(progress?.resp_deposited);
    // If we don't know per-child progress, apportion equally (simple v1 approach)
    const perChildDepositedThisYear = totalRespDeposited / childCount;

    let sumRemaining = 0;

    for (const child of children) {
      const lifetimeContrib = num(child.lifetime_contrib_to_date);
      const cesgToDate = num(child.cesg_received_to_date);

      const lifetimeContribLeft = Math.max(0, RESP_LIFETIME_CONTRIB_CAP - lifetimeContrib);
      const lifetimeGrantLeft = Math.max(0, CESG_LIFETIME_CAP - cesgToDate);

      if (lifetimeContribLeft <= 0 || lifetimeGrantLeft <= 0) {
        // Hit lifetime caps: nothing grantable for this child
        continue;
      }

      const catchup = allowCatchupForChild(child);
      const perYearCapByRule = catchup ? MAX_GRANTABLE_PER_YEAR : BASE_PER_YEAR_CONTRIB;

      // Also cap by lifetime grant left converted to contribution units (20% match)
      const perYearCapByGrantHeadroom = Math.min(perYearCapByRule, lifetimeGrantLeft / 0.2);

      // And cap by lifetime contribution remaining for the child
      const perYearCap = Math.max(0, Math.min(perYearCapByGrantHeadroom, lifetimeContribLeft));

      // This year's remaining for this child:
      const remainingForChild = Math.max(0, perYearCap - perChildDepositedThisYear);

      sumRemaining += remainingForChild;
    }

    return sumRemaining; // dollars of contribution that still earn grant (this year)
  }, [children, childCount, progress?.resp_deposited]);

  // monthly split (RESP -> TFSA -> RRSP -> Margin)
  const split = useMemo(() => {
    let left = pledge;
    const out = { resp: 0, tfsa: 0, rrsp: 0, margin: 0 };

    // RESP first (only if there's an RESP account; if not, we just show a nudge)
    if (hasRespAccount && respGrantableThisYear > 0 && left > 0) {
      const respCapPerMonth = Math.ceil(respGrantableThisYear / monthsLeft);
      const amt = Math.min(left, respCapPerMonth);
      out.resp = amt;
      left -= amt;
    }

    // TFSA next
    if (remaining.tfsa > 0 && left > 0) {
      const tfsaCapPerMonth = Math.ceil(remaining.tfsa / monthsLeft);
      const amt = Math.min(left, tfsaCapPerMonth);
      out.tfsa = amt;
      left -= amt;
    }

    // RRSP next
    if (remaining.rrsp > 0 && left > 0) {
      const rrspCapPerMonth = Math.ceil(remaining.rrsp / monthsLeft);
      const amt = Math.min(left, rrspCapPerMonth);
      out.rrsp = amt;
      left -= amt;
    }

    // remainder to margin
    if (left > 0) out.margin = left;

    return out;
  }, [pledge, monthsLeft, remaining, hasRespAccount, respGrantableThisYear]);

  // If user mentions kids in notes but has no RESP account → show a nudge
  const mentionKidsInText = /\b(child|children|kid|kids)\b/i.test(text);
  const showRespNudge = mentionKidsInText && !hasRespAccount && childCount > 0;

  // mic toggle (with interim + final handling)
  const recRef = useRef<any>(null);
  const interimRef = useRef('');
  const lastFinalRef = useRef('');
  const toggleMic = () => {
    if (isMicOn) {
      try {
        recRef.current?.stop();
      } catch {}
      recRef.current = null;
      setIsMicOn(false);
      return;
    }
    const SR =
      (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) {
      alert('Speech recognition not supported.');
      return;
    }
    const rec = new SR();
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
    recRef.current = rec;
    rec.start();
    setIsMicOn(true);
  };

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

  // RESP tile visible if RESP account exists OR child exists
  const showRespTile = childCount > 0 || hasRespAccount;

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
          {new Date().toLocaleString(undefined, { month: 'long', year: 'numeric' })}{' '}
          ({monthsLeft} {monthsLeft === 1 ? 'month' : 'months'} left this year).
        </div>
      </section>

      {/* Recommendation tiles */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        {showRespNudge && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            You mentioned children but don’t have an RESP account yet. Add one on the Accounts page
            to start allocating and earning CESG.
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {showRespTile && (
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-600 mb-1">RESP</div>
              <div className="text-2xl font-semibold">{CAD(split.resp)}</div>
              <div className="text-[11px] text-gray-500 mt-1">
                Grantable remaining this year across children: {CAD(respGrantableThisYear)}
              </div>
              {!hasRespAccount && (
                <div className="text-[11px] text-amber-700 mt-1">
                  No RESP account yet — allocation held at $0 until you add one.
                </div>
              )}
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

      {/* Mic + Notes (original UI with mic icon) */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">Describe your goals</div>
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={toggleMic}
            className={`rounded p-2 ${isMicOn ? 'bg-red-600' : 'bg-emerald-600'} text-white`}
            title={isMicOn ? 'Stop mic' : 'Start mic'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
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
          className="w-full min-h-[140px] rounded-lg border p-3 outline-none"
          placeholder="Speak or type your plan..."
        />
        <div className="mt-2 text-xs text-gray-500">
          Your microphone text appears live while you speak. Click “Save note” to keep a record
          below. (Notes are stored in your browser for now.)
        </div>
      </section>

      {/* Past notes */}
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

function cryptoId() {
  return 'id-' + Math.random().toString(36).slice(2);
}
