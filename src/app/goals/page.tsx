'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';

// ===== visible tag so we can confirm the file version is live =====
const FILE_TAG = 'GOALS_DIAG_V1';

// ---- helpers ----
const CAD = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

const now = () => new Date();
const currentYear = () => now().getFullYear();
const monthsLeftThisYear = () => Math.max(1, 12 - now().getMonth());

type Rooms = { tfsa: number; rrsp: number; year: number };
type Progress = { tfsa_deposited?: number; rrsp_deposited?: number; resp_deposited?: number; year: number };
type Child = { id: string; name: string };
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
  try { if (typeof window !== 'undefined') window.localStorage.setItem(k, JSON.stringify(v)); } catch {}
}
const num = (x: any) => (Number.isFinite(Number(x)) ? Number(x) : 0);

async function fetchJson(url: string, headers: Record<string, string>) {
  try {
    const r = await fetch(url, { headers });
    return await r.json();
  } catch (e) {
    console.error('fetchJson error', url, e);
    return null;
  }
}

export default function GoalsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  // UI state you already had (defaults preserved)
  const [pledge, setPledge] = useState<number>(() => loadLS('goals.pledge', 1000));
  useEffect(() => saveLS('goals.pledge', pledge), [pledge]);

  // fetched state
  const [rooms, setRooms] = useState<Rooms | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // mic + notes (kept same behavior)
  const [isMicOn, setIsMicOn] = useState(false);
  const [text, setText] = useState('');
  const [notes, setNotes] = useState<Array<{ id: string; ts: string; text: string }>>(
    () => loadLS('goals.notes', [])
  );
  useEffect(() => saveLS('goals.notes', notes), [notes]);

  // fetch everything on token
  useEffect(() => {
    if (!token) return;
    const headers = { authorization: `Bearer ${token}` };
    const yr = currentYear();

    (async () => {
      // rooms
      const roomJ = (await fetchJson(`/api/rooms?year=${yr}`, headers)) ?? (await fetchJson(`/api/rooms`, headers));
      const roomsParsed: Rooms = {
        tfsa: num(roomJ?.tfsa ?? roomJ?.data?.tfsa),
        rrsp: num(roomJ?.rrsp ?? roomJ?.data?.rrsp),
        year: yr,
      };
      setRooms(roomsParsed);

      // progress
      const progJ =
        (await fetchJson(`/api/rooms/progress?year=${yr}`, headers)) ??
        (await fetchJson(`/api/rooms/progress`, headers));
      const progressParsed: Progress = {
        tfsa_deposited: num(progJ?.tfsa_deposited),
        rrsp_deposited: num(progJ?.rrsp_deposited),
        resp_deposited: num(progJ?.resp_deposited),
        year: yr,
      };
      setProgress(progressParsed);

      // children
      const childrenJ = await fetchJson(`/api/children`, headers);
      const kids = childrenJ?.ok && Array.isArray(childrenJ.items) ? (childrenJ.items as Child[]) : [];
      setChildren(kids);

      // accounts
      const accountsJ = await fetchJson(`/api/accounts`, headers);
      const accs = accountsJ?.ok && Array.isArray(accountsJ.items) ? (accountsJ.items as Account[]) : [];
      setAccounts(accs);

      // LOG everything so we can see it
      console.log('[GOALS] FILE_TAG:', FILE_TAG);
      console.log('[GOALS] rooms raw:', roomJ, 'parsed:', roomsParsed);
      console.log('[GOALS] progress raw:', progJ, 'parsed:', progressParsed);
      console.log('[GOALS] children raw:', childrenJ, 'parsed:', kids);
      console.log('[GOALS] accounts raw:', accountsJ, 'parsed:', accs);
    })();
  }, [token]);

  const monthsLeft = monthsLeftThisYear();
  const childCount = children?.length ?? 0;
  const hasRespAccount = accounts.some(a => String(a.type).toUpperCase() === 'RESP');
  const showRespTile = childCount > 0 || hasRespAccount;

  // remaining
  const remaining = useMemo(() => {
    const tfsaRoom = num(rooms?.tfsa);
    const rrspRoom = num(rooms?.rrsp);
    const tfsaDep = num(progress?.tfsa_deposited);
    const rrspDep = num(progress?.rrsp_deposited);
    const respDep = num(progress?.resp_deposited);
    const respTarget = childCount * 2500;
    const respRem = Math.max(0, respTarget - respDep);
    return {
      tfsa: Math.max(0, tfsaRoom - tfsaDep),
      rrsp: Math.max(0, rrspRoom - rrspDep),
      resp: respRem,
    };
  }, [rooms, progress, childCount]);

  // split (kept simple just for diagnosing)
  const split = useMemo(() => {
    let left = pledge;
    const out = { resp: 0, tfsa: 0, rrsp: 0, margin: 0 };
    const capPerMonth = (room: number) => Math.ceil(room / monthsLeft);

    if (childCount > 0 && remaining.resp > 0 && left > 0) {
      const cap = capPerMonth(remaining.resp);
      const amt = Math.min(left, cap);
      out.resp = amt;
      left -= amt;
    }
    if (remaining.tfsa > 0 && left > 0) {
      const cap = capPerMonth(remaining.tfsa);
      const amt = Math.min(left, cap);
      out.tfsa = amt;
      left -= amt;
    }
    if (remaining.rrsp > 0 && left > 0) {
      const cap = capPerMonth(remaining.rrsp);
      const amt = Math.min(left, cap);
      out.rrsp = amt;
      left -= amt;
    }
    if (left > 0) out.margin = left;

    console.log('[GOALS] monthsLeft:', monthsLeft, 'remaining:', remaining, 'pledge:', pledge, 'split:', out);
    return out;
  }, [pledge, monthsLeft, remaining, childCount]);

  // mic (unchanged; just the minimal working)
  const recRef = useRef<any>(null);
  const interimRef = useRef('');
  const lastFinalRef = useRef('');
  const toggleMic = () => {
    if (isMicOn) {
      try { recRef.current?.stop(); } catch {}
      recRef.current = null;
      setIsMicOn(false);
      return;
    }
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) { alert('Speech recognition not supported.'); return; }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (ev: any) => {
      let finalChunk = ''; let interimChunk = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i]; const t = res[0]?.transcript ?? '';
        if (res.isFinal) finalChunk += t; else interimChunk += t;
      }
      if (finalChunk && finalChunk !== lastFinalRef.current) {
        lastFinalRef.current = finalChunk;
        setText(p => (p + ' ' + finalChunk).trim());
        interimRef.current = '';
      }
      if (interimChunk && interimChunk !== interimRef.current) {
        interimRef.current = interimChunk;
        setText(p => (p + ' ' + interimChunk).trim());
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
    const id = 'id-' + Math.random().toString(36).slice(2);
    const ts = new Date().toISOString();
    setNotes(arr => [{ id, ts, text: t }, ...arr]);
    setText('');
    lastFinalRef.current = '';
    interimRef.current = '';
  };
  const deleteNote = (id: string) => setNotes(arr => arr.filter(n => n.id !== id));

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      {/* header */}
      <div className="text-xs text-gray-500">Goals • {FILE_TAG}</div>

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
          Recommendation is specific to{' '}
          {new Date().toLocaleString(undefined, { month: 'long', year: 'numeric' })}{' '}
          ({monthsLeft} {monthsLeft === 1 ? 'month' : 'months'} left this year).
        </div>
      </section>

      {/* Recommendation tiles */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {(childCount > 0 || hasRespAccount) && (
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
            <div className="text-[11px] text-gray-500 mt-1">Remaining this year: {CAD(remaining.tfsa)}</div>
          </div>
          <div className="rounded-xl border p-4">
            <div className="text-xs text-gray-600 mb-1">RRSP</div>
            <div className="text-2xl font-semibold">{CAD(split.rrsp)}</div>
            <div className="text-[11px] text-gray-500 mt-1">Remaining this year: {CAD(remaining.rrsp)}</div>
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
            title={isMicOn ? 'Stop mic' : 'Start mic'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" stroke="currentColor" strokeWidth="1.8" />
              <path d="M19 11a7 7 0 0 1-14 0M12 18v3" stroke="currentColor" strokeWidth="1.8" />
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
          Your microphone text appears live while you speak. Click “Save note” to keep a record below.
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
                  <button onClick={() => deleteNote(n.id)} className="text-xs text-red-600 hover:underline">
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

      {/* === DEBUG OVERLAY === */}
      <section className="rounded-2xl border bg-amber-50 p-4 text-xs">
        <div className="font-semibold mb-2">Debug ({FILE_TAG})</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <pre className="overflow-auto p-2 bg-white border rounded">rooms: {JSON.stringify(rooms, null, 2)}</pre>
          <pre className="overflow-auto p-2 bg-white border rounded">progress: {JSON.stringify(progress, null, 2)}</pre>
          <pre className="overflow-auto p-2 bg-white border rounded">children: {JSON.stringify(children, null, 2)}</pre>
          <pre className="overflow-auto p-2 bg-white border rounded">accounts: {JSON.stringify(accounts, null, 2)}</pre>
          <pre className="overflow-auto p-2 bg-white border rounded">
            remaining: {JSON.stringify(
              (function() {
                const tfsaRoom = num(rooms?.tfsa);
                const rrspRoom = num(rooms?.rrsp);
                const tfsaDep = num(progress?.tfsa_deposited);
                const rrspDep = num(progress?.rrsp_deposited);
                const respDep = num(progress?.resp_deposited);
                const respTarget = (children?.length ?? 0) * 2500;
                return {
                  monthsLeft: monthsLeftThisYear(),
                  tfsaRoom, rrspRoom, tfsaDep, rrspDep, respDep, respTarget
                };
              })(),
              null,
              2
            )}
          </pre>
          <pre className="overflow-auto p-2 bg-white border rounded">pledge: {pledge}</pre>
        </div>
      </section>
    </main>
  );
}
