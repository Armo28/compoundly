'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip
} from 'recharts';

type Rooms = { year: number; tfsa: number; rrsp: number; tfsa_ytd?: number; rrsp_ytd?: number };
type RespProgress = {
  total_value?: number | null;
  lifetime_contrib?: number | null;
  contributed_this_year?: number | null;
  is_family_resp?: boolean | null;
  children_covered?: number | null;
  carry_forward_grantable_per_child?: number | null;
  catchup_years_per_child?: number | null;
};

const CAD = (n: number) =>
  (n || 0).toLocaleString(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

function makeHeaders(token: string | undefined, asJson = false): HeadersInit {
  const h = new Headers();
  if (token) h.set('authorization', `Bearer ${token}`);
  if (asJson) h.set('content-type', 'application/json');
  return h as HeadersInit;
}

const donutColors = ['#4f46e5', '#e5e7eb'];

function Donut({ title, used, total, subtitle }: { title: string; used: number; total: number; subtitle?: string }) {
  const safeTotal = Math.max(total || 0, 1);
  const data = [
    { name: 'used', value: Math.min(Math.max(used, 0), safeTotal) },
    { name: 'left', value: Math.max(safeTotal - Math.max(used, 0), 0) },
  ];
  const pct = Math.round((data[0].value / safeTotal) * 100);

  return (
    <div className="flex flex-col items-center">
      <div className="text-sm mb-2">{title}</div>
      <div style={{ width: 164, height: 164 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={56}
              outerRadius={76}
              startAngle={90}
              endAngle={-270}
              paddingAngle={0}
            >
              {data.map((_, i) => <Cell key={i} fill={donutColors[i]} />)}
            </Pie>
            <Tooltip
              formatter={(v: any, n: any) => [CAD(Number(v)), n]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="text-sm text-gray-700">{pct}%</div>
      <div className="text-xs text-gray-500">
        {subtitle ?? `${CAD(used)}/${CAD(total)}`}
      </div>
    </div>
  );
}

export default function RoomPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  // ---------- headers ----------
  const authHeaders = useMemo(() => makeHeaders(token), [token]);
  const jsonHeaders = useMemo(() => makeHeaders(token, true), [token]);

  // ---------- TFSA / RRSP (string-backed) ----------
  const [tfsaStr, setTfsaStr] = useState('');
  const [rrspStr, setRrspStr] = useState('');
  const [tfsaYtdStr, setTfsaYtdStr] = useState('');
  const [rrspYtdStr, setRrspYtdStr] = useState('');
  const [roomsSaved, setRoomsSaved] = useState({ tfsaStr: '', rrspStr: '', tfsaYtdStr: '', rrspYtdStr: '' });
  const [roomsSaving, setRoomsSaving] = useState(false);

  // ---------- RESP (string-backed) ----------
  const [respAvail, setRespAvail] = useState(true);
  const [respStr, setRespStr] = useState({ total: '', life: '', year: '', kids: '', carry: '', catchup: '' });
  const [respFamily, setRespFamily] = useState(false);
  const [respSaved, setRespSaved] = useState({ total: '', life: '', year: '', kids: '', carry: '', catchup: '', family: false });
  const [respSaving, setRespSaving] = useState(false);

  const toNum = (s: string) => {
    const n = Number((s ?? '').replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : 0;
    };
  const asStr = (n: number | null | undefined) => (n == null ? '' : String(n));

  const dirtyRooms =
    tfsaStr !== roomsSaved.tfsaStr ||
    rrspStr !== roomsSaved.rrspStr ||
    tfsaYtdStr !== roomsSaved.tfsaYtdStr ||
    rrspYtdStr !== roomsSaved.rrspYtdStr;

  const dirtyResp =
    respAvail &&
    (respStr.total !== respSaved.total ||
      respStr.life !== respSaved.life ||
      respStr.year !== respSaved.year ||
      respStr.carry !== respSaved.carry ||
      respStr.catchup !== respSaved.catchup ||
      respFamily !== respSaved.family ||
      (respFamily && respStr.kids !== respSaved.kids));

  // ---------- initial fetch ----------
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!token) return;

      // rooms
      try {
        const r = await fetch('/api/rooms', { headers: authHeaders });
        const j = await r.json();
        const room: Rooms | undefined = j?.room;
        if (room && mounted) {
          const tfsa = asStr(room.tfsa);
          const rrsp = asStr(room.rrsp);
          const tfsaY = asStr(room.tfsa_ytd ?? 0);
          const rrspY = asStr(room.rrsp_ytd ?? 0);
          setTfsaStr(tfsa);
          setRrspStr(rrsp);
          setTfsaYtdStr(tfsaY);
          setRrspYtdStr(rrspY);
          setRoomsSaved({ tfsaStr: tfsa, rrspStr: rrsp, tfsaYtdStr: tfsaY, rrspYtdStr: rrspY });
        }
      } catch { /* ignore */ }

      // resp
      try {
        const r = await fetch('/api/resp-progress', { headers: authHeaders });
        if (!r.ok) throw new Error('no resp api');
        const j = await r.json();
        const d: RespProgress | null = j?.data ?? null;
        if (!mounted) return;

        setRespAvail(true);
        const total  = asStr(d?.total_value);
        const life   = asStr(d?.lifetime_contrib);
        const year   = asStr(d?.contributed_this_year);
        const fam    = !!d?.is_family_resp;
        const kids   = asStr(d?.children_covered);
        const carry  = asStr(d?.carry_forward_grantable_per_child ?? 0);
        const catchp = asStr(d?.catchup_years_per_child ?? 0);

        setRespStr({ total, life, year, kids, carry, catchup: catchp });
        setRespFamily(fam);
        setRespSaved({ total, life, year, kids, carry, catchup: catchp, family: fam });
      } catch {
        if (!mounted) return;
        setRespAvail(false);
      }
    })();
    return () => { mounted = false; };
  }, [token, authHeaders]);

  // ---------- save handlers ----------
  const saveRooms = async () => {
    if (!dirtyRooms || roomsSaving) return;
    setRoomsSaving(true);
    try {
      const payload = {
        tfsa: toNum(tfsaStr),
        rrsp: toNum(rrspStr),
        tfsa_ytd: toNum(tfsaYtdStr),
        rrsp_ytd: toNum(rrspYtdStr),
      };
      const r = await fetch('/api/rooms', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? 'Save failed');
      setRoomsSaved({
        tfsaStr: String(payload.tfsa),
        rrspStr: String(payload.rrsp),
        tfsaYtdStr: String(payload.tfsa_ytd),
        rrspYtdStr: String(payload.rrsp_ytd),
      });
    } catch (e: any) {
      alert(e?.message || 'Save failed');
    } finally {
      setRoomsSaving(false);
    }
  };

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
        carry_forward_grantable_per_child: toNum(respStr.carry),
        catchup_years_per_child: Math.max(0, Number(respStr.catchup || '0')),
      };
      const r = await fetch('/api/resp-progress', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? 'Save failed');

      const saved = {
        total: String(payload.total_value),
        life:  String(payload.lifetime_contrib),
        year:  String(payload.contributed_this_year),
        kids:  payload.children_covered != null ? String(payload.children_covered) : '',
        carry: String(payload.carry_forward_grantable_per_child ?? 0),
        catchup: String(payload.catchup_years_per_child ?? 0),
        family: !!payload.is_family_resp,
      };
      setRespSaved(saved);
    } catch (e: any) {
      alert(e?.message || 'Save failed');
    } finally {
      setRespSaving(false);
    }
  };

  // ---------- computed for donuts ----------
  const tfsaRoom = toNum(tfsaStr);
  const rrspRoom = toNum(rrspStr);
  const tfsaYTD  = toNum(tfsaYtdStr);
  const rrspYTD  = toNum(rrspYtdStr);

  // For TFSA/RRSP donuts we show “contributed this year vs remaining room”.
  const tfsaTotalGrantable = tfsaRoom + tfsaYTD;
  const rrspTotalGrantable = rrspRoom + rrspYTD;

  const kids = Math.max(1, Number(respFamily ? (respStr.kids || '1') : '1'));
  const respLifeCap = kids * 50000;
  const respLifeUsed = toNum(respStr.life);
  const perChildGrantableThisYear = 2500 + toNum(respStr.carry);
  const respGrantableThisYearTotal = kids * perChildGrantableThisYear;
  const respContribYear = toNum(respStr.year);

  if (!session) {
    return (
      <main className="max-w-6xl mx-auto p-4">
        <div className="rounded-xl border bg-white p-6">Sign in to edit room & RESP progress.</div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">

      {/* TFSA & RRSP Room + YTD */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">TFSA &amp; RRSP Room (this year)</div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">TFSA room (remaining)</label>
            <input
              className="rounded-md border px-3 py-2"
              type="text"
              inputMode="decimal"
              placeholder="e.g., 6500"
              value={tfsaStr}
              onChange={e => setTfsaStr(e.target.value)}
            />
            <label className="text-xs text-gray-600 mt-3">TFSA contributed YTD</label>
            <input
              className="rounded-md border px-3 py-2"
              type="text"
              inputMode="decimal"
              placeholder="e.g., 1000"
              value={tfsaYtdStr}
              onChange={e => setTfsaYtdStr(e.target.value)}
            />
          </div>

          <div className="flex flex-col">
            <label className="text-xs text-gray-600">RRSP room (remaining)</label>
            <input
              className="rounded-md border px-3 py-2"
              type="text"
              inputMode="decimal"
              placeholder="e.g., 18000"
              value={rrspStr}
              onChange={e => setRrspStr(e.target.value)}
            />
            <label className="text-xs text-gray-600 mt-3">RRSP contributed YTD</label>
            <input
              className="rounded-md border px-3 py-2"
              type="text"
              inputMode="decimal"
              placeholder="e.g., 3000"
              value={rrspYtdStr}
              onChange={e => setRrspYtdStr(e.target.value)}
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
            title="TFSA YTD vs room"
            used={tfsaYTD}
            total={tfsaTotalGrantable}
            subtitle={`${CAD(tfsaYTD)} used / ${CAD(tfsaRoom)} left`}
          />
          <Donut
            title="RRSP YTD vs room"
            used={rrspYTD}
            total={rrspTotalGrantable}
            subtitle={`${CAD(rrspYTD)} used / ${CAD(rrspRoom)} left`}
          />
        </div>
      </section>

      {/* RESP */}
      {respAvail && (
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm font-medium mb-3">RESP Progress</div>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-end">
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
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-5">
            <Donut
              title="Lifetime cap"
              used={respLifeUsed}
              total={respLifeCap}
              subtitle={`${CAD(respLifeUsed)}/${CAD(respLifeCap)}`}
            />
            <Donut
              title="Grant path this year"
              used={respContribYear}
              total={respGrantableThisYearTotal}
              subtitle={`${CAD(respContribYear)}/${CAD(respGrantableThisYearTotal)}`}
            />
            <div className="flex flex-col gap-3 justify-center">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600 w-40">Carry-forward grantable / child</span>
                <input
                  className="rounded-md border px-3 py-2 w-40"
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g., 2500"
                  value={respStr.carry}
                  onChange={e => setRespStr(s => ({ ...s, carry: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600 w-40">Catch-up years / child</span>
                <input
                  className="rounded-md border px-3 py-2 w-40"
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g., 1"
                  value={respStr.catchup}
                  onChange={e => setRespStr(s => ({ ...s, catchup: e.target.value }))}
                />
              </div>
              <div className="flex justify-end">
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
          </div>
        </section>
      )}
    </main>
  );
}
