// src/app/room/page.tsx
'use client';
import { useEffect, useMemo, useState } from 'react';

function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }

function DonutProgress({
  percent, color = '#2563eb', bg = '#e5e7eb',
  width = 144, height = 112, innerRadius = 26, outerRadius = 38,
}: { percent: number; color?: string; bg?: string; width?: number; height?: number; innerRadius?: number; outerRadius?: number }) {
  const cx = width / 2, cy = height / 2;
  const p = clamp(percent, 0, 100);
  const sweep = (p / 100) * 360;
  const arc = (rO: number, rI: number, a0: number, a1: number) => {
    const toXY = (r: number, ang: number) => {
      const rad = ((ang - 90) * Math.PI) / 180;
      return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    };
    const sO = toXY(rO, a1), eO = toXY(rO, a0);
    const sI = toXY(rI, a1), eI = toXY(rI, a0);
    const large = a1 - a0 <= 180 ? 0 : 1;
    return `M ${sO.x} ${sO.y} A ${rO} ${rO} 0 ${large} 0 ${eO.x} ${eO.y} L ${eI.x} ${eI.y} A ${rI} ${rI} 0 ${large} 1 ${sI.x} ${sI.y} Z`;
  };
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block">
      <path d={arc(outerRadius, innerRadius, 0, 359.999)} fill={bg} />
      {p > 0 && <path d={arc(outerRadius, innerRadius, 0, sweep)} fill={color} />}
      <circle cx={cx} cy={cy} r={innerRadius - 1} fill="#fff" />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="14" className="font-semibold" fill="#111827">{Math.round(p)}%</text>
    </svg>
  );
}

export default function RoomPage() {
  const [tfsaStr, setTfsaStr] = useState('');
  const [rrspStr, setRrspStr] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/rooms', { cache: 'no-store' });
      const json = await res.json();
      if (json?.ok && json.room) {
        setTfsaStr(json.room.tfsa ? String(json.room.tfsa) : '');
        setRrspStr(json.room.rrsp ? String(json.room.rrsp) : '');
      }
    })();
  }, []);

  const tfsa = tfsaStr === '' ? 0 : Number(tfsaStr);
  const rrsp = rrspStr === '' ? 0 : Number(rrspStr);

  // (demo) pretend deposited so far from another feed
  const tfsaDeposited = 2500;
  const rrspDeposited = 8200;

  const tfsaPct = tfsa > 0 ? (tfsaDeposited / tfsa) * 100 : 0;
  const rrspPct = rrsp > 0 ? (rrspDeposited / rrsp) * 100 : 0;

  async function save() {
    setSaved(null);
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tfsa: tfsaStr === '' ? 0 : Number(tfsaStr), rrsp: rrspStr === '' ? 0 : Number(rrspStr) }),
    });
    const json = await res.json();
    if (json?.ok) setSaved('Saved!');
    else setSaved(json?.error ?? 'Error');
  }

  return (
    <main className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="rounded-xl border bg-white p-4">
        <div className="text-sm font-medium mb-3">Contribution Room — {new Date().getFullYear()}</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="block">
            <span className="text-sm text-gray-600">TFSA room</span>
            <input
              className="mt-1 w-full border rounded-lg px-3 py-2"
              placeholder="e.g. 6500"
              value={tfsaStr}
              onChange={(e) => {
                const v = e.target.value;
                if (/^\d*$/.test(v)) setTfsaStr(v);
              }}
              inputMode="numeric"
            />
          </label>

          <label className="block">
            <span className="text-sm text-gray-600">RRSP room</span>
            <input
              className="mt-1 w-full border rounded-lg px-3 py-2"
              placeholder="e.g. 18000"
              value={rrspStr}
              onChange={(e) => {
                const v = e.target.value;
                if (/^\d*$/.test(v)) setRrspStr(v);
              }}
              inputMode="numeric"
            />
          </label>

          <div className="flex items-end">
            <button onClick={save} className="rounded-lg bg-blue-600 text-white px-4 py-2 w-full">
              Save
            </button>
          </div>
        </div>
        {saved && <p className="text-sm mt-2">{saved}</p>}
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="text-sm font-medium mb-3">Room filled</div>
        <div className="grid grid-cols-2 gap-6">
          <div className="flex items-center gap-4">
            <DonutProgress percent={tfsaPct} color="#34d399" bg="#e8f7f0" />
            <div className="text-sm">
              <div className="font-medium">TFSA</div>
              <div className="text-gray-500">Deposited: ${tfsaDeposited.toLocaleString()}</div>
              <div className="text-gray-500">Room: ${tfsa.toLocaleString()}</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <DonutProgress percent={rrspPct} color="#60a5fa" bg="#e8f0fe" />
            <div className="text-sm">
              <div className="font-medium">RRSP</div>
              <div className="text-gray-500">Deposited: ${rrspDeposited.toLocaleString()}</div>
              <div className="text-gray-500">Room: ${rrsp.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
