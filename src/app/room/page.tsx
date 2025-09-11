'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';

type Rooms = { year: number; tfsa: number; rrsp: number };
type RespRow = {
  year: number;
  total_value: number;
  lifetime_contrib: number;
  contributed_this_year: number;
  is_family_resp: boolean;
  children_covered: number;
};

export default function RoomPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  const authHeaders = useMemo(() => {
    const h = new Headers();
    if (token) h.set('authorization', `Bearer ${token}`);
    return h as HeadersInit;
  }, [token]);

  const jsonHeaders = useMemo(() => {
    const h = new Headers();
    if (token) h.set('authorization', `Bearer ${token}`);
    h.set('content-type', 'application/json');
    return h as HeadersInit;
  }, [token]);

  // TFSA/RRSP
  const [tfsaStr, setTfsaStr] = useState('');
  const [rrspStr, setRrspStr] = useState('');
  const [roomsSaved, setRoomsSaved] = useState({ tfsaStr: '', rrspStr: '' });
  const [roomsSaving, setRoomsSaving] = useState(false);

  // RESP
  const [hasRespAccount, setHasRespAccount] = useState(false);
  const [respVisible, setRespVisible] = useState(false);
  const [respLoading, setRespLoading] = useState(true);
  const [respSaving, setRespSaving] = useState(false);

  const [totalStr, setTotalStr] = useState('');
  const [lifeStr, setLifeStr] = useState('');
  const [ytdStr, setYtdStr] = useState('');
  const [family, setFamily] = useState(false);
  const [kidsStr, setKidsStr] = useState('');

  const [respSaved, setRespSaved] = useState({ total:'', life:'', ytd:'', family:false, kids:'' });

  const toNum = (s: string) => {
    const n = Number((s ?? '').replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : 0;
    // (string-backed inputs avoid flicker/forced zeros)
  };

  const dirtyRooms = tfsaStr !== roomsSaved.tfsaStr || rrspStr !== roomsSaved.rrspStr;
  const dirtyResp =
    respVisible && (
      totalStr !== respSaved.total ||
      lifeStr  !== respSaved.life  ||
      ytdStr   !== respSaved.ytd   ||
      family   !== respSaved.family||
      (family && kidsStr !== respSaved.kids)
    );

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!token) return;

      // Rooms
      try {
        const r = await fetch('/api/rooms', { headers: authHeaders });
        const j = await r.json();
        const room = j?.room as Rooms | undefined;
        if (mounted && room) {
          const tfsa = room.tfsa ? String(room.tfsa) : '';
          const rrsp = room.rrsp ? String(room.rrsp) : '';
          setTfsaStr(tfsa);
          setRrspStr(rrsp);
          setRoomsSaved({ tfsaStr: tfsa, rrspStr: rrsp });
        }
      } catch {}

      // Do we have a RESP account?
      try {
        const r = await fetch('/api/accounts', { headers: authHeaders });
        const j = await r.json();
        const has = Array.isArray(j?.items) && j.items.some((a: any) => (a.type ?? '').toUpperCase() === 'RESP');
        if (mounted) setHasRespAccount(!!has);
      } catch {
        if (mounted) setHasRespAccount(false);
      }

      // Load RESP progress (if exists)
      try {
        const r = await fetch('/api/resp-progress', { headers: authHeaders });
        const j = await r.json();
        const d = j?.data as RespRow | undefined;
        if (mounted && d) {
          const total = d.total_value ? String(d.total_value) : '';
          const life  = d.lifetime_contrib ? String(d.lifetime_contrib) : '';
          const ytd   = d.contributed_this_year ? String(d.contributed_this_year) : '';
          const fam   = !!d.is_family_resp;
          const kids  = d.children_covered ? String(d.children_covered) : '';
          setTotalStr(total);
          setLifeStr(life);
          setYtdStr(ytd);
          setFamily(fam);
          setKidsStr(kids);
          setRespSaved({ total, life, ytd, family: fam, kids });
          setRespVisible(!!hasRespAccount || !!(total || life || ytd));
        }
      } catch {
        if (mounted) setRespVisible(!!hasRespAccount);
      } finally {
        if (mounted) setRespLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [token, authHeaders, hasRespAccount]);

  const saveRooms = async () => {
    if (!dirtyRooms || roomsSaving) return;
    setRoomsSaving(true);
    try {
      const payload = { tfsa: toNum(tfsaStr), rrsp: toNum(rrspStr) };
      const r = await fetch('/api/rooms', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? 'Save failed');
      setRoomsSaved({ tfsaStr: String(payload.tfsa), rrspStr: String(payload.rrsp) });
    } catch (e: any) {
      alert(e?.message || 'Save failed');
    } finally {
      setRoomsSaving(false);
    }
  };

  const saveResp = async () => {
    if (!respVisible || respSaving || !dirtyResp) return;
    setRespSaving(true);
    try {
      const payload = {
        total_value: toNum(totalStr),
        lifetime_contrib: toNum(lifeStr),
        contributed_this_year: toNum(ytdStr),
        is_family_resp: !!family,
        children_covered: family ? Math.max(1, Number(kidsStr || '1')) : 1,
      };
      const r = await fetch('/api/resp-progress', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? 'Save failed');

      const saved = {
        total: String(payload.total_value),
        life:  String(payload.lifetime_contrib),
        ytd:   String(payload.contributed_this_year),
        family: !!payload.is_family_resp,
        kids:  payload.children_covered ? String(payload.children_covered) : '',
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

  // Simple donut (CSS) to avoid extra deps
  const Donut = ({ pct, label }: { pct: number; label: string }) => {
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    const angle = (clamped / 100) * 360;
    const bg = `conic-gradient(#4f46e5 ${angle}deg, #e5e7eb 0deg)`;
    return (
      <div className="flex flex-col items-center">
        <div className="h-28 w-28 rounded-full" style={{ background: bg }}>
          <div className="h-20 w-20 mt-4 ml-4 rounded-full bg-white flex items-center justify-center text-sm font-medium">
            {clamped}%
          </div>
        </div>
        <div className="mt-2 text-xs text-gray-600 text-center">{label}</div>
      </div>
    );
  };

  // Donut math
  const kids = Math.max(1, Number(kidsStr || '1'));
  const lifeCap = 50000 * (family ? kids : 1);
  const lifePct = lifeCap === 0 ? 0 : (toNum(lifeStr) / lifeCap) * 100;

  // CESG grant path per year: $2,500 eligible contrib per child → track percentage toward that
  const perChildGrantable = 2500;
  const yearCap = perChildGrantable * (family ? kids : 1);
  const ytdPct = yearCap === 0 ? 0 : (toNum(ytdStr) / yearCap) * 100;

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">TFSA & RRSP Room (this year)</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">TFSA room</label>
            <input className="rounded-md border px-3 py-2" type="text" inputMode="decimal"
              placeholder="e.g., 6500" value={tfsaStr} onChange={e => setTfsaStr(e.target.value)} />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">RRSP room</label>
            <input className="rounded-md border px-3 py-2" type="text" inputMode="decimal"
              placeholder="e.g., 18000" value={rrspStr} onChange={e => setRrspStr(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button onClick={saveRooms} disabled={!dirtyRooms || roomsSaving}
              className={(!dirtyRooms || roomsSaving) ? 'rounded bg-gray-300 px-4 py-2 text-gray-600 cursor-not-allowed' : 'rounded bg-emerald-600 px-4 py-2 text-white'}>
              {roomsSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </section>

      {respVisible && !respLoading && (
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm font-medium mb-3">RESP Progress</div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
            <div className="flex flex-col">
              <label className="text-xs text-gray-600">Total current value</label>
              <input className="rounded-md border px-3 py-2" type="text" inputMode="decimal"
                placeholder="e.g., 20000" value={totalStr} onChange={e => setTotalStr(e.target.value)} />
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-gray-600">Lifetime contributed</label>
              <input className="rounded-md border px-3 py-2" type="text" inputMode="decimal"
                placeholder="e.g., 12000" value={lifeStr} onChange={e => setLifeStr(e.target.value)} />
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-gray-600">Contributed this year</label>
              <input className="rounded-md border px-3 py-2" type="text" inputMode="decimal"
                placeholder="e.g., 1000" value={ytdStr} onChange={e => setYtdStr(e.target.value)} />
            </div>

            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={family} onChange={e => setFamily(e.target.checked)} />
              <span className="text-sm">Family RESP</span>
            </label>

            {family && (
              <div className="flex flex-col">
                <label className="text-xs text-gray-600"># Children covered</label>
                <input className="rounded-md border px-3 py-2" type="text" inputMode="numeric"
                  placeholder="e.g., 2" value={kidsStr} onChange={e => setKidsStr(e.target.value)} />
              </div>
            )}

            <div className="sm:col-span-5 flex justify-between items-center">
              <div className="flex gap-6">
                <Donut pct={lifePct} label={`Lifetime cap (${toNum(lifeStr).toLocaleString('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0})}/${lifeCap.toLocaleString('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0})})`} />
                <Donut pct={ytdPct} label={`Grant path this year (${toNum(ytdStr).toLocaleString('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0})}/${yearCap.toLocaleString('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0})})`} />
              </div>
              <button onClick={saveResp} disabled={!dirtyResp || respSaving}
                className={(!dirtyResp || respSaving) ? 'rounded bg-gray-300 px-4 py-2 text-gray-600 cursor-not-allowed' : 'rounded bg-emerald-600 px-4 py-2 text-white'}>
                {respSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
