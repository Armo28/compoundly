'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';

type Rooms = { year: number; tfsa: number; rrsp: number };

type RespProgress = {
  total_value?: number | null;
  lifetime_contrib?: number | null;
  contributed_this_year?: number | null;
  is_family_resp?: boolean | null;
  children_covered?: number | null;
};

type Account = { id: string; type: string; balance?: number | null };

// ---------- small helpers ----------
const mkAuthHeaders = (token: string): HeadersInit => {
  const h: Record<string,string> = {};
  if (token) h.authorization = `Bearer ${token}`;
  return h;
};
const mkJsonHeaders = (token: string): HeadersInit => {
  const h: Record<string,string> = { 'content-type':'application/json' };
  if (token) h.authorization = `Bearer ${token}`;
  return h;
};
const toNum = (s: string) => {
  const n = Number((s ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};
const strFromServer = (n: number | null | undefined) => (n == null || n === 0 ? '' : String(n));
const clamp = (n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));

// CESG constants
const PER_CHILD_LIFETIME_CONTRIB_CAP = 50_000;
const PER_CHILD_GRANT_THIS_YEAR = 5_000;

function grantPathNumbers(children:number, lifetimeContrib:number, contributedThisYear:number) {
  if (children <= 0) return { grantCap: 0, used: 0, remain: 0 };
  const grantCap = children * PER_CHILD_GRANT_THIS_YEAR;
  const used = clamp(contributedThisYear, 0, grantCap);
  const remain = Math.max(0, grantCap - used);
  return { grantCap, used, remain };
}

function lifetimeNumbers(children:number, lifetimeContrib:number) {
  const cap = children * PER_CHILD_LIFETIME_CONTRIB_CAP;
  const used = clamp(lifetimeContrib, 0, cap);
  const remain = Math.max(0, cap - used);
  return { cap, used, remain };
}

// Donut (no external libs)
function Donut({used, cap, label}:{used:number;cap:number;label:string}) {
  const pct = cap > 0 ? used / cap : 0;
  const size = 110; const stroke = 12;
  const r = (size - stroke) / 2; const c = size/2;
  const C = 2*Math.PI*r;
  const filled = C * pct;
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size}>
        <circle cx={c} cy={c} r={r} stroke="#e5e7eb" strokeWidth={stroke} fill="none"/>
        <circle cx={c} cy={c} r={r} stroke="#4f46e5" strokeWidth={stroke} fill="none"
          strokeDasharray={`${filled} ${C - filled}`} strokeLinecap="round"
          transform={`rotate(-90 ${c} ${c})`} />
        <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="14" fill="#111827">
          {Math.round(pct*100)}%
        </text>
      </svg>
      <div className="mt-1 text-xs text-gray-600">{label}</div>
    </div>
  );
}

export default function RoomPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  const authHeaders = useMemo(()=>mkAuthHeaders(token),[token]);
  const jsonHeaders = useMemo(()=>mkJsonHeaders(token),[token]);

  // TFSA/RRSP (string-backed)
  const [tfsaStr, setTfsaStr] = useState('');
  const [rrspStr, setRrspStr] = useState('');
  const [roomsSaved, setRoomsSaved] = useState({ tfsaStr: '', rrspStr: '' });
  const [roomsSaving, setRoomsSaving] = useState(false);

  // RESP (string-backed)
  const [respStr, setRespStr] = useState({ total:'', life:'', year:'', kids:'' });
  const [respFamily, setRespFamily] = useState(false);
  const [respSaved, setRespSaved] = useState({ total:'', life:'', year:'', kids:'', family:false });
  const [respSaving, setRespSaving] = useState(false);

  // initial fetch
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!token) return;

      // rooms
      try {
        const r = await fetch('/api/rooms', { headers: authHeaders });
        const j = await r.json();
        const room = j?.room as Rooms | undefined;
        if (room && mounted) {
          const tfsa = strFromServer(room.tfsa);
          const rrsp = strFromServer(room.rrsp);
          setTfsaStr(tfsa); setRrspStr(rrsp); setRoomsSaved({ tfsaStr: tfsa, rrspStr: rrsp });
        }
      } catch {}

      // resp progress
      let progressFetched = false;
      try {
        const r = await fetch('/api/resp-progress', { headers: authHeaders });
        if (r.ok) {
          const j = await r.json();
          const d: RespProgress | null = j?.data ?? null;
          if (mounted && d) {
            const total = strFromServer(d.total_value);
            const life  = strFromServer(d.lifetime_contrib);
            const year  = strFromServer(d.contributed_this_year);
            const fam   = !!d.is_family_resp;
            const kids  = strFromServer(d.children_covered);
            setRespStr({ total, life, year, kids });
            setRespFamily(fam);
            setRespSaved({ total, life, year, kids, family: fam });
            progressFetched = true;
          }
        }
      } catch {}

      // prefill RESP total from Accounts if blank
      try {
        if (!progressFetched) {
          const r = await fetch('/api/accounts', { headers: authHeaders });
          const j = await r.json();
          const list: Account[] = Array.isArray(j?.items) ? j.items : [];
          const sumResp = list
            .filter(a => (a.type || '').toUpperCase() === 'RESP')
            .reduce((acc, a) => acc + (Number(a.balance ?? 0) || 0), 0);
          if (mounted && sumResp > 0) {
            setRespStr(s => s.total ? s : { ...s, total: String(sumResp) });
          }
        }
      } catch {}
    })();
    return () => { mounted = false; };
  }, [token, authHeaders]);

  const dirtyRooms = tfsaStr !== roomsSaved.tfsaStr || rrspStr !== roomsSaved.rrspStr;
  const dirtyResp =
    respStr.total !== respSaved.total ||
    respStr.life  !== respSaved.life  ||
    respStr.year  !== respSaved.year  ||
    respFamily    !== respSaved.family ||
    (respFamily && respStr.kids !== respSaved.kids);

  const saveRooms = async () => {
    if (!dirtyRooms || roomsSaving) return;
    setRoomsSaving(true);
    try {
      const payload = { tfsa: toNum(tfsaStr), rrsp: toNum(rrspStr) };
      const r = await fetch('/api/rooms', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? 'Save failed');
      setRoomsSaved({ tfsaStr: String(payload.tfsa), rrspStr: String(payload.rrsp) });
    } catch (e:any) {
      alert(e?.message || 'Save failed');
    } finally { setRoomsSaving(false); }
  };

  const saveResp = async () => {
    if (respSaving || !dirtyResp) return;
    setRespSaving(true);
    try {
      const payload: any = {
        total_value: toNum(respStr.total),
        lifetime_contrib: toNum(respStr.life),
        contributed_this_year: toNum(respStr.year),
        is_family_resp: !!respFamily,
        children_covered: respFamily ? Math.max(1, Number(respStr.kids || '1')) : 1,
      };
      const r = await fetch('/api/resp-progress', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? 'Save failed');

      const saved = {
        total: String(payload.total_value),
        life:  String(payload.lifetime_contrib),
        year:  String(payload.contributed_this_year),
        kids:  payload.children_covered ? String(payload.children_covered) : '',
        family: !!payload.is_family_resp,
      };
      setRespSaved(saved);
    } catch (e:any) {
      alert(e?.message || 'Save failed');
    } finally { setRespSaving(false); }
  };

  // charts data
  const kids = Math.max(1, Number(respFamily ? (respStr.kids || '1') : '1'));
  const lifeNums  = lifetimeNumbers(kids, toNum(respStr.life));
  const grantNums = grantPathNumbers(kids, toNum(respStr.life), toNum(respStr.year));

  if (!session) {
    return (
      <main className="max-w-6xl mx-auto p-4">
        <div className="rounded-xl border bg-white p-6">Sign in to edit room & RESP progress.</div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">

      {/* TFSA/RRSP */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">TFSA & RRSP Room (this year)</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">TFSA room</label>
            <input className="rounded-md border px-3 py-2" type="text" inputMode="decimal" placeholder="e.g., 6500"
              value={tfsaStr} onChange={e=>setTfsaStr(e.target.value)} />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">RRSP room</label>
            <input className="rounded-md border px-3 py-2" type="text" inputMode="decimal" placeholder="e.g., 18000"
              value={rrspStr} onChange={e=>setRrspStr(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button onClick={saveRooms} disabled={!dirtyRooms || roomsSaving}
              className={(!dirtyRooms || roomsSaving)
                ? 'rounded bg-gray-300 px-4 py-2 text-gray-600 cursor-not-allowed'
                : 'rounded bg-emerald-600 px-4 py-2 text-white'}>
              {roomsSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </section>

      {/* RESP */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">RESP Progress</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="flex flex-col">
                <label className="text-xs text-gray-600">Total current value</label>
                <input className="rounded-md border px-3 py-2" type="text" inputMode="decimal"
                  placeholder="e.g., 20000" value={respStr.total}
                  onChange={e=>setRespStr(s=>({ ...s, total: e.target.value }))}/>
              </div>
              <div className="flex flex-col">
                <label className="text-xs text-gray-600">Lifetime contributed</label>
                <input className="rounded-md border px-3 py-2" type="text" inputMode="decimal"
                  placeholder="e.g., 12000" value={respStr.life}
                  onChange={e=>setRespStr(s=>({ ...s, life: e.target.value }))}/>
              </div>
              <div className="flex flex-col">
                <label className="text-xs text-gray-600">Contributed this year</label>
                <input className="rounded-md border px-3 py-2" type="text" inputMode="decimal"
                  placeholder="e.g., 1000" value={respStr.year}
                  onChange={e=>setRespStr(s=>({ ...s, year: e.target.value }))}/>
              </div>
              <label className="inline-flex items-center gap-2 mt-1">
                <input type="checkbox" checked={respFamily} onChange={e=>setRespFamily(e.target.checked)} />
                <span className="text-sm">Family RESP</span>
              </label>
              {respFamily && (
                <div className="flex flex-col">
                  <label className="text-xs text-gray-600"># Children covered</label>
                  <input className="rounded-md border px-3 py-2" type="text" inputMode="numeric"
                    placeholder="e.g., 2" value={respStr.kids}
                    onChange={e=>setRespStr(s=>({ ...s, kids: e.target.value }))}/>
                </div>
              )}
              <div className="sm:col-span-3 flex justify-end">
                <button onClick={saveResp} disabled={!dirtyResp || respSaving}
                  className={(!dirtyResp || respSaving)
                    ? 'rounded bg-gray-300 px-4 py-2 text-gray-600 cursor-not-allowed'
                    : 'rounded bg-emerald-600 px-4 py-2 text-white'}>
                  {respSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>

          {/* Donuts */}
          <div className="grid grid-cols-2 gap-6 justify-items-center">
            <Donut used={lifeNums.used} cap={lifeNums.cap} label={`Lifetime cap (${lifeNums.used.toLocaleString()}/${lifeNums.cap.toLocaleString()})`} />
            <Donut used={grantNums.used} cap={grantNums.grantCap} label={`Grant path this year (${grantNums.used.toLocaleString()}/${grantNums.grantCap.toLocaleString()})`} />
          </div>
        </div>
      </section>
    </main>
  );
}
