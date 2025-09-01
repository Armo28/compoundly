'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';

const CAD = (n: number) =>
  n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  });

const compact = (n: number) => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'CAD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    return CAD(n);
  }
};

type HistoryPt = { taken_on: string; total: number };
type Summary = {
  byType: Record<string, number>;
  overall: number;
  history: HistoryPt[];
};

function Donut({
  parts,
  total,
}: {
  parts: { key: string; val: number; color: string }[];
  total: number;
}) {
  const size = 220,
    cx = size / 2,
    cy = size / 2,
    rO = 90,
    rI = 58;
  const sum = parts.reduce((a, p) => a + p.val, 0) || 1;
  let a0 = 0;
  const arcs = parts.map((p) => {
    const frac = p.val / sum,
      sweep = frac * 2 * Math.PI,
      a1 = a0 + sweep;
    const sox = cx + Math.cos(a0) * rO,
      soy = cy + Math.sin(a0) * rO;
    const eox = cx + Math.cos(a1) * rO,
      eoy = cy + Math.sin(a1) * rO;
    const six = cx + Math.cos(a1) * rI,
      siy = cy + Math.sin(a1) * rI;
    const esx = cx + Math.cos(a0) * rI,
      esy = cy + Math.sin(a0) * rI;
    const large = sweep > Math.PI ? 1 : 0;
    a0 = a1;
    const d = `M ${sox} ${soy} A ${rO} ${rO} 0 ${large} 1 ${eox} ${eoy} L ${six} ${siy} A ${rI} ${rI} 0 ${large} 0 ${esx} ${esy} Z`;
    return { d, color: p.color, key: p.key, val: p.val };
  });

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">Account Allocation</div>
        <div className="flex gap-3 text-xs text-gray-700 flex-wrap">
          {parts.map((p) => (
            <span key={p.key} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{ background: p.color }}
              />
              {p.key}
            </span>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-56">
        {arcs.map((a) => (
          <path key={a.key} d={a.d} fill={a.color} opacity={0.95} />
        ))}
        <circle cx={cx} cy={cy} r={rI - 1} fill="#fff" />
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          fontSize="12"
          fill="#6b7280"
        >
          Total
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          fontSize="16"
          className="font-semibold"
          fill="#111827"
        >
          {CAD(total)}
        </text>
      </svg>
    </div>
  );
}

function Chart({
  actual,
  proj,
  yearsFuture,
  onSetYearsFuture,
}: {
  actual: { m: number; v: number }[];
  proj: { m: number; v: number }[];
  yearsFuture: number;
  onSetYearsFuture: (n: number) => void;
}) {
  const padL = 56,
    padR = 16,
    padT = 16,
    padB = 40,
    w = 860,
    h = 320;

  const all = [...actual, ...proj];
  const minX = Math.min(...all.map((p) => p.m), 0),
    maxX = Math.max(...all.map((p) => p.m), yearsFuture * 12);

  // Fix 0% growth case: keep equity line in middle instead of top
  const actualLast = actual[actual.length - 1]?.v ?? 0;
  let minY = 0,
    maxY = Math.max(1, ...all.map((p) => p.v));
  if (proj.every((p) => p.v === actualLast)) {
    // Flat case → center line
    const pad = actualLast * 0.5 || 1000;
    minY = Math.max(0, actualLast - pad);
    maxY = actualLast + pad;
  }

  const innerW = w - padL - padR,
    innerH = h - padT - padB;
  const sx = (m: number) =>
    padL + (m - minX) * (innerW / (maxX - minX || 1));
  const sy = (v: number) =>
    padT + (maxY - v) * (innerH / (maxY - minY || 1));

  const line = (pts: { m: number; v: number }[]) =>
    pts.map((p, i) => `${i ? 'L' : 'M'} ${sx(p.m)} ${sy(p.v)}`).join(' ');

  const area = (pts: { m: number; v: number }[]) => {
    if (!pts.length) return '';
    const first = pts[0],
      last = pts[pts.length - 1];
    return `${line(pts)} L ${sx(last.m)} ${sy(minY)} L ${sx(first.m)} ${sy(
      minY
    )} Z`;
  };

  // ticks
  const ticksY = 5;
  const yTicks = new Array(ticksY + 1)
    .fill(0)
    .map((_, i) => minY + (i * (maxY - minY)) / ticksY);

  const futureYears = yearsFuture;
  const showMonthly = futureYears <= 2; // months only if ≤ 2 years
  const xTicks: number[] = [];
  if (showMonthly) {
    for (let m = Math.ceil(minX); m <= Math.floor(maxX); m++) xTicks.push(m);
  } else {
    const startY = Math.ceil(minX / 12),
      endY = Math.floor(maxX / 12);
    for (let y = startY; y <= endY; y++) xTicks.push(y * 12);
  }

  // controls
  const dec = futureYears > 10 ? 5 : 1;
  const minusLabel = futureYears > 10 ? '-5' : '-1';
  const onMinus = () => onSetYearsFuture(Math.max(1, futureYears - dec));
  const onPlus = () => onSetYearsFuture(Math.min(40, futureYears + 5));

  // Tooltip
  const [hover, setHover] = useState<{ x: number; y: number; val: number } | null>(null);

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">Portfolio Value (Actual &amp; Projected)</div>
        <div className="flex items-center gap-4 text-xs text-gray-700">
          <span className="inline-flex items-center gap-2">
            <svg width="18" height="8">
              <line
                x1="0"
                y1="4"
                x2="18"
                y2="4"
                stroke="#111827"
                strokeWidth="3"
              />
            </svg>
            Actual (area filled)
          </span>
          <span className="inline-flex items-center gap-2">
            <svg width="44" height="8">
              <line
                x1="0"
                y1="4"
                x2="44"
                y2="4"
                stroke="#22c55e"
                strokeWidth="3"
                strokeDasharray="6 6"
              />
            </svg>
            Projection
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-80"
        onMouseMove={(e) => {
          const rect = (e.target as SVGElement).getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const closest = [...actual, ...proj].reduce((a, b) =>
            Math.abs(sx(b.m) - mx) < Math.abs(sx(a.m) - mx) ? b : a
          );
          setHover({ x: sx(closest.m), y: sy(closest.v), val: closest.v });
        }}
        onMouseLeave={() => setHover(null)}
      >
        {/* axes */}
        <line
          x1={padL}
          y1={h - padB}
          x2={w - padR}
          y2={h - padB}
          stroke="#e5e7eb"
        />
        <line
          x1={padL}
          y1={padT}
          x2={padL}
          y2={h - padB}
          stroke="#e5e7eb"
        />

        {/* y grid + labels */}
        {yTicks.map((v, i) => (
          <g key={`y-${i}`}>
            <line
              x1={padL}
              y1={sy(v)}
              x2={w - padR}
              y2={sy(v)}
              stroke="#f3f4f6"
            />
            <text
              x={padL - 8}
              y={sy(v) + 3}
              fontSize="10"
              textAnchor="end"
              fill="#6b7280"
            >
              {compact(v).replace('CA', '')}
            </text>
          </g>
        ))}

        {/* x ticks */}
        {xTicks.map((m, i) => (
          <g key={`x-${i}`}>
            <line
              x1={sx(m)}
              y1={h - padB}
              x2={sx(m)}
              y2={h - padB + 6}
              stroke="#d1d5db"
            />
            <text
              x={sx(m)}
              y={h - padB + 18}
              fontSize="10"
              textAnchor="middle"
              fill="#6b7280"
            >
              {showMonthly
                ? new Date(new Date().getFullYear(), new Date().getMonth() + m).toLocaleString(
                    undefined,
                    { month: 'short' }
                  )
                : new Date().getFullYear() + Math.round(m / 12)}
            </text>
          </g>
        ))}

        {/* fills + lines */}
        <path d={area(actual)} fill="#11182714" />
        <path d={line(actual)} fill="none" stroke="#111827" strokeWidth={2.5} />
        <defs>
          <linearGradient id="projFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <path d={area(proj)} fill="url(#projFill)" />
        <path
          d={line(proj)}
          fill="none"
          stroke="#22c55e"
          strokeWidth={2.5}
          strokeDasharray="6 6"
        />

        {/* tooltip */}
        {hover && (
          <g>
            <circle cx={hover.x} cy={hover.y} r={4} fill="black" />
            <rect
              x={hover.x + 8}
              y={hover.y - 20}
              width="80"
              height="20"
              fill="white"
              stroke="#ccc"
              rx="4"
            />
            <text
              x={hover.x + 48}
              y={hover.y - 6}
              textAnchor="middle"
              fontSize="10"
              fill="#111827"
            >
              {CAD(hover.val)}
            </text>
          </g>
        )}
      </svg>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={onMinus}
          className="rounded-md border px-3 py-1 text-sm"
        >
          {minusLabel}
        </button>
        <button
          onClick={onPlus}
          className="rounded-md border px-3 py-1 text-sm"
        >
          +5
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { session, loading } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [monthly, setMonthly] = useState<number>(1000);
  const [rate, setRate] = useState<number>(10); // %
  const [yearsFuture, setYearsFuture] = useState<number>(10);

  const token = session?.access_token ?? '';

  useEffect(() => {
    if (!token) return;
    (async () => {
      const res = await fetch('/api/summary', {
        headers: { authorization: `Bearer ${token}` },
      });
      const j = await res.json();
      if (j?.ok) setSummary(j);
    })();
  }, [token]);

  const actual = useMemo(() => {
    if (!summary?.history?.length) {
      return [{ m: 0, v: summary?.overall ?? 0 }];
    }
    const pts = summary.history
      .map((h) => {
        const d = new Date(h.taken_on);
        const now = new Date();
        const months =
          (d.getFullYear() - now.getFullYear()) * 12 +
          (d.getMonth() - now.getMonth());
        return { m: months, v: Number(h.total || 0) };
      })
      .filter((p) => p.m <= 0);
    if (pts.length === 0 || pts[pts.length - 1].m < 0)
      pts.push({ m: 0, v: summary?.overall ?? 0 });
    return pts;
  }, [summary]);

  const proj = useMemo(() => {
    const start = actual[actual.length - 1]?.v ?? 0;
    const months = yearsFuture * 12;
    const r = rate / 100 / 12;
    const out: { m: number; v: number }[] = [{ m: 0, v: start }];
    let v = start;
    for (let i = 1; i <= months; i++) {
      v = Math.max(0, v * (1 + r) + monthly);
      out.push({ m: i, v });
    }
    return out;
  }, [actual, yearsFuture, monthly, rate]);

  const parts = useMemo(() => {
    const bt = summary?.byType ?? {};
    const palette: Record<string, string> = {
      TFSA: '#34d399',
      RRSP: '#60a5fa',
      RESP: '#fbbf24',
      Margin: '#f472b6',
      Other: '#a78bfa',
      LIRA: '#f59e0b',
    };
    const keys = Object.keys(bt);
    return keys.map((k) => ({
      key: k,
      val: bt[k],
      color: palette[k] ?? '#9ca3af',
    }));
  }, [summary]);

  if (loading)
    return (
      <main className="max-w-6xl mx-auto p-4">
        <div className="rounded-xl border bg-white p-6">Loading…</div>
      </main>
    );
  if (!session)
    return (
      <main className="max-w-6xl mx-auto p-4">
        <div className="rounded-xl border bg-white p-6">
          Sign in to view your dashboard.
        </div>
      </main>
    );

  return (
    <main className="max-w-6xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Chart
          actual={actual}
          proj={proj}
          yearsFuture={yearsFuture}
          onSetYearsFuture={setYearsFuture}
        />
        <div className="rounded-2xl border bg-white p-3 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <label className="text-sm font-medium">
              Monthly Contribution
            </label>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600 min-w-[80px] text-right">
                {CAD(monthly)}
              </span>
              <input
                className="w-64 h-2 rounded-lg bg-gray-200 appearance-none accent-blue-600"
                type="range"
                min={0}
                max={10000}
                step={100}
                value={monthly}
                onChange={(e) =>
                  setMonthly(Math.round(+e.target.value / 100) * 100)
                }
              />
            </div>
          </div>
          <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <label className="text-sm font-medium">Annual Growth</label>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600 min-w-[80px] text-right">
                {rate}%
              </span>
              <input
                className="w-64 h-2 rounded-lg bg-gray-200 appearance-none accent-green-600"
                type="range"
                min={0}
                max={100}
                step={1}
                value={rate}
                onChange={(e) => setRate(+e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <Donut parts={parts} total={summary?.overall ?? 0} />
      </div>
    </main>
  );
}
