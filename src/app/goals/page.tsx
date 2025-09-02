'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';

type Rooms = { year: number; tfsa: number; rrsp: number };
type Progress = { year: number; tfsa_deposited?: number; rrsp_deposited?: number; resp_deposited?: number };
type Child = { id: string; name: string; birth_year: number };
type Account = { id: string; name: string; type: 'TFSA' | 'RRSP' | 'RESP' | 'Margin' | 'Other' | 'LIRA'; balance: number };

const CAD = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

const monthYearLabel = (d = new Date()) =>
  d.toLocaleString(undefined, { month: 'long', year: 'numeric' });

/** Safe localStorage get (avoids SSR crashes) */
function lsGetNumber(key: string, fallback: number) {
  try {
    if (typeof window === 'undefined') return fallback;
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

/** Safe localStorage set */
function lsSetNumber(key: string, value: number) {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, String(value));
  } catch {}
}

export default function GoalsPage() {
  const { session, loading } = useAuth();
  const token = session?.access_token ?? '';

  // Persisted pledge slider (defaults: $1000 & 10% — you can show/use rate later if you like)
  const [monthlyPledge, setMonthlyPledge] = useState<number>(() => lsGetNumber('goals_pledge', 1000));
  useEffect(() => { lsSetNumber('goals_pledge', monthlyPledge); }, [monthlyPledge]);

  // Data we need to compute the split
  const [rooms, setRooms] = useState<Rooms | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string>('');

  // Fetch everything when signed in
  useEffect(() => {
    if (!token) return;
    setError('');

    const headers = { authorization: `Bearer ${token}` };

    (async () => {
      try {
        // Rooms (TFSA/RRSP room for the current year)
        const r = await fetch('/api/rooms', { headers });
        const rj = await r.json();
        // Handle either {ok, room} or direct object/array
        const room: Rooms | null =
          rj?.room ??
          (Array.isArray(rj) ? rj[0] : rj) ??
          null;
        setRooms(room);

        // Progress (what’s already deposited this year)
        const p = await fetch('/api/rooms/progress', { headers });
        const pj = await p.json();
        const prog: Progress | null = pj?.progress ?? pj ?? null;
        setProgress(prog);

        // Children
        const c = await fetch('/api/children', { headers });
        const cj = await c.json();
        const kids: Child[] = cj?.children ?? cj ?? [];
        setChildren(Array.isArray(kids) ? kids : []);

        // Accounts (to check if RESP exists)
        const a = await fetch('/api/accounts', { headers });
        const aj = await a.json();
        const accs: Account[] = aj?.accounts ?? aj ?? [];
        setAccounts(Array.isArray(accs) ? accs : []);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load data.');
      }
    })();
  }, [token]);

  // Core allocation logic
  const recommendation = useMemo(() => {
    const now = new Date();
    const monthIdx = now.getMonth(); // 0..11
    const monthsLeftRaw = 12 - monthIdx; // if July (6), this is 6 (Jul-Dec)
    const monthsLeft = Math.max(1, monthsLeftRaw); // never 0 to avoid div by zero
    const yearNow = now.getFullYear();

    const tfsaRoom = Number(rooms?.tfsa ?? 0);
    const rrspRoom = Number(rooms?.rrsp ?? 0);

    const tfsaDeposited = Number(progress?.tfsa_deposited ?? 0);
    const rrspDeposited = Number(progress?.rrsp_deposited ?? 0);

    // Remaining room for THIS year
    const tfsaRemaining = Math.max(0, tfsaRoom - tfsaDeposited);
    const rrspRemaining = Math.max(0, rrspRoom - rrspDeposited);

    // Per-month targets to exactly use up room by year-end
    const tfsaTargetPerMonth = tfsaRemaining / monthsLeft;
    const rrspTargetPerMonth = rrspRemaining / monthsLeft;

    // RESP: aim at $2,500/child/year to get full $500 grant
    // We don’t yet track RESP_deposited YTD in progress; so we target “fresh”
    // and let future versions subtract deposits once tracked.
    const kidCount = children.length;
    const hasRESPAccount = accounts.some(a => a.type === 'RESP');
    const respTargetPerMonthPerChild = 2500 / monthsLeft;
    const respTargetPerMonthTotal = kidCount > 0 ? respTargetPerMonthPerChild * kidCount : 0;

    // Allocate monthly pledge by priority:
    // 1) RESP to maximize grant
    // 2) TFSA up to per-month target
    // 3) RRSP up to per-month target
    // 4) Remainder to Margin/Other
    let remaining = monthlyPledge;
    let toRESP = 0, toTFSA = 0, toRRSP = 0, toMargin = 0;

    if (kidCount > 0 && hasRESPAccount) {
      toRESP = Math.min(remaining, respTargetPerMonthTotal);
      remaining -= toRESP;
    }

    if (tfsaTargetPerMonth > 0 && remaining > 0) {
      toTFSA = Math.min(remaining, tfsaTargetPerMonth);
      remaining -= toTFSA;
    }

    if (rrspTargetPerMonth > 0 && remaining > 0) {
      toRRSP = Math.min(remaining, rrspTargetPerMonth);
      remaining -= toRRSP;
    }

    toMargin = Math.max(0, remaining);

    return {
      labelMonthYear: monthYearLabel(now),
      monthsLeft,
      yearNow,
      toRESP,
      toTFSA,
      toRRSP,
      toMargin,
      kidCount,
      hasRESPAccount,
      tfsaRemaining,
      rrspRemaining,
    };
  }, [rooms, progress, children, accounts, monthlyPledge]);

  if (loading) {
    return (
      <main className="max-w-6xl mx-auto p-4">
        <div className="rounded-xl border bg-white p-6">Loading…</div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="max-w-6xl mx-auto p-4">
        <div className="rounded-xl border bg-white p-6">
          Please sign in to set goals and see recommendations.
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="rounded-xl border bg-white p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <label className="text-sm font-medium">Monthly pledge</label>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 min-w-[80px] text-right">
              {CAD(monthlyPledge)}
            </span>
            <input
              className="w-64 h-2 rounded-lg bg-gray-200 appearance-none accent-blue-600"
              type="range"
              min={0}
              max={10000}
              step={50}
              value={monthlyPledge}
              onChange={(e) => setMonthlyPledge(Math.round(+e.target.value / 50) * 50)}
            />
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Recommendation is specific to {recommendation.labelMonthYear} ({recommendation.monthsLeft} month{recommendation.monthsLeft>1?'s':''} left this year).
        </p>
      </div>

      {!!error && (
        <div className="rounded-xl border bg-red-50 p-3 text-sm text-red-700">
          {String(error)}
        </div>
      )}

      {recommendation.kidCount > 0 && !recommendation.hasRESPAccount && (
        <div className="rounded-xl border bg-yellow-50 p-3 text-sm text-yellow-800">
          You’ve added {recommendation.kidCount} child{recommendation.kidCount>1?'ren':''}, but no RESP account exists yet.
          Add an RESP account on the <a className="underline" href="/accounts">Accounts</a> page to enable RESP contributions.
        </div>
      )}

      <section className="rounded-xl border bg-white p-4">
        <div className="text-sm font-medium mb-2">Suggested monthly split for {recommendation.labelMonthYear}</div>
        <ul className="text-sm space-y-1">
          <li>RESP: <span className="font-medium">{CAD(Math.round(recommendation.toRESP))}</span></li>
          <li>TFSA: <span className="font-medium">{CAD(Math.round(recommendation.toTFSA))}</span> <span className="text-gray-500">(remaining room this year: {CAD(Math.round(recommendation.tfsaRemaining))})</span></li>
          <li>RRSP: <span className="font-medium">{CAD(Math.round(recommendation.toRRSP))}</span> <span className="text-gray-500">(remaining room this year: {CAD(Math.round(recommendation.rrspRemaining))})</span></li>
          <li>Margin/Other: <span className="font-medium">{CAD(Math.round(recommendation.toMargin))}</span></li>
        </ul>
        <div className="text-xs text-gray-500 mt-2">
          Order of priority used: RESP (to maximize the 20% grant up to $500/child), then TFSA, then RRSP; any remainder goes to an unregistered account.
        </div>
      </section>
    </main>
  );
}
