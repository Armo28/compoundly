'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';

const CAD = (n: number) =>
  n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  });

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

type Pt = { m: number; v: number };

// fractional months from now (negative = past)
function monthsFromNow(d: Date) {
  const now = new Date();
  const ms = d.getTime() - now.getTime();
  return ms / (1000 * 60 * 60 * 24 * 30.4375); // avg month length
}
function dateFromMonths(m: number) {
  const now = new Date();
  const ms = m * 30.4375 * 24 * 3600 * 1000;
  return new Date(now.getTime() + ms);
}

// compact Y-axis labels
const compact = (n: number) =>
  new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);

function Chart({
  actual,
  proj,
  yearsFuture,
  onSetYearsFuture,
  yPad = 0.2,
}: {
  actual: Pt[];
  proj: Pt[];
  yearsFuture: number;
  onSetYearsFuture: (n: number) => void;
  yPad?: number;
}) {
  const padL = 56,
    padR = 16,
    padT = 16,
    padB = 48,
    w = 860,
    h = 320;

  const all = [...actual, ...proj];
  const minX = Math.min(0, ...all.map((p) => p.m));
  const maxX = Math.max(yearsFuture * 12, ...all.map((p) => p.m));

  let minY = 0;
  let maxY = Math.max(1, ...all.map((p) => p.v));
  if (maxY === 0) maxY = 1;

  const padAmount = (maxY - minY) * yPad;
  minY = Math.max(0, minY - padAmount * 0.1);
  maxY = maxY + padAmount;

  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const sx = (m: number) => padL + ((m - minX) * innerW) / (maxX - minX || 1);
  const sy = (v: number) =>
    padT + ((maxY - v) * innerH) / (maxY - minY || 1);

  const mkLine = (pts: Pt[]) =>
    pts
      .map((p, i) => `${i ? 'L' : 'M'} ${sx(p.m).toFixed(2)} ${sy(p.v).toFixed(2)}`)
      .join(' ');

  const mkArea = (pts: Pt[]) => {
    if (pts.length < 2) return '';
    const first = pts[0],
      last = pts[pts.length - 1];
    return `${mkLine(pts)} L ${sx(last.m)} ${sy(0)} L ${sx(first.m)} ${sy(0)} Z`;
  };

  // ===== X ticks: weekly (<= 0.5y), monthly (<= 2y), yearly (> 2y) =====
  const showWeekly = yearsFuture <= 0.5;    // <= 6 months
  const showMonthly = !showWeekly && yearsFuture <= 2;
  const xTicks: number[] = [];
  if (showWeekly) {
    const weekM = 7 / 30.4375;
    const start = Math.ceil(minX / weekM) * weekM;
    for (let m = start; m <= maxX + 1e-6; m += weekM) xTicks.push(m);
  } else if (showMonthly) {
    for (let m = Math.ceil(minX); m <= Math.floor(maxX); m += 1) xTicks.push(m);
  } else {
    const startYear = Math.ceil(minX / 12);
    const endYear = Math.floor(maxX / 12);
    const totalYears = endYear - startYear + 1;
    const step = Math.max(1, Math.ceil(totalYears / 10));
    for (let y = startYear; y <= endYear; y += step) xTicks.push(y * 12);
  }

  // ===== Tooltip (stays pinned to cursor; auto-flips near right edge) =====
  const [hover, setHover] = useState<{ x: number; y: number; m: number } | null>(
    null
  );
  const svgRef = useRef<SVGSVGElement | null>(null);

  const handleMouseMove = (ev: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const local = pt.matrixTransform(ctm.inverse());
    const X = Math.min(w - padR, Math.max(padL, local.x));
    const Y = Math.min(h - padB, Math.max(padT, local.y));
    const m = minX + ((X - padL) / innerW) * (maxX - minX || 1);
    setHover({ x: X, y: Y, m });
  };
  const handleMouseLeave = () => setHover(null);

  const valueAt = (m: number) => {
    if (proj.length === 0) return 0;
    if (m <= proj[0].m) return proj[0].v;
    for (let i = 1; i < proj.length; i++) {
      const a = proj[i - 1],
        b = proj[i];
      if (m <= b.m) {
        const t = (m - a.m) / (b.m - a.m || 1);
        return a.v + t * (b.v - a.v);
      }
    }
    return proj[proj.length - 1].v;
  };

  // ===== Zoom buttons: finer steps for small windows =====
  const step =
    yearsFuture <= 0.5 ? 0.1 : yearsFuture <= 2 ? 0.5 : 5; // years
  const minusLabel = `-${step}`;
  const plusLabel = `+${step}`;
  const onMinus = () => onSetYearsFuture(Math.max(0.1, +(yearsFuture - step).toFixed(2)));
  const onPlus = () => onSetYearsFuture(Math.min(40, +(yearsFuture + step).toFixed(2)));

  // ===== Tooltip layout =====
  const tipW = 170;
  const tipH = 40;
  const tipPad = 8;
  const tipX = hover
    ? hover.x + tipPad + tipW > w - padR
      ? hover.x - tipPad - tipW
      : hover.x + tipPad
    : 0;
  const tipY = hover
    ? Math.min(h - padB - tipH, Math.max(padT, hover.y - tipH / 2))
    : 0;

  // ===== Y ticks =====
  const ticksY = 5;
  const yTicks = new Array(ticksY + 1)
    .fill(0)
    .map((_, i) => minY + (i * (maxY - minY)) / ticksY);

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">
          Portfolio Value (Actual &amp; Projected)
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-700">
          <span className="inline-flex items-center gap-2">
            <svg width="26" height="8">
              <line x1="0" y1="4" x2="26" y2="4" stroke="#111827" strokeWidth="3" />
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
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-80"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* axes */}
        <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="#e5e7eb" />
        <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="#e5e7eb" />

        {/* y grid + labels */}
        {yTicks.map((v, i) => (
          <g key={`y-${i}`}>
            <line x1={padL} y1={sy(v)} x2={w - padR} y2={sy(v)} stroke="#f3f4f6" />
            <text
              x={padL - 8}
              y={sy(v) + 3}
              fontSize="10"
              textAnchor="end"
              fill="#6b7280"
            >
              {'$' + compact(v)}
            </text>
          </g>
        ))}

        {/* x ticks */}
        {xTicks.map((m, i) => {
          const d = dateFromMonths(m);
          const label = showWeekly
            ? d.toLocaleString(undefined, { month: 'short', day: '2-digit' })
            : showMonthly
            ? d.toLocaleString(undefined, { month: 'short' })
            : String(d.getFullYear());
        return (
          <g key={`x-${i}`}>
            <line x1={sx(m)} y1={h - padB} x2={sx(m)} y2={h - padB + 6} stroke="#d1d5db" />
            <text x={sx(m)} y={h - padB + 18} fontSize="10" textAnchor="middle" fill="#6b7280">
              {label}
            </text>
          </g>
        );})}

        {/* ACTUAL (with area) */}
        {actual.length > 1 && <path d={mkArea(actual)} fill="#11182714" />}
        {actual.length > 1 && (
          <path d={mkLine(actual)} fill="none" stroke="#111827" strokeWidth={2.5} />
        )}

        {/* PROJECTION */}
        <defs>
          <linearGradient id="projFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {proj.length > 1 && <path d={mkArea(proj)} fill="url(#projFill)" />}
        {proj.length > 1 && (
          <path
            d={mkLine(proj)}
            fill="none"
            stroke="#22c55e"
            strokeWidth={2.5}
            strokeDasharray="6 6"
          />
        )}

        {/* tooltip */}
        {hover && (
          <>
            <line
              x1={hover.x}
              y1={padT}
              x2={hover.x}
              y2={h - padB}
              stroke="#d1d5db"
              strokeDasharray="4 4"
            />
            <circle cx={hover.x} cy={sy(valueAt(hover.m))} r={3} fill="#16a34a" />
            <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={6} fill="white" stroke="#e5e7eb" />
            <text x={tipX + 8} y={tipY + 15} fontSize="11" fill="#374151">
              Date:{' '}
              {dateFromMonths(hover.m).toLocaleString(undefined, {
                month: 'short',
                day: showWeekly ? '2-digit' : undefined,
                year: showWeekly || showMonthly ? undefined : 'numeric',
              })}
            </text>
            <text x={tipX + 8} y={tipY + 29} fontSize="11" fill="#374151">
              Value: {CAD(Math.round(valueAt(hover.m)))}
            </text>
          </>
        )}
      </svg>

      <div className="mt-3 flex items-center gap-2">
        <button onClick={onMinus} className="rounded-md border px-3 py-1 text-sm">
          {minusLabel}
        </button>
        <button onClick={onPlus} className="rounded-md border px-3 py-1 text-sm">
          {plusLabel}
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { session, loading } = useAuth();
  const token = session?.access_token ?? '';

  const [summary, setSummary] = useState<Summary | null>(null);
  const [monthly, setMonthly] = useState<number>(0);
  const [rate, setRate] = useState<number>(0);
  const [yearsFuture, setYearsFuture] = useState<number>(10);

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

  // ACTUAL series with day bucketing + anti-vertical anchor
  const actual = useMemo(() => {
    const rows = summary?.history ?? [];
    const pts: Pt[] = rows
      .map((h) => ({
        m: monthsFromNow(new Date(h.taken_on)),
        v: Number(h.total || 0),
      }))
      .filter((p) => p.m <= 0)
      .sort((a, b) => a.m - b.m);

    // ensure “today”
    const todayV = summary?.overall ?? (pts.length ? pts[pts.length - 1].v : 0);
    pts.push({ m: 0, v: todayV });

    // collapse to ~daily
    const uniq: Pt[] = [];
    for (const p of pts) {
      const last = uniq[uniq.length - 1];
      if (!last || Math.abs(p.m - last.m) > 0.03) uniq.push(p);
      else uniq[uniq.length - 1] = p;
    }

    // anti-vertical: add an anchor 0.5 months back if needed
    if (uniq.length === 1) {
      uniq.unshift({ m: -0.5, v: uniq[0].v });
    } else if (uniq[0].m > -0.5) {
      uniq.unshift({ m: -0.5, v: uniq[0].v });
    }

    return uniq;
  }, [summary]);

  // PROJECTION
  const proj = useMemo(() => {
    const start = actual.length ? actual[actual.length - 1].v : summary?.overall ?? 0;
    const months = Math.max(1, Math.round(yearsFuture * 12));
    const r = rate / 100 / 12;
    const out: Pt[] = [{ m: 0, v: start }];
    let v = start;
    for (let i = 1; i <= months; i++) {
      v = Math.max(0, v * (1 + r) + monthly);
      out.push({ m: i, v });
    }
    return out;
  }, [actual, yearsFuture, monthly, rate, summary?.overall]);

  const parts = useMemo(() => {
    const bt = summary?.byType ?? {};
    const palette: Record<string, string> = {
      TFSA: '#34d399',
      RRSP: '#60a5fa',
      RESP: '#fbbf24',
      Margin: '#f472b6',
      LIRA: '#f59e0b',
      Other: '#a78bfa',
    };
    return Object.keys(bt).map((k) => ({
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
            <label className="text-sm font-medium">Monthly Contribution</label>
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
