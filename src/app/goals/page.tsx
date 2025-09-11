'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';

const CAD = (n:number)=>n.toLocaleString('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0});
const monthsLeft = () => Math.max(1, 12 - new Date().getMonth());

type Rooms = { year:number; tfsa:number; rrsp:number };
type RespRow = {
  year:number;
  total_value:number;
  lifetime_contrib:number;
  contributed_this_year:number;
  is_family_resp:boolean;
  children_covered:number;
};

export default function GoalsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  const headers = useMemo(() => {
    const h = new Headers();
    if (token) h.set('authorization', `Bearer ${token}`);
    return h as HeadersInit;
  }, [token]);

  const [pledge, setPledge] = useState(2000);

  const [rooms, setRooms] = useState<Rooms>({ year:new Date().getFullYear(), tfsa:0, rrsp:0 });
  const [resp, setResp] = useState<RespRow | null>(null);
  const [hasRespAccount, setHasRespAccount] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const r = await fetch('/api/rooms', { headers });
        const j = await r.json();
        if (j?.room) setRooms(j.room);
      } catch {}

      try {
        const a = await fetch('/api/accounts', { headers });
        const aj = await a.json();
        const has = Array.isArray(aj?.items) && aj.items.some((x:any)=> (x.type??'').toUpperCase()==='RESP');
        setHasRespAccount(!!has);
      } catch {}

      try {
        const r = await fetch('/api/resp-progress', { headers });
        const j = await r.json();
        if (j?.data) setResp(j.data);
      } catch {
        setResp(null);
      }
    })();
  }, [token, headers]);

  // --- CESG-first allocation
  const mLeft = monthsLeft();

  const grantableChildren = (r: RespRow | null) => {
    if (!r) return 0;
    const kids = Math.max(1, r.is_family_resp ? Number(r.children_covered||1) : 1);
    return kids;
  };

  const respGrantRoomThisYear = (r: RespRow | null) => {
    if (!r) return 0;
    const kids = grantableChildren(r);
    const perChildCap = 2500;           // eligible contributions per child for 20% grant
    const totalCap = perChildCap * kids;
    const ytd = Math.max(0, Number(r.contributed_this_year||0));
    return Math.max(0, totalCap - ytd);
  };

  const lifetimeRoomLeft = (r: RespRow | null) => {
    if (!r) return 0;
    const kids = r.is_family_resp ? Math.max(1, Number(r.children_covered||1)) : 1;
    const cap = 50000 * kids;
    const life = Math.max(0, Number(r.lifetime_contrib||0));
    return Math.max(0, cap - life);
  };

  const split = useMemo(() => {
    let remaining = pledge;
    const out = { resp:0, tfsa:0, rrsp:0, margin:0 };

    // 1) RESP (grant path first) — only if you actually have RESP setup
    if ((resp || hasRespAccount) && resp) {
      const grantPath = respGrantRoomThisYear(resp);
      const lifeLeft  = lifetimeRoomLeft(resp);
      const respCap   = Math.min(grantPath, lifeLeft);
      const maxThisYearChunk = Math.min(respCap, remaining);
      out.resp += maxThisYearChunk;
      remaining -= maxThisYearChunk;

      // 1b) After grant path is filled *this month*, still respect lifetime cap
      if (remaining > 0 && lifeLeft - maxThisYearChunk > 0) {
        const extra = Math.min(lifeLeft - maxThisYearChunk, remaining);
        // BUT we only put extra later, after TFSA/RRSP (per your rule)
        // So hold it for step 4 (back to RESP)
        out.resp += 0; // placeholder
        remaining += 0;
      }
    }

    // 2) TFSA
    if (remaining > 0) {
      const cap = Math.max(0, Number(rooms.tfsa||0));
      const perMonth = cap / mLeft;   // smooth into remaining months
      const add = Math.min(remaining, Math.max(0, perMonth));
      out.tfsa += add; remaining -= add;
    }

    // 3) RRSP
    if (remaining > 0) {
      const cap = Math.max(0, Number(rooms.rrsp||0));
      const perMonth = cap / mLeft;
      const add = Math.min(remaining, Math.max(0, perMonth));
      out.rrsp += add; remaining -= add;
    }

    // 4) Back to RESP up to lifetime cap (if any left)
    if (remaining > 0 && resp) {
      const lifeLeft = lifetimeRoomLeft(resp);
      const alreadyPlanned = out.resp;
      const add = Math.min(remaining, Math.max(0, lifeLeft - alreadyPlanned));
      out.resp += add; remaining -= add;
    }

    // 5) Remainder → Margin/Other
    if (remaining > 0) out.margin += remaining;

    return out;
  }, [pledge, rooms, resp, hasRespAccount]);

  const grantPathRemaining = respGrantRoomThisYear(resp);
  const showRespCard = (resp || hasRespAccount) && (grantPathRemaining > 0 || lifetimeRoomLeft(resp) > 0);

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-2">Monthly pledge</div>
        <div className="text-gray-900 font-medium">{CAD(pledge)}</div>
        <input className="w-full mt-3" type="range" min={0} max={10000} step={25}
          value={pledge} onChange={e => setPledge(Number(e.target.value))} />
        <div className="text-sm text-gray-600 mt-2">
          Recommendation is specific to {new Date().toLocaleString('en-CA',{month:'long',year:'numeric'})} ({monthsLeft()} months left this year).
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {showRespCard && (
            <div className="rounded-xl border p-4">
              <div className="text-sm text-gray-600">RESP</div>
              <div className="text-3xl font-semibold mt-1">{CAD(split.resp)}</div>
              <div className="text-xs text-gray-600 mt-2">Grant path remaining (this year): {CAD(grantPathRemaining)}</div>
            </div>
          )}
          <div className="rounded-xl border p-4">
            <div className="text-sm text-gray-600">TFSA</div>
            <div className="text-3xl font-semibold mt-1">{CAD(split.tfsa)}</div>
            <div className="text-xs text-gray-600 mt-2">Remaining this year: {CAD(Math.max(0, rooms.tfsa))}</div>
          </div>
          <div className="rounded-xl border p-4">
            <div className="text-sm text-gray-600">RRSP</div>
            <div className="text-3xl font-semibold mt-1">{CAD(split.rrsp)}</div>
            <div className="text-xs text-gray-600 mt-2">Remaining this year: {CAD(Math.max(0, rooms.rrsp))}</div>
          </div>
          <div className="rounded-xl border p-4">
            <div className="text-sm text-gray-600">Margin/Other</div>
            <div className="text-3xl font-semibold mt-1">{CAD(split.margin)}</div>
          </div>
        </div>
        <div className="text-xs text-gray-600 mt-3">
          Order: RESP (up to grant path & lifetime caps) → TFSA → RRSP → remainder to Margin/Other.
        </div>
      </section>

      {/* mic/notes UI stays as you had it */}
    </main>
  );
}
