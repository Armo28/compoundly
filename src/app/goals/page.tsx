'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';

// ------------ helpers ------------
const CAD = (n: number) =>
  n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  });

const now = () => new Date();
const currentYear = () => now().getFullYear();
/** Months remaining in the current year, including this month. Minimum 1. */
function monthsLeftThisYear(d = now()) {
  return Math.max(1, 12 - d.getMonth());
}
const num = (x: any) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

type Rooms = { tfsa: number; rrsp: number; year: number };
type Progress = {
  tfsa_deposited?: number;
  rrsp_deposited?: number;
  resp_deposited?: number;
  year: number;
};
type Child = { id: string; name: string; birth_year?: number };
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

// ------------ page ------------
export default function GoalsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  // Pledge slider (persisted where the user left it)
  const [pledge, setPledge] = useState<number>(() => loadLS('goals.pledge', 1000));
  useEffect(() => saveLS('goals.pledge', pledge), [pledge]);

  const [rooms, setRooms] = useState<Rooms | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Mic + notes
  const [isMicOn, setIsMicOn] = useState(false);
  const [finalText, setFinalText] = useState('');   // committed text
  const [interim, setInterim] = useState('');       // live-only text (not saved)
  const [notes, setNotes] = useState<Array<{ id: string; ts: string; text: string }>>(
    () => loadLS('goals.notes', [])
  );
  useEffect(() => saveLS('goals.notes', notes), [notes]);

  // Load server data
  useEffect(() => {
    if (!token) return;
    const headers = { authorization: `Bearer ${token}` };
    const yr = currentYear();

    (async () => {
      // Rooms: accept {room:{tfsa,rrsp}} or {tfsa,rrsp}
      const roomsResp =
        (await fetchJson(`/api/rooms?year=${yr}`, headers)) ??
        (await fetchJson(`/api/rooms`, headers));
      const roomObj = roomsResp?.room ?? roomsResp?.data ?? roomsResp ?? {};
      setRooms({
        tfsa: num(roomObj?.tfsa),
        rrsp: num(roomObj?.rrsp),
        year: yr,
      });

      // Progress: accept {progress:{...}} or {...}
      const progResp =
        (await fetchJson(`/api/rooms/progress?year=${yr}`, headers)) ??
        (await fetchJson(`/api/rooms/progress`, headers));
      const progObj = progResp?.progress ?? progResp?.data ?? progResp ?? {};
      setProgress({
        tfsa_deposited: num(progObj?.tfsa_deposited),
        rrsp_deposited: num(progObj?.rrsp_deposited),
        resp_deposited: num(progObj?.resp_deposited),
        year: yr,
      });

      // Children
      const childrenResp = await fetchJson(`/api/children`, headers);
      if (childrenResp?.ok && Array.isArray(childrenResp.items)) {
        setChildren(childrenResp.items as Child[]);
      } else {
        setChildren([]);
      }

      // Accounts
      const accountsResp = await fetchJson(`/api/accounts`, headers);
      if (accountsResp?.ok && Array.isArray(accountsResp.items)) {
        setAccounts(accountsResp.items as Account[]);
      } else {
        setAccounts([]);
      }
    })();
  }, [token]);

  // Derived
  const monthsLeft = monthsLeftThisYear();
  const childCount = children?.length ?? 0;

  // Robust RESP detection (any account whose type contains "RESP")
  const hasRespAccount = useMemo(
    () => (accounts ?? []).some((a) => String(a.type || '').toUpperCase().includes('RESP')),
    [accounts]
  );

  // Remaining registered room this year (what's left to fill)
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

  // RESP grantable this year (simple, fungible family RESP logic):
  // If there are children, we target $2,500 per child per year (base grantable)
  // and subtract what's been deposited YTD across RESP accounts.
  const respGrantableThisYear = useMemo(() => {
    if (childCount <= 0) return 0;
    const basePerYear = 2500 * childCount;
    const depositedYTD = num(progress?.resp_deposited);
    return Math.max(0, basePerYear - depositedYTD);
  }, [childCount, progress?.resp_deposited]);

  // Monthly split (RESP -> TFSA -> RRSP -> Margin)
  const split = useMemo(() => {
    let left = pledge;
    const out = { resp: 0, tfsa: 0, rrsp: 0, margin: 0 };

    // RESP first (only allocate if an RESP account exists; otherwise show tile with $0)
    if (hasRespAccount && respGrantableThisYear > 0 && left > 0) {
      const capPerMonth = Math.ceil(respGrantableThisYear / monthsLeft);
      const amt = Math.min(left, capPerMonth);
      out.resp = amt;
      left -= amt;
    }

    // TFSA next
    if (remaining.tfsa > 0 && left > 0) {
      const capPerMonth = Math.ceil(remaining.tfsa / monthsLeft);
      const amt = Math.min(left, capPerMonth);
      out.tfsa = amt;
      left -= amt;
    }

    // RRSP next
    if (remaining.rrsp > 0 && left > 0) {
      const capPerMonth = Math.ceil(remaining.rrsp / monthsLeft);
      const amt = Math.min(left, capPerMonth);
      out.rrsp = amt;
      left -= amt;
    }

    // remainder to Margin
    if (left > 0) out.margin = left;

    return out;
  }, [pledge, monthsLeft, remaining, hasRespAccount, respGrantableThisYear]);

  // Nudge: user mentions kids but has no RESP account set up yet
  const mentionKidsInText = /\b(child|children|kid|kids)\b/i.test(finalText);
  const showRespNudge = mentionKidsInText && !hasRespAccount && childCount > 0;

  // --- Microphone (final vs interim) ---
  const recRef = useRef<any>(null);
  const lastFinalRef = useRef('');
  const toggleMic = () => {
    if (isMicOn) {
      try {
        recRef.current?.stop();
      } catch {}
      recRef.current = null;
      setIsMicOn(false);
      setInterim('');
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
      // Commit finals exactly once, show interim live-only (prevents duplicates/lag)
      if (finalChunk && finalChunk !== lastFinalRef.current) {
        lastFinalRef.current = finalChunk;
        setFinalText((p) => (p ? (p + ' ' + finalChunk).trim() : finalChunk.trim()));
        setInterim('');
      } else {
        setInterim(interimChunk);
      }
    };
    rec.onend = () => {
      setIsMicOn(false);
      setInterim('');
    };
    rec.onerror = () => {
      setIsMicOn(false);
      setInterim('');
    };
    recRef.current = rec;
    rec.start();
    setIsMicOn(true);
  };

  // Notes
  const saveNote = () => {
    const t = (finalText + (interim ? ' ' + interim : '')).trim();
    if (!t) return;
    const id = 'id-' + Math.random().toString(36).slice(2);
    const ts = new Date().toISOString();
    setNotes((arr) => [{ id, ts, text: t }, ...arr]);
    setFinalText('');
    setInterim('');
    lastFinalRef.current = '';
  };
  const deleteNote = (id: string) => setNotes((arr) => arr.filter((n) => n.id !== id));

  // RESP tile is visible if there are children OR an RESP account
  const showRespTile = childCount > 0 || hasRespAccount;

  // Displayed text in textarea = finals + live interim
  const displayText = (finalText + (interim ? ' ' + interim : '')).trim();

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

      {/* Mic + Notes (unchanged look & feel, mic icon button) */}
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
          value={displayText}
          onChange={(e) => {
            setFinalText(e.target.value);
            setInterim('');
          }}
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
