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

export default function RoomPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  // TFSA/RRSP (string-backed)
  const [tfsaStr, setTfsaStr] = useState('');
  const [rrspStr, setRrspStr] = useState('');
  const [roomsSaved, setRoomsSaved] = useState({ tfsaStr: '', rrspStr: '' });
  const [roomsSaving, setRoomsSaving] = useState(false);

  // RESP (string-backed)
  const [respAvail, setRespAvail] = useState(true);
  const [respStr, setRespStr] = useState({ total:'', life:'', year:'', kids:'' });
  const [respFamily, setRespFamily] = useState(false);
  const [respSaved, setRespSaved] = useState({ total:'', life:'', year:'', kids:'', family:false });
  const [respSaving, setRespSaving] = useState(false);

  const authHeaders = useMemo<HeadersInit>(() => (
    token ? { authorization: `Bearer ${token}` } : {}
  ), [token]);

  const jsonHeaders = useMemo<HeadersInit>(() => (
    token
      ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
      : { 'content-type': 'application/json' }
  ), [token]);

  const toNum = (s: string) => {
    const n = Number((s ?? '').replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  };

  const strFromServer = (n: number | null | undefined) => {
    // show blanks for 0/undefined so user doesn't fight a default "0"
    if (n == null || n === 0) return '';
    return String(n);
  };

  const dirtyRooms = tfsaStr !== roomsSaved.tfsaStr || rrspStr !== roomsSaved.rrspStr;
  const dirtyResp =
    respAvail &&
    (respStr.total !== respSaved.total ||
     respStr.life  !== respSaved.life  ||
     respStr.year  !== respSaved.year  ||
     respFamily    !== respSaved.family ||
     (respFamily && respStr.kids !== respSaved.kids));

  // initial fetch (once)
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
          setTfsaStr(tfsa);
          setRrspStr(rrsp);
          setRoomsSaved({ tfsaStr: tfsa, rrspStr: rrsp });
        }
      } catch {}

      // resp (optional)
      try {
        const r = await fetch('/api/resp-progress', { headers: authHeaders });
        if (!r.ok) throw new Error('no resp api');
        const j = await r.json();
        const d: RespProgress | null = j?.data ?? null;
        if (!mounted) return;

        setRespAvail(true);
        const total = strFromServer(d?.total_value);
        const life  = strFromServer(d?.lifetime_contrib);
        const year  = strFromServer(d?.contributed_this_year);
        const fam   = !!d?.is_family_resp;
        const kids  = strFromServer(d?.children_covered);

        setRespStr({ total, life, year, kids });
        setRespFamily(fam);
        setRespSaved({ total, life, year, kids, family: fam });
      } catch {
        if (!mounted) return;
        setRespAvail(false);
      }
    })();
    return () => { mounted = false; };
  }, [token, authHeaders]);

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

  const saveResp = async () => {
    if (!respAvail || respSaving || !dirtyResp) return;
    setRespSaving(true);
    try {
      const payload: any = {
        total_value: toNum(respStr.total),
        lifetime_contrib: toNum(respStr.life),
        contributed_this_year: toNum(respStr.year),
        is_family_resp: !!respFamily,
        children_covered: respFamily ? Math.max(1, Number(respStr.kids || '1')) : null,
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
        <div className="rounded-xl border bg-white p-6">Sign in to edit room & RESP progress.</div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
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
      </section>

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

            <div className="sm:col-span-5 flex justify-end">
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
        </section>
      )}
    </main>
  );
}
