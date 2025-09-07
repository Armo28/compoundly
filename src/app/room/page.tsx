'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';

/** ---- types ---- */
type Rooms = { year: number; tfsa: number; rrsp: number };
type RespProgress = {
  total_value?: number | null;
  lifetime_contrib?: number | null;
  contributed_this_year?: number | null;
  is_family_resp?: boolean | null;
  children_covered?: number | null;
};

/** ---- utils ---- */
const CAD = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

const thisYear = new Date().getFullYear();

/** ---- page ---- */
export default function RoomPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  // always-passable headers (no undefined keys)
  const authHeaders = useMemo<HeadersInit>(() => {
    const h: Record<string, string> = {};
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  const jsonHeaders = useMemo<HeadersInit>(() => {
    const h: Record<string, string> = { 'content-type': 'application/json' };
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  // TFSA/RRSP (string-backed)
  const [tfsaStr, setTfsaStr] = useState('');
  const [rrspStr, setRrspStr] = useState('');
  const [roomsSaved, setRoomsSaved] = useState({ tfsaStr: '', rrspStr: '' });
  const [roomsSaving, setRoomsSaving] = useState(false);

  // RESP visibility (depends on having a RESP account)
  const [hasRESP, setHasRESP] = useState(false);

  // RESP (string-backed)
  const [respStr, setRespStr] = useState({ total: '', life: '', year: '', kids: '' });
  const [respFamily, setRespFamily] = useState(false);
  const [respSaved, setRespSaved] = useState({ total: '', life: '', year: '', kids: '', family: false });
  const [respSaving, setRespSaving] = useState(false);

  // helpers
  const toNum = (s: string) => {
    const n = Number((s ?? '').replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  };
  const strFromServer = (n: number | null | undefined) => (n == null || n === 0 ? '' : String(n));

  const dirtyRooms = tfsaStr !== roomsSaved.tfsaStr || rrspStr !== roomsSaved.rrspStr;
  const dirtyResp =
    hasRESP &&
    (respStr.total !== respSaved.total ||
      respStr.life !== respSaved.life ||
      respStr.year !== respSaved.year ||
      respFamily !== respSaved.family ||
      (respFamily && respStr.kids !== respSaved.kids));

  /** initial load */
  useEffect(() => {
    if (!token) return;

    let mounted = true;
    (async () => {
      // detect RESP account
      try {
        const r = await fetch('/api/accounts', { headers: authHeaders });
        const j = await r.json();
        const items = Array.isArray(j?.items) ? j.items : [];
        const has = items.some((a: any) => String(a?.type).toUpperCase() === 'RESP');
        if (mounted) setHasRESP(has);
      } catch {
        if (mounted) setHasRESP(false);
      }

      // rooms
      try {
        const r = await fetch('/api/rooms', { headers: authHeaders });
        const j = await r.json();
        const room = j?.room as Rooms | undefined;
        if (room && mounted) {
          const tfsa = strFromServer(room.tfsa);
          const rrsp = strFromServer(room.rrsp);
          setTfsaStr(tfsa);
          setRrspStr(rrsp);
          setRoomsSaved({ tfsaStr: tfsa, rrspStr: rrsp });
        }
      } catch {}

      // resp (only if user has RESP account)
      if (!mounted) return;
      if (!hasRESP) return;

      try {
        const r = await fetch('/api/resp-progress', { headers: authHeaders });
        const j = await r.json();
        const d: RespProgress | null = j?.data ?? null;
        if (!mounted) return;

        const total = strFromServer(d?.total_value);
        const life = strFromServer(d?.lifetime_contrib);
        const year = strFromServer(d?.contributed_this_year);
        const fam = !!d?.is_family_resp;
        const kids = strFromServer(d?.children_covered);
        setRespStr({ total, life, year, kids });
        setRespFamily(fam);
        setRespSaved({ total, life, year, kids, family: fam });
      } catch {
        // if no row yet, keep blanks
      }
    })();

    return () => {
      mounted = false;
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  /** save rooms */
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
    } catch (e: any) {
      alert(e?.message || 'Save failed');
    } finally {
      setRoomsSaving(false);
    }
  };

  /** save resp */
  const saveResp = async () => {
    if (!hasRESP || respSaving || !dirtyResp) return;
    setRespSaving(true);
    try {
      const payload = {
        total_value: toNum(respStr.total),
        lifetime_contrib: toNum(respStr.life),
        contributed_this_year: toNum(respStr.year),
        is_family_resp: !!respFamily,
        children_covered: respFamily ? Math.max(1, Number(respStr.kids || '1')) : 1,
      };
      const r = await fetch('/api/resp-progress', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? 'Save failed');

      const saved = {
        total: String(payload.total_value || ''),
        life: String(payload.lifetime_contrib || ''),
        year: String(payload.contributed_this_year || ''),
        kids: respFamily ? String(payload.children_covered) : '',
        family: !!payload.is_family_resp,
      };
      setRespSaved(saved);
    } catch (e: any) {
      alert(e?.message || 'Save failed');
    } finally {
      setRespSaving(false);
    }
  };

  if (!session) {
    return (
      <main className="max-w-6xl mx-auto p-4">
        <div className="rounded-xl border bg-white p-6">Sign in to edit room & RESP progress.</div>
      </main>
    );
  }

  /** charts (simple ring using CSS) */
  const kids = Math.max(1, respFamily ? Number(respStr.kids || '1') : 1);
  const lifetimeCap = 50000 * kids;
  const lifetimePct = Math.max(0, Math.min(100, (toNum(respStr.life) / lifetimeCap) * 100));

  // yearly grant path (grant-eligible contribution per child is typically 2,500/yr; max CESG per child lifetime 7,200)
  const perChildAnnualEligible = 2500;
  const perChildLifetimeGrantCap = 7200;
  const perChildGrantReceived = 0; // unknown exactly; we use contributed_this_year vs eligible path for UI gauge only
  const grantEligibleThisYear = perChildAnnualEligible * kids;
  const yearlyPct = Math.max(0, Math.min(100, (toNum(respStr.year) / grantEligibleThisYear) * 100));

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      {/* TFSA/RRSP */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">TFSA & RRSP Room (this year)</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">TFSA room</label>
            <input
              className="rounded-md border px-3 py-2"
              type="text"
              inputMode="decimal"
              placeholder="e.g., 6500"
              value={tfsaStr}
              onChange={(e) => setTfsaStr(e.target.value)}
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
              onChange={(e) => setRrspStr(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={saveRooms}
              disabled={!dirtyRooms || roomsSaving}
              className={
                !dirtyRooms || roomsSaving
                  ? 'rounded bg-gray-300 px-4 py-2 text-gray-600 cursor-not-allowed'
                  : 'rounded bg-emerald-600 px-4 py-2 text-white'
              }
            >
              {roomsSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </section>

      {/* RESP - only when user has RESP */}
      {hasRESP && (
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm font-medium mb-3">RESP Progress</div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-end">
            <div className="flex flex-col lg:col-span-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex flex-col">
                  <label className="text-xs text-gray-600">Total current value</label>
                  <input
                    className="rounded-md border px-3 py-2"
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g., 20000"
                    value={respStr.total}
                    onChange={(e) => setRespStr((s) => ({ ...s, total: e.target.value }))}
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
                    onChange={(e) => setRespStr((s) => ({ ...s, life: e.target.value }))}
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
                    onChange={(e) => setRespStr((s) => ({ ...s, year: e.target.value }))}
                  />
                </div>
              </div>

              <div className="mt-3 flex items-center gap-4">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={respFamily} onChange={(e) => setRespFamily(e.target.checked)} />
                  <span className="text-sm">Family RESP</span>
                </label>
                {respFamily && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600"># Children</span>
                    <input
                      className="w-20 rounded-md border px-2 py-1"
                      type="text"
                      inputMode="numeric"
                      placeholder="e.g., 2"
                      value={respStr.kids}
                      onChange={(e) => setRespStr((s) => ({ ...s, kids: e.target.value }))}
                    />
                  </div>
                )}
                <div className="ml-auto">
                  <button
                    onClick={saveResp}
                    disabled={!dirtyResp || respSaving}
                    className={
                      !dirtyResp || respSaving
                        ? 'rounded bg-gray-300 px-4 py-2 text-gray-600 cursor-not-allowed'
                        : 'rounded bg-emerald-600 px-4 py-2 text-white'
                    }
                  >
                    {respSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>

            {/* charts */}
            <div className="lg:col-span-2 grid grid-cols-2 gap-4">
              <Ring
                pct={lifetimePct}
                label={`Lifetime cap (${CAD(toNum(respStr.life))}/${CAD(lifetimeCap)})`}
              />
              <Ring
                pct={yearlyPct}
                label={`Grant path this year (${CAD(toNum(respStr.year))}/${CAD(grantEligibleThisYear)})`}
              />
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

/** simple ring progress */
function Ring({ pct, label }: { pct: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const deg = clamped * 3.6;
  return (
    <div className="flex flex-col items-center">
      <div
        className="relative h-28 w-28 rounded-full"
        style={{
          background: `conic-gradient(rgb(99,102,241) ${deg}deg, #e5e7eb ${deg}deg 360deg)`,
        }}
      >
        <div className="absolute inset-2 rounded-full bg-white flex items-center justify-center text-sm font-medium">
          {Math.round(clamped)}%
        </div>
      </div>
      <div className="mt-2 text-xs text-gray-600 text-center">{label}</div>
    </div>
  );
}
