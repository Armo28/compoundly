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
  catchup_years_per_child?: number | null;
};

// ---- simple donut (SVG) ----
function Donut({ pct, label, sub }: { pct: number; label: string; sub?: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const R = 58, STROKE = 12, C = 70, CIRC = 2 * Math.PI * R;
  const offset = CIRC * (1 - clamped / 100);
  return (
    <div className="flex flex-col items-center">
      <svg width="160" height="160" viewBox="0 0 140 140">
        <circle cx={C} cy={C} r={R} stroke="#e5e7eb" strokeWidth={STROKE} fill="none"/>
        <circle
          cx={C} cy={C} r={R}
          strokeWidth={STROKE}
          strokeLinecap="round"
          stroke="url(#g)"
          fill="none"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          transform="rotate(-90 70 70)"
        />
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4f46e5" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        <text x="70" y="68" fontSize="20" textAnchor="middle" fontWeight="600">{Math.round(clamped)}%</text>
        <text x="70" y="88" fontSize="10" textAnchor="middle" fill="#6b7280">{label}</text>
      </svg>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function RoomPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  // headers that never include undefined
  const authHeaders: HeadersInit = useMemo(() => (
    token ? { authorization: `Bearer ${token}` } : {}
  ), [token]);

  const jsonHeaders: HeadersInit = useMemo(() => (
    token
      ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
      : { 'content-type': 'application/json' }
  ), [token]);

  const toNum = (s: string) => {
    const n = Number((s ?? '').replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  };
  const asStr = (n: number | null | undefined) => (n == null ? '' : String(n));

  // ---------- TFSA/RRSP ----------
  const [tfsaStr, setTfsaStr] = useState('');
  const [rrspStr, setRrspStr] = useState('');
  const [roomsSaved, setRoomsSaved] = useState({ tfsaStr: '', rrspStr: '' });
  const [roomsSaving, setRoomsSaving] = useState(false);

  // For donut context, assume (this-year allowance) is roomsSaved + used
  // If you track “cap” elsewhere, plug it in here:
  const TFSA_THIS_YEAR_CAP = 7500; // adjust if you store real cap per user/year
  const RRSP_THIS_YEAR_CAP = 18000;

  const tfsaRemaining = toNum(tfsaStr || '0');
  const rrspRemaining = toNum(rrspStr || '0');
  const tfsaUsed = Math.max(0, TFSA_THIS_YEAR_CAP - tfsaRemaining);
  const rrspUsed = Math.max(0, RRSP_THIS_YEAR_CAP - rrspRemaining);

  const tfsaPct = TFSA_THIS_YEAR_CAP ? (tfsaUsed / TFSA_THIS_YEAR_CAP) * 100 : 0;
  const rrspPct = RRSP_THIS_YEAR_CAP ? (rrspUsed / RRSP_THIS_YEAR_CAP) * 100 : 0;

  // ---------- RESP ----------
  const [respAvail, setRespAvail] = useState(true);
  const [respStr, setRespStr] = useState({ total:'', life:'', year:'', kids:'', catchup:'' });
  const [respFamily, setRespFamily] = useState(false);
  const [respSaved, setRespSaved] = useState({ total:'', life:'', year:'', kids:'', catchup:'', family:false });
  const [respSaving, setRespSaving] = useState(false);

  // Load once
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!token) return;

      try {
        const r = await fetch('/api/rooms', { headers: authHeaders });
        const j = await r.json();
        const room = j?.room as Rooms | undefined;
        if (room && mounted) {
          const tfsa = asStr(room.tfsa);
          const rrsp = asStr(room.rrsp);
          setTfsaStr(tfsa);
          setRrspStr(rrsp);
          setRoomsSaved({ tfsaStr: tfsa, rrspStr: rrsp });
        }
      } catch {}

      try {
        const r = await fetch('/api/resp-progress', { headers: authHeaders });
        if (!r.ok) throw new Error();
        const j = await r.json();
        const d: RespProgress | null = j?.data ?? null;
        if (!mounted) return;

        setRespAvail(true);
        const total   = asStr(d?.total_value);
        const life    = asStr(d?.lifetime_contrib);
        const year    = asStr(d?.contributed_this_year);
        const fam     = !!d?.is_family_resp;
        const kids    = asStr(d?.children_covered);
        const catchup = asStr(d?.catchup_years_per_child);

        setRespStr({ total, life, year, kids, catchup });
        setRespFamily(fam);
        setRespSaved({ total, life, year, kids, catchup, family: fam });
      } catch {
        if (!mounted) return;
        setRespAvail(false);
      }
    })();
    return () => { mounted = false; };
  }, [token, authHeaders]);

  const dirtyRooms = tfsaStr !== roomsSaved.tfsaStr || rrspStr !== roomsSaved.rrspStr;
  const saveRooms = async () => {
    if (!dirtyRooms || roomsSaving) return;
    setRoomsSaving(true);
    try {
      const payload = { tfsa: toNum(tfsaStr), rrsp: toNum(rrspStr) };
      const r = await fetch('/api/rooms', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? 'Save failed');
      setRoomsSaved({ tfsaStr: String(payload.tfsa), rrspStr: String(payload.rrsp) });
    } catch (e:any) {
      alert(e?.message || 'Save failed');
    } finally {
      setRoomsSaving(false);
    }
  };

  const dirtyResp =
    respAvail &&
    (respStr.total !== respSaved.total ||
     respStr.life  !== respSaved.life  ||
     respStr.year  !== respSaved.year  ||
     respFamily    !== respSaved.family ||
     respStr.catchup !== respSaved.catchup ||
     (respFamily && respStr.kids !== respSaved.kids));

  const saveResp = async () => {
    if (!respAvail || respSaving || !dirtyResp) return;
    setRespSaving(true);
    try {
      const payload: any = {
        total_value: toNum(respStr.total),
        lifetime_contrib: toNum(respStr.life),
        contributed_this_year: toNum(respStr.year),
        is_family_resp: !!respFamily,
        children_covered: respFamily ? Math.max(1, Number(respStr.kids || '1')) : 1,
        catchup_years_per_child: Math.max(0, Number(respStr.catchup || '0')),
      };
      const r = await fetch('/api/resp-progress', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? 'Save failed');

      const saved = {
        total: String(payload.total_value),
        life:  String(payload.lifetime_contrib),
        year:  String(payload.contributed_this_year),
        kids:  payload.children_covered != null ? String(payload.children_covered) : '',
        catchup: String(payload.catchup_years_per_child ?? '0'),
        family: !!payload.is_family_resp,
      };
      setRespSaved(saved);
    } catch (e:any) {
      alert(e?.message || 'Save failed');
    } finally {
      setRespSaving(false);
    }
  };

  if (!session) {
    return (
      <main className="max-w-6xl mx-auto p-4">
        <div className="rounded-xl border bg-white p-6">Sign in to edit room &amp; RESP progress.</div>
      </main>
    );
  }

  // ---- RESP donut math ----
  const kidsCount = respFamily ? Math.max(1, Number(respStr.kids || '1')) : 1;
  const lifetimeCap = 50000 * kidsCount;
  const lifeUsed = Math.max(0, toNum(respStr.life || '0'));
  const lifePct = lifetimeCap ? (lifeUsed / lifetimeCap) * 100 : 0;

  const baseGrantPerChild = 2500;
  const catchupPerChild = Math.max(0, Number(respStr.catchup || '0')) * 2500;
  const grantCapThisYear = (baseGrantPerChild + catchupPerChild) * kidsCount; // grantable contrib path
  const yearContrib = toNum(respStr.year || '0');
  const grantPct = grantCapThisYear ? Math.min(100, (yearContrib / grantCapThisYear) * 100) : 0;

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      {/* TFSA/RRSP Room */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">TFSA &amp; RRSP Room (this year)</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">TFSA room</label>
            <input
              className="rounded-md border px-3 py-2"
              type="text"
              inputMode="decimal"
              placeholder="e.g., 6500"
              value={tfsaStr}
              onChange={e => setTfsaStr(e.target.value)}
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">RRSP room</label>
            <input
              className="rounded-md border px-3 py-2"
              type="text"
              inputMode="decimal"
              placeholder="e.g., 18000"
              value={rrspStr}
              onChange={e => setRrspStr(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={saveRooms}
              disabled={!dirtyRooms || roomsSaving}
              className={
                (!dirtyRooms || roomsSaving)
                  ? 'rounded bg-gray-300 px-4 py-2 text-gray-600 cursor-not-allowed'
                  : 'rounded bg-emerald-600 px-4 py-2 text-white'
              }
            >
              {roomsSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {/* TFSA/RRSP donuts */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Donut
            pct={tfsaPct}
            label="TFSA used"
            sub={`${tfsaUsed.toLocaleString('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0})} of ${TFSA_THIS_YEAR_CAP.toLocaleString('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0})}`}
          />
          <Donut
            pct={rrspPct}
            label="RRSP used"
            sub={`${rrspUsed.toLocaleString('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0})} of ${RRSP_THIS_YEAR_CAP.toLocaleString('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0})}`}
          />
        </div>
      </section>

      {/* RESP */}
      {respAvail && (
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm font-medium mb-3">RESP Progress</div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
            <div className="flex flex-col">
              <label className="text-xs text-gray-600">Total current value</label>
              <input
                className="rounded-md border px-3 py-2"
                type="text"
                inputMode="decimal"
                placeholder="e.g., 20000"
                value={respStr.total}
                onChange={e => setRespStr(s => ({ ...s, total: e.target.value }))}
              />
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-gray-600">Lifetime contributed</label>
              <input
                className="rounded-md border px-3 py-2"
                type="text"
                inputMode="decimal"
                placeholder="e.g., 12000"
                value={respStr.life}
                onChange={e => setRespStr(s => ({ ...s, life: e.target.value }))}
              />
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-gray-600">Contributed this year</label>
              <input
                className="rounded-md border px-3 py-2"
                type="text"
                inputMode="decimal"
                placeholder="e.g., 1000"
                value={respStr.year}
                onChange={e => setRespStr(s => ({ ...s, year: e.target.value }))}
              />
            </div>

            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={respFamily}
                onChange={e => setRespFamily(e.target.checked)}
              />
              <span className="text-sm">Family RESP</span>
            </label>

            {respFamily && (
              <div className="flex flex-col">
                <label className="text-xs text-gray-600"># Children covered</label>
                <input
                  className="rounded-md border px-3 py-2"
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g., 2"
                  value={respStr.kids}
                  onChange={e => setRespStr(s => ({ ...s, kids: e.target.value }))}
                />
              </div>
            )}

            <div className="sm:col-span-5 grid grid-cols-1 sm:grid-cols-3 gap-6 mt-3">
              <div className="flex flex-col">
                <label className="text-xs text-gray-600">Catch-up years per child</label>
                <input
                  className="rounded-md border px-3 py-2"
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g., 2"
                  value={respStr.catchup}
                  onChange={e => setRespStr(s => ({ ...s, catchup: e.target.value }))}
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={saveResp}
                  disabled={!dirtyResp || respSaving}
                  className={
                    (!dirtyResp || respSaving)
                      ? 'rounded bg-gray-300 px-4 py-2 text-gray-600 cursor-not-allowed'
                      : 'rounded bg-emerald-600 px-4 py-2 text-white'
                  }
                >
                  {respSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>

            <div className="sm:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4">
              <Donut
                pct={lifePct}
                label="Lifetime cap"
                sub={`${lifeUsed.toLocaleString('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0})}/${lifetimeCap.toLocaleString('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0})}`}
              />
              <Donut
                pct={grantPct}
                label="Grant path this year"
                sub={`${yearContrib.toLocaleString('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0})}/${grantCapThisYear.toLocaleString('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0})}`}
              />
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
