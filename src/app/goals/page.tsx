'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';

type Account = {
  id: string;
  name: string;
  type: string;
  balance: number;
  is_family_resp?: boolean;
  children_covered?: number;
};
type RespProgress = { year: number; deposited_year: number; deposited_total: number };

const CAD = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

const monthsLeftThisYear = () => Math.max(1, 12 - new Date().getMonth());

function useLS<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try {
      if (typeof window === 'undefined') return initial;
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') localStorage.setItem(key, JSON.stringify(v));
    } catch {}
  }, [key, v]);
  return [v, setV] as const;
}

export default function GoalsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  const authHeaders = useMemo<HeadersInit | undefined>(
    () => (token ? { authorization: `Bearer ${token}` } : undefined),
    [token]
  );

  const [pledge, setPledge] = useLS<number>('goals.pledge', 1000);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [respProg, setRespProg] = useState<RespProgress | null>(null);

  // mic + notes
  const [isMicOn, setIsMicOn] = useState(false);
  const [text, setText] = useLS<string>('goals.text', '');
  const [notes, setNotes] = useLS<Array<{ id: string; ts: string; text: string }>>(
    'goals.notes',
    []
  );
  const recRef = useRef<any>(null);
  const interimRef = useRef('');

  useEffect(() => {
    if (!authHeaders) return;
    (async () => {
      const r1 = await fetch('/api/accounts', { headers: authHeaders });
      const j1 = await r1.json();
      if (j1?.ok) setAccounts(j1.items ?? []);

      const r2 = await fetch('/api/resp-progress', { headers: authHeaders });
      const j2 = await r2.json();
      if (j2?.ok) setRespProg(j2);
    })();
  }, [authHeaders]);

  const childrenCovered = useMemo(
    () =>
      (accounts || [])
        .filter((a) => String(a.type).toUpperCase() === 'RESP')
        .reduce((sum, a) => {
          const kids = a.is_family_resp ? Math.max(1, Number(a.children_covered || 1)) : 1;
          return sum + kids;
        }, 0),
    [accounts]
  );
  const hasResp = childrenCovered > 0;

  const monthsLeft = monthsLeftThisYear();
  const RESP_ANNUAL = 2500;
  const RESP_LIFETIME = 50000;

  const respRemainingYear = Math.max(
    0,
    childrenCovered * RESP_ANNUAL - Number(respProg?.deposited_year || 0)
  );
  const respRemainingLifetime = Math.max(
    0,
    childrenCovered * RESP_LIFETIME - Number(respProg?.deposited_total || 0)
  );

  // TODO: wire real TFSA/RRSP “remaining room” once those APIs are in place
  const tfsaRemaining = 0;
  const rrspRemaining = 0;

  const split = useMemo(() => {
    let left = pledge;
    const out = { resp: 0, tfsa: 0, rrsp: 0, margin: 0 };

    if (hasResp && left > 0) {
      const perMonthCap = Math.ceil(respRemainingYear / monthsLeft);
      const lifeCap = Math.max(0, respRemainingLifetime);
      const cap = Math.min(perMonthCap, lifeCap);
      const amt = Math.min(left, Math.max(0, cap));
      out.resp = amt;
      left -= amt;
    }

    if (tfsaRemaining > 0 && left > 0) {
      const cap = Math.ceil(tfsaRemaining / monthsLeft);
      const amt = Math.min(left, cap);
      out.tfsa = amt;
      left -= amt;
    }

    if (rrspRemaining > 0 && left > 0) {
      const cap = Math.ceil(rrspRemaining / monthsLeft);
      const amt = Math.min(left, cap);
      out.rrsp = amt;
      left -= amt;
    }

    if (left > 0) out.margin = left;
    return out;
  }, [pledge, hasResp, monthsLeft, respRemainingYear, respRemainingLifetime, tfsaRemaining, rrspRemaining]);

  // mic
  const toggleMic = () => {
    if (isMicOn) {
      try {
        recRef.current?.stop();
      } catch {}
      recRef.current = null;
      setIsMicOn(false);
      return;
    }
    const SR: any = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) {
      alert('Speech recognition not supported on this browser.');
      return;
    }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (ev: any) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const chunk = res[0]?.transcript ?? '';
        if (res.isFinal) setText((p) => (p + ' ' + chunk).trim());
        else interim += chunk;
      }
      interimRef.current = interim;
    };
    rec.onend = () => setIsMicOn(false);
    rec.onerror = () => setIsMicOn(false);
    recRef.current = rec;
    rec.start();
    setIsMicOn(true);
  };

  const saveNote = () => {
    const t = (text + (interimRef.current ? ' ' + interimRef.current : '')).trim();
    if (!t) return;
    setNotes((n) => [{ id: cryptoId(), ts: new Date().toISOString(), text: t }, ...n]);
    setText('');
    interimRef.current = '';
  };

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
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
          {new Date().toLocaleString(undefined, { month: 'long', year: 'numeric' })} (
          {monthsLeft} {monthsLeft === 1 ? 'month' : 'months'} left this year).
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {hasResp && (
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-600 mb-1">RESP</div>
              <div className="text-2xl font-semibold">{CAD(split.resp)}</div>
              <div className="text-[11px] text-gray-500 mt-1">
                Remaining this year: {CAD(respRemainingYear)} · Lifetime left: {CAD(respRemainingLifetime)}
              </div>
            </div>
          )}
          <div className="rounded-xl border p-4">
            <div className="text-xs text-gray-600 mb-1">TFSA</div>
            <div className="text-2xl font-semibold">{CAD(split.tfsa)}</div>
          </div>
          <div className="rounded-xl border p-4">
            <div className="text-xs text-gray-600 mb-1">RRSP</div>
            <div className="text-2xl font-semibold">{CAD(split.rrsp)}</div>
          </div>
          <div className="rounded-xl border p-4">
            <div className="text-xs text-gray-600 mb-1">Margin/Other</div>
            <div className="text-2xl font-semibold">{CAD(split.margin)}</div>
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-2">
          Order: RESP (up to caps) → TFSA → RRSP → remainder to Margin/Other.
        </div>
      </section>

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
          Your microphone text appears live while you speak. Click “Save note” to keep a record below.
        </div>
      </section>

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
                    onClick={() => setNotes((arr) => arr.filter((x) => x.id !== n.id))}
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
