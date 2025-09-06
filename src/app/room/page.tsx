'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';

type Room = { year: number; tfsa: number; rrsp: number };
type Progress = { year: number; tfsa_deposited?: number; rrsp_deposited?: number };

type Account = {
  id: string;
  type: string;       // 'RESP' etc
  name?: string;
  institution?: string;
  balance?: number;   // total current value (for dashboard)
  is_family_resp?: boolean;
  children_covered?: number;
  resp_lifetime_contributed?: number;
};

type RespYearRow = {
  year: number;
  contributed_ytd: number;
  grant_eligible_contrib_lifetime: number | null;
  carry_forward_grantable_per_child: number | null;
};

const CAD = (n:number)=>n.toLocaleString(undefined,{style:'currency',currency:'CAD',maximumFractionDigits:0});

export default function RoomPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';
  const headers = token ? { authorization: `Bearer ${token}`, 'content-type':'application/json' } : undefined;

  const [room, setRoom] = useState<Room|null>(null);
  const [prog, setProg] = useState<Progress|null>(null);
  const [respAcc, setRespAcc] = useState<Account|null>(null);
  const [respYear, setRespYear] = useState<RespYearRow|null>(null);
  const yr = new Date().getFullYear();

  // TFSA/RRSP local edits
  const [tfsaRoom, setTfsaRoom] = useState(0);
  const [rrspRoom, setRrspRoom] = useState(0);

  // RESP local edits
  const [respValue, setRespValue] = useState<number>(0);                 // current total value (maps to balance)
  const [respLifetimeContrib, setRespLifetimeContrib] = useState<number>(0);
  const [respFamily, setRespFamily] = useState<boolean>(false);
  const [respChildren, setRespChildren] = useState<number>(1);
  const [respYtd, setRespYtd] = useState<number>(0);
  const [respGrantEligibleLifetime, setRespGrantEligibleLifetime] = useState<number | ''>('');
  const [respCarryForwardOverride, setRespCarryForwardOverride] = useState<number | ''>('');

  // load current data
  useEffect(()=>{
    if(!headers) return;
    (async()=>{
      // rooms
      const r = await fetch('/api/rooms', { headers });
      const rj = await r.json();
      const roomObj = rj?.room ?? rj ?? null;
      if (roomObj) {
        setRoom(roomObj);
        setTfsaRoom(Number(roomObj.tfsa ?? 0));
        setRrspRoom(Number(roomObj.rrsp ?? 0));
      }

      // progress
      const p = await fetch('/api/rooms/progress', { headers });
      const pj = await p.json();
      const progObj = pj ?? null;
      if (progObj) setProg(progObj);

      // accounts (find RESP)
      const a = await fetch('/api/accounts', { headers });
      const aj = await a.json();
      const items: Account[] = aj?.items ?? [];
      const resp = items.find(x => String(x.type).toUpperCase() === 'RESP') ?? null;
      setRespAcc(resp ?? null);
      if (resp) {
        setRespValue(Number(resp.balance ?? 0));
        setRespLifetimeContrib(Number(resp.resp_lifetime_contributed ?? 0));
        setRespFamily(Boolean(resp.is_family_resp));
        setRespChildren(Math.max(1, Number(resp.children_covered ?? 1)));
      }

      // resp year row
      const y = await fetch(`/api/resp-progress?year=${yr}`, { headers });
      const yj = await y.json();
      const row: RespYearRow = {
        year: Number(yj?.year ?? yr),
        contributed_ytd: Number(yj?.contributed_ytd ?? 0),
        grant_eligible_contrib_lifetime: yj?.grant_eligible_contrib_lifetime == null ? null : Number(yj.grant_eligible_contrib_lifetime),
        carry_forward_grantable_per_child: yj?.carry_forward_grantable_per_child == null ? null : Number(yj.carry_forward_grantable_per_child),
      };
      setRespYear(row);
      setRespYtd(Number(row.contributed_ytd));
      setRespGrantEligibleLifetime(row.grant_eligible_contrib_lifetime == null ? '' : Number(row.grant_eligible_contrib_lifetime));
      setRespCarryForwardOverride(row.carry_forward_grantable_per_child == null ? '' : Number(row.carry_forward_grantable_per_child));
    })();
  },[headers, yr]);

  const saveRooms = async ()=>{
    if(!headers) return;
    const r = await fetch('/api/rooms', {
      method:'POST',
      headers,
      body: JSON.stringify({ tfsa: tfsaRoom, rrsp: rrspRoom })
    });
    await r.json();
  };

  const saveResp = async ()=>{
    if(!headers) return;
    if (!respAcc) {
      alert('Create a RESP account first in Accounts.');
      return;
    }
    // PATCH account with RESP fields
    await fetch(`/api/accounts/${respAcc.id}`, {
      method:'PATCH',
      headers,
      body: JSON.stringify({
        balance: respValue,
        resp_lifetime_contributed: respLifetimeContrib,
        is_family_resp: respFamily,
        children_covered: Math.max(1, respChildren)
      })
    });

    // Upsert the current-year row
    await fetch('/api/resp-progress', {
      method:'POST',
      headers,
      body: JSON.stringify({
        year: yr,
        contributed_ytd: respYtd,
        grant_eligible_contrib_lifetime: respGrantEligibleLifetime === '' ? null : Number(respGrantEligibleLifetime),
        carry_forward_grantable_per_child: respCarryForwardOverride === '' ? null : Math.max(0, Math.min(2500, Number(respCarryForwardOverride)))
      })
    });
    alert('RESP saved');
  };

  // donuts for RESP (lifetime and current year grant path)
  const lifetimeCap = (respFamily ? respChildren : 1) * 50000;
  const lifetimeUsed = Math.max(0, Math.min(lifetimeCap, respLifetimeContrib));
  const lifetimeRem = Math.max(0, lifetimeCap - lifetimeUsed);

  // Grant-eligible path lifetime: 36k per child
  const grantLifetimeCap = (respFamily ? respChildren : 1) * 36000;
  const grantLifetimeUsed = (() => {
    if (respGrantEligibleLifetime !== '' && respGrantEligibleLifetime != null) {
      return Math.max(0, Math.min(grantLifetimeCap, Number(respGrantEligibleLifetime)));
    }
    // fallback: approximate by lifetime contributions (capped at 36k/child)
    return Math.max(0, Math.min(grantLifetimeCap, respLifetimeContrib));
  })();
  const grantLifetimeRem = Math.max(0, grantLifetimeCap - grantLifetimeUsed);

  const monthsLeft = Math.max(1, 12 - new Date().getMonth());
  const estAnnualGrantCapPerChild = 2500 + Math.min(2500, Number(respCarryForwardOverride || 0));
  const thisYearGrantCap = (respFamily ? respChildren : 1) * estAnnualGrantCapPerChild;
  const thisYearGrantUsed = Math.max(0, Math.min(thisYearGrantCap, respYtd));
  const thisYearGrantRem = Math.max(0, thisYearGrantCap - thisYearGrantUsed);

  const donut = (used:number, rem:number) => {
    const total = Math.max(1, used + rem);
    const frac = used / total;
    const sweep = frac * 2 * Math.PI;
    const size=160, cx=size/2, cy=size/2, rO=60, rI=40;
    let a0 = -Math.PI/2, a1 = a0 + sweep;
    const arc = (aStart:number, aEnd:number, col:string) => {
      const sox=cx+Math.cos(aStart)*rO, soy=cy+Math.sin(aStart)*rO;
      const eox=cx+Math.cos(aEnd)*rO, eoy=cy+Math.sin(aEnd)*rO;
      const six=cx+Math.cos(aEnd)*rI, siy=cy+Math.sin(aEnd)*rI;
      const esx=cx+Math.cos(aStart)*rI, esy=cy+Math.sin(aStart)*rI;
      const large = (aEnd-aStart)>Math.PI?1:0;
      const d = `M ${sox} ${soy} A ${rO} ${rO} 0 ${large} 1 ${eox} ${eoy} L ${six} ${siy} A ${rI} ${rI} 0 ${large} 0 ${esx} ${esy} Z`;
      return <path key={col} d={d} fill={col} opacity={0.95}/>;
    };
    return (
      <svg viewBox={`0 0 ${size} ${size}`} className="w-40 h-40">
        {arc(a0, a1, '#22c55e')}
        {arc(a1, a0+2*Math.PI, '#e5e7eb')}
        <circle cx={cx} cy={cy} r={rI-1} fill="#fff"/>
        <text x={cx} y={cy} textAnchor="middle" fontSize="12" className="font-semibold" fill="#111827">
          {Math.round((used/total)*100)}%
        </text>
      </svg>
    );
  };

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium">TFSA / RRSP room (this year)</div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border p-4">
            <div className="text-xs text-gray-600">TFSA room</div>
            <input type="number" className="mt-2 w-full rounded border p-2"
              value={tfsaRoom} onChange={e=>setTfsaRoom(Number(e.target.value)||0)} />
          </div>
          <div className="rounded-xl border p-4">
            <div className="text-xs text-gray-600">RRSP room</div>
            <input type="number" className="mt-2 w-full rounded border p-2"
              value={rrspRoom} onChange={e=>setRrspRoom(Number(e.target.value)||0)} />
          </div>
        </div>
        <div className="mt-3">
          <button onClick={saveRooms} className="rounded bg-indigo-600 px-3 py-2 text-white">Save TFSA/RRSP</button>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium">RESP (details & tracking)</div>

        {!respAcc ? (
          <div className="mt-3 text-sm text-gray-700">
            No RESP account found. Please add an account of type <b>RESP</b> on the Accounts page first.
          </div>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="rounded-xl border p-4 space-y-2">
                <div className="text-xs text-gray-600">Current total value</div>
                <input type="number" className="w-full rounded border p-2"
                  value={respValue} onChange={e=>setRespValue(Number(e.target.value)||0)} />
                <div className="text-[11px] text-gray-500">
                  This feeds the Dashboard “Total”.
                </div>
              </div>

              <div className="rounded-xl border p-4 space-y-2">
                <div className="text-xs text-gray-600">Lifetime contributed (all years)</div>
                <input type="number" className="w-full rounded border p-2"
                  value={respLifetimeContrib} onChange={e=>setRespLifetimeContrib(Number(e.target.value)||0)} />
                <div className="text-[11px] text-gray-500">Used for lifetime caps (50k/child) and grant path fallback.</div>
              </div>

              <div className="rounded-xl border p-4 space-y-2">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={respFamily} onChange={e=>setRespFamily(e.target.checked)} />
                  Family RESP
                </label>
                {respFamily && (
                  <div className="mt-2">
                    <div className="text-xs text-gray-600 mb-1">Number of children covered</div>
                    <input type="number" min={1} className="w-40 rounded border p-2"
                      value={respChildren} onChange={e=>setRespChildren(Math.max(1, Number(e.target.value)||1))} />
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="rounded-xl border p-4 space-y-2">
                <div className="text-xs text-gray-600">Contributed YTD (this year)</div>
                <input type="number" className="w-full rounded border p-2"
                  value={respYtd} onChange={e=>setRespYtd(Math.max(0, Number(e.target.value)||0))} />
                <div className="text-[11px] text-gray-500">Drives this year’s grant target.</div>
              </div>

              <div className="rounded-xl border p-4 space-y-2">
                <div className="text-xs text-gray-600">Grant-eligible contributed (lifetime, optional)</div>
                <input type="number" className="w-full rounded border p-2"
                  value={respGrantEligibleLifetime === '' ? '' : Number(respGrantEligibleLifetime)}
                  onChange={e=>{
                    const v = e.target.value;
                    setRespGrantEligibleLifetime(v===''? '' : Math.max(0, Number(v)||0));
                  }} />
                <div className="text-[11px] text-gray-500">
                  If set, this replaces the fallback estimate for the lifetime CESG path (36k/child cap).
                </div>
              </div>

              <div className="rounded-xl border p-4 space-y-2">
                <div className="text-xs text-gray-600">Catch-up grantable per child (optional, 0..2500)</div>
                <input type="number" className="w-full rounded border p-2"
                  value={respCarryForwardOverride === '' ? '' : Number(respCarryForwardOverride)}
                  onChange={e=>{
                    const v = e.target.value;
                    const n = v===''? '' : Math.max(0, Math.min(2500, Number(v)||0));
                    setRespCarryForwardOverride(n as any);
                  }} />
                <div className="text-[11px] text-gray-500">Add up to one extra year ($2,500) per child if you have carry-forward.</div>
              </div>
            </div>

            {/* Donuts */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border bg-white p-4">
                <div className="text-sm font-medium mb-2">RESP Lifetime Contribution</div>
                <div className="flex items-center gap-4">
                  {donut(lifetimeUsed, lifetimeRem)}
                  <div className="text-sm text-gray-700">
                    <div>Used: <b>{CAD(lifetimeUsed)}</b></div>
                    <div>Remaining: <b>{CAD(lifetimeRem)}</b></div>
                    <div className="text-xs text-gray-500 mt-1">Cap: {CAD(lifetimeCap)}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-4">
                <div className="text-sm font-medium mb-2">Grant-Eligible Track</div>
                <div className="flex items-center gap-4">
                  {donut(grantLifetimeUsed, grantLifetimeRem)}
                  <div className="text-sm text-gray-700">
                    <div>Used: <b>{CAD(grantLifetimeUsed)}</b></div>
                    <div>Remaining: <b>{CAD(grantLifetimeRem)}</b></div>
                    <div className="text-xs text-gray-500 mt-1">Cap: {CAD(grantLifetimeCap)}</div>
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  This year grant path cap: {CAD(thisYearGrantCap)} — remaining {CAD(thisYearGrantRem)} ({monthsLeft} months left).
                </div>
              </div>
            </div>

            <div className="mt-4">
              <button onClick={saveResp} className="rounded bg-emerald-600 px-3 py-2 text-white">Save RESP</button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
