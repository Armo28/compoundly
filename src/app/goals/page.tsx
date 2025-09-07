'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';

type Rooms = { year: number; tfsa: number; rrsp: number };

type Account = {
  id: string;
  type: string;                 // 'TFSA' | 'RRSP' | 'RESP' | ...
  name?: string;
  balance?: number;
  is_family_resp?: boolean | null;
  children_covered?: number | null;
};

type RespProgress = {
  total_value?: number | null;
  lifetime_contrib?: number | null;
  contributed_this_year?: number | null;
  is_family_resp?: boolean | null;
  children_covered?: number | null;
};

const CAD = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

const monthsLeftThisYear = () => Math.max(1, 12 - new Date().getMonth());

// ---------------- CESG math helpers ----------------

const PER_CHILD_LIFETIME_CONTRIB_CAP = 50_000;
const PER_CHILD_LIFETIME_GRANT_CAP = 7_200;
const PER_CHILD_GRANTABLE_THIS_YEAR_MAX = 5_000;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Remaining *grantable* contribution for this year across all children. O(1), no Array.from */
function grantableRemainingThisYear(children: number, lifetimeContrib: number, contributedThisYear: number): number {
  if (children <= 0) return 0;

  // Approximate per-child contributions uniformly.
  const perChildLifetimeContrib = lifetimeContrib / children;
  const perChildGrantSoFar = clamp(0.2 * perChildLifetimeContrib, 0, PER_CHILD_LIFETIME_GRANT_CAP);

  // Uniform model ⇒ either all are still grant-eligible or none are.
  const grantableChildren = perChildGrantSoFar < PER_CHILD_LIFETIME_GRANT_CAP ? children : 0;
  if (grantableChildren === 0) return 0;

  const yearMaxAllKids = grantableChildren * PER_CHILD_GRANTABLE_THIS_YEAR_MAX;
  const usedAgainstGrant = clamp(contributedThisYear, 0, yearMaxAllKids);
  return Math.max(0, yearMaxAllKids - usedAgainstGrant);
}

function respLifetimeRemaining(children: number, lifetimeContrib: number): number {
  return Math.max(0, children * PER_CHILD_LIFETIME_CONTRIB_CAP - lifetimeContrib);
}

function cesgLifetimeReached(children: number, lifetimeContrib: number): boolean {
  const perChildGrant = clamp(0.2 * (lifetimeContrib / Math.max(1, children)), 0, PER_CHILD_LIFETIME_GRANT_CAP);
  return perChildGrant >= PER_CHILD_LIFETIME_GRANT_CAP;
}

// ---------------------------------------------------

export default function GoalsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  const [pledge, setPledge] = useState<number>(() => {
    try { return Number(localStorage.getItem('goals.pledge') ?? 1000); } catch { return 1000; }
  });
  useEffect(() => { try { localStorage.setItem('goals.pledge', String(pledge)); } catch {} }, [pledge]);

  const authHeaders: HeadersInit = token ? { authorization: `Bearer ${token}` } : {};

  const [rooms, setRooms] = useState<Rooms | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [resp, setResp] = useState<RespProgress | null>(null);

  // mic + notes (icon-only)
  const [isMicOn, setIsMicOn] = useState(false);
  const [text, setText] = useState('');
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
      let finalChunk = '', interimChunk = '';
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

  // fetch
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const r1 = await fetch('/api/rooms', { headers: authHeaders });
        const j1 = await r1.json();
        const room = j1?.room ?? j1?.data ?? null;
        if (room) setRooms(room as Rooms);
      } catch {}

      try {
        const r2 = await fetch('/api/accounts', { headers: authHeaders });
        const j2 = await r2.json();
        if (Array.isArray(j2?.items)) setAccounts(j2.items as Account[]);
      } catch {}

      try {
        const r3 = await fetch('/api/resp-progress', { headers: authHeaders });
        const j3 = await r3.json();
        if (j3?.ok && j3?.data) {
          const d = j3.data as RespProgress;
          setResp({
            total_value: Number(d.total_value ?? 0),
            lifetime_contrib: Number(d.lifetime_contrib ?? 0),
            contributed_this_year: Number(d.contributed_this_year ?? 0),
            is_family_resp: !!d.is_family_resp,
            children_covered: Number(d.children_covered ?? 1),
          });
        }
      } catch {}
    })();
  }, [token]);

  // RESP visibility & children
  const hasRespAccount = useMemo(
    () => accounts.some(a => (a.type || '').toUpperCase() === 'RESP'),
    [accounts]
  );

  const respChildren = useMemo(() => {
    if (resp) return Math.max(1, Number(resp.children_covered || 1));
    const respLines = accounts.filter(a => (a.type || '').toUpperCase() === 'RESP');
    if (respLines.length === 0) return 0;
    const anyFamily = respLines.some(a => !!a.is_family_resp);
    const kids = respLines.reduce((acc, a) => acc + (a.is_family_resp ? Math.max(1, Number(a.children_covered || 1)) : 1), 0);
    return anyFamily ? Math.max(1, kids) : 1;
  }, [resp, accounts]);

  const showRespTile = hasRespAccount || !!resp;

  // remaining rooms
  const tfsaRemaining = Math.max(0, Number(rooms?.tfsa ?? 0));
  const rrspRemaining = Math.max(0, Number(rooms?.rrsp ?? 0));

  // RESP remaining (grant path + lifetime)
  const grantRem = useMemo(() => {
    if (!respChildren || !resp) return 0;
    return grantableRemainingThisYear(
      respChildren,
      Number(resp.lifetime_contrib || 0),
      Number(resp.contributed_this_year || 0)
    );
  }, [respChildren, resp]);

  const lifetimeRem = useMemo(() => {
    if (!respChildren || !resp) return 0;
    return respLifetimeRemaining(respChildren, Number(resp.lifetime_contrib || 0));
  }, [respChildren, resp]);

  // Pledge split
  const monthsLeft = monthsLeftThisYear();
  const capPerMonth = (room: number) => Math.ceil(room / monthsLeft);

  const split = useMemo(() => {
    let left = pledge;
    const out = { resp: 0, tfsa: 0, rrsp: 0, margin: 0 };

    // 1) RESP grant path
    if (grantRem > 0) {
      const amt = Math.min(left, capPerMonth(grantRem));
      out.resp += amt; left -= amt;
    }

    // 2) TFSA, 3) RRSP
    if (tfsaRemaining > 0) {
      const amt = Math.min(left, capPerMonth(tfsaRemaining));
      out.tfsa += amt; left -= amt;
    }
    if (rrspRemaining > 0) {
      const amt = Math.min(left, capPerMonth(rrspRemaining));
      out.rrsp += amt; left -= amt;
    }

    // 4) RESP to lifetime cap
    if (lifetimeRem > 0 && left > 0) {
      const amt = Math.min(left, capPerMonth(lifetimeRem));
      out.resp += amt; left -= amt;
    }

    // 5) Margin
    if (left > 0) out.margin = left;

    return out;
  }, [pledge, monthsLeft, grantRem, tfsaRemaining, rrspRemaining, lifetimeRem]);

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
          Recommendation is specific to {new Date().toLocaleString(undefined, { month: 'long', year: 'numeric' })}{' '}
          ({monthsLeft} {monthsLeft === 1 ? 'month' : 'months'} left this year).
        </div>
      </section>

      {/* Tiles */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {showRespTile && (
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-600 mb-1">RESP</div>
              <div className="text-2xl font-semibold">{CAD(split.resp)}</div>
              <div className="text-[11px] text-gray-500 mt-1">
                Grant path remaining (this year): {CAD(grantRem)}
              </div>
              {resp && (
                <div className="text-[11px] text-gray-500">
                  Lifetime contribution room left: {CAD(lifetimeRem)}
                </div>
              )}
            </div>
          )}
          <div className="rounded-xl border p-4">
            <div className="text-xs text-gray-600 mb-1">TFSA</div>
            <div className="text-2xl font-semibold">{CAD(split.tfsa)}</div>
            <div className="text-[11px] text-gray-500 mt-1">Remaining this year: {CAD(tfsaRemaining)}</div>
          </div>
          <div className="rounded-xl border p-4">
            <div className="text-xs text-gray-600 mb-1">RRSP</div>
            <div className="text-2xl font-semibold">{CAD(split.rrsp)}</div>
            <div className="text-[11px] text-gray-500 mt-1">Remaining this year: {CAD(rrspRemaining)}</div>
          </div>
          <div className="rounded-xl border p-4">
            <div className="text-xs text-gray-600 mb-1">Margin/Other</div>
            <div className="text-2xl font-semibold">{CAD(split.margin)}</div>
          </div>
        </div>
        <div className="mt-3 text-xs text-gray-500">
          Order: RESP (up to grant path and lifetime caps) → TFSA → RRSP → remainder to Margin/Other.
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
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M19 11a7 7 0 0 1-14 0M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button className="rounded bg-indigo-600 px-3 py-2 text-white">Save note</button>
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
