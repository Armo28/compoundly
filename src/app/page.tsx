'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';

/* ======================= Types ======================= */
type Account = { id: string; name: string; type: string; balance: number };
type Slice = { key: string; value: number; color: string };

const CURRENT_YEAR = new Date().getFullYear();

/* ======================= Utils ======================= */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function currency(n: number) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
}
function compactCurrency(n: number) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'CAD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    const abs = Math.abs(n);
    if (abs >= 1_000_000_000) return `CA$${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
    if (abs >= 1_000_000) return `CA$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (abs >= 1_000) return `CA$${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return currency(n);
  }
}

/* ======================= Donut helpers ======================= */
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function arcPath(cx: number, cy: number, rOuter: number, rInner: number, startAngle: number, endAngle: number) {
  const startOuter = polarToCartesian(cx, cy, rOuter, endAngle);
  const endOuter = polarToCartesian(cx, cy, rOuter, startAngle);
  const startInner = polarToCartesian(cx, cy, rInner, endAngle);
  const endInner = polarToCartesian(cx, cy, rInner, startAngle);
  const large = endAngle - startAngle <= 180 ? 0 : 1;
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${rInner} ${rInner} 0 ${large} 1 ${startInner.x} ${startInner.y}`,
    'Z',
  ].join(' ');
}

/* ======================= Donut (allocation) ======================= */
function Donut({
  slices,
  total,
  width = 360,
  height = 220,
  innerRadius = 58,
  outerRadius = 90,
  title = 'Account Allocation',
}: {
  slices: Slice[];
  total: number;
  width?: number;
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  title?: string;
}) {
  const cx = width / 2;
  const cy = height / 2 + 10;
  const sum = Math.max(1, slices.reduce((a, s) => a + (isFinite(s.value) ? Math.max(0, s.value) : 0), 0));

  let angle = 0;
  const paths = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const frac = s.value / sum;
      const sweep = frac * 360;
      const start = angle;
      const end = angle + sweep;
      angle = end;
      return { key: s.key, d: arcPath(cx, cy, outerRadius, innerRadius, start, end), color: s.color };
    });

  return (
    <div className="rounded-2xl border p-4 shadow-sm bg-white overflow-visible">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium">{title}</div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-700">
          {slices
            .filter((s) => s.value > 0)
            .map((s) => (
              <span key={s.key} className="inline-flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full" style={{ background: s.color }} />
                {s.key}
              </span>
            ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56 overflow-visible">
        {paths.map((p) => (
          <path key={p.key} d={p.d} fill={p.color} opacity={0.95} />
        ))}
        <circle cx={cx} cy={cy} r={innerRadius - 1} fill="#fff" />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="12" fill="#6b7280">
          Total
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="16" className="font-semibold" fill="#111827">
          {currency(total)}
        </text>
      </svg>
    </div>
  );
}

/* ======================= Chart helpers ======================= */
function makeActualSeries(endValue: number, monthsBack = 36) {
  // Synthetic history that always ends at `endValue` today.
  let val = Math.max(0, endValue * 0.6);
  const driftAnnual = 0.05;
  const volMonthly = 0.04;
  let seed = 1234567;
  const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

  const pts: { month: number; value: number }[] = [];
  for (let m = -monthsBack; m <= 0; m++) {
    if (m > -monthsBack) {
      const monthlyReturn = driftAnnual / 12 + (rand() - 0.5) * 2 * volMonthly;
      val = Math.max(0, val * (1 + monthlyReturn) + 500); // small generic monthly inflow
    }
    pts.push({ month: m, value: val });
  }
  const last = pts[pts.length - 1]?.value || 1;
  const k = last > 0 ? endValue / last : 1;
  return pts.map((p) => ({ month: p.month, value: p.value * k }));
}
function projectFrom(startValue: number, years: number, annualReturn: number, monthlyContrib: number) {
  const months = years * 12;
  const r = annualReturn / 12;
  const out: { month: number; value: number }[] = [{ month: 0, value: startValue }];
  let v = startValue;
  for (let m = 1; m <= months; m++) {
    v = Math.max(0, v * (1 + r) + monthlyContrib);
    out.push({ month: m, value: v });
  }
  return out;
}

/* ======================= Projection Chart ======================= */
function ProjectionChart({
  actual,
  projected,
  years,
}: {
  actual: { month: number; value: number }[];
  projected: { month: number; value: number }[];
  years: number;
}) {
  const paddingLeft = 80,
    paddingRight = 16,
    paddingTop = 16,
    paddingBottom = 42;
  const width = 840,
    height = 300;
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverY, setHoverY] = useState<number | null>(null);
  const [hoverValue, setHoverValue] = useState<number | null>(null);

  const allPts = [...actual, ...projected];
  const minX = Math.min(...allPts.map((p) => p.month), -12);
  const maxX = Math.max(...allPts.map((p) => p.month), years * 12);
  const minY = Math.min(...allPts.map((p) => p.value), 0);
  const maxY = Math.max(...allPts.map((p) => p.value), 1);

  const innerW = width - paddingLeft - paddingRight;
  const innerH = height - paddingTop - paddingBottom;

  const scaleX = (m: number) => paddingLeft + (m - minX) * (innerW / (maxX - minX || 1));
  const scaleY = (v: number) => paddingTop + (maxY - v) * (innerH / (maxY - minY || 1));
  const linePath = (pts: { month: number; value: number }[]) =>
    pts.length ? pts.map((p, i) => `${i ? 'L' : 'M'} ${scaleX(p.month).toFixed(1)} ${scaleY(p.value).toFixed(1)}`).join(' ') : '';
  const areaPath = (pts: { month: number; value: number }[]) => {
    if (!pts.length) return '';
    const baselineY = scaleY(minY);
    const first = pts[0],
      last = pts[pts.length - 1];
    const line = linePath(pts);
    return `${line} L ${scaleX(last.month).toFixed(1)} ${baselineY.toFixed(1)} L ${scaleX(first.month).toFixed(1)} ${baselineY.toFixed(1)} Z`;
  };

  const actualLine = linePath(actual);
  const actualArea = areaPath(actual);
  const projLine = linePath(projected);

  const clientToSvg = (evt: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  const unscaleValue = (y: number) => maxY - ((y - paddingTop) / (innerH || 1)) * (maxY - minY);

  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const { x, y } = clientToSvg(e);
    const xClamped = clamp(x, paddingLeft, width - paddingRight);
    const yClamped = clamp(y, paddingTop, height - paddingBottom);
    setHoverX(xClamped);
    setHoverY(yClamped);
    setHoverValue(unscaleValue(yClamped));
  };

  const xMajors: { x: number; label: string }[] = [];
  const xMinors: number[] = [];
  {
    const startYearIndex = Math.ceil(minX / 12);
    const endYearIndex = Math.floor(maxX / 12);
    for (let y = startYearIndex; y <= endYearIndex; y++) {
      const xPos = scaleX(y * 12);
      if (y % 2 === 0) xMajors.push({ x: xPos, label: String(CURRENT_YEAR + y) });
      else xMinors.push(xPos);
    }
  }
  const yTicks: { y: number; label: string }[] = (() => {
    const out: { y: number; label: string }[] = [];
    const count = 5;
    for (let i = 0; i <= count; i++) {
      const v = minY + (i * (maxY - minY)) / count;
      out.push({ y: scaleY(v), label: compactCurrency(v) });
    }
    return out;
  })();

  return (
    <div className="rounded-2xl border p-4 shadow-sm bg-white">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">Portfolio Value (Actual &amp; Projected)</div>
        <div className="text-xs text-gray-600">Actual updates when account totals change</div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-72"
        role="img"
        aria-label="Portfolio chart"
        onMouseMove={onMouseMove}
        onMouseLeave={() => {
          setHoverX(null);
          setHoverY(null);
          setHoverValue(null);
        }}
      >
        {/* axes */}
        <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} stroke="#e5e7eb" />
        <line x1={paddingLeft} y1={paddingTop} x2={paddingLeft} y2={height - paddingBottom} stroke="#e5e7eb" />

        {/* grid + y labels */}
        {yTicks.map((t, i) => (
          <g key={`y-${i}`}>
            <line x1={paddingLeft} y1={t.y} x2={width - paddingRight} y2={t.y} stroke="#f3f4f6" />
            <text x={paddingLeft - 10} y={t.y + 4} fontSize="10" textAnchor="end" fill="#6b7280">
              {t.label}
            </text>
          </g>
        ))}

        {/* x ticks */}
        {xMinors.map((x, i) => (
          <line key={`xm-${i}`} x1={x} y1={height - paddingBottom} x2={x} y2={height - paddingBottom + 5} stroke="#d1d5db" />
        ))}
        {xMajors.map((t, i) => (
          <g key={`xM-${i}`}>
            <line x1={t.x} y1={height - paddingBottom} x2={t.x} y2={height - paddingBottom + 8} stroke="#9ca3af" />
            <text x={t.x} y={height - paddingBottom + 18} fontSize="10" textAnchor="middle" fill="#6b7280">
              {t.label}
            </text>
          </g>
        ))}

        {/* area + lines */}
        {actualArea && <path d={actualArea} fill="#11182714" stroke="none" />}
        {actualLine && <path d={actualLine} fill="none" stroke="#111827" strokeWidth={2.5} />}
        {projLine && <path d={projLine} fill="none" stroke="#22c55e" strokeWidth={2.5} strokeDasharray="6 6" />}

        {/* axis titles */}
        <text x={width / 2} y={height - 8} fontSize="11" textAnchor="middle" fill="#6b7280">
          Calendar Year
        </text>
        <text x={-58} y={height / 2} transform={`rotate(-90, -58, ${height / 2})`} fontSize="11" textAnchor="middle" fill="#6b7280">
          Portfolio value (CAD)
        </text>

        {/* tip */}
        {hoverX != null && hoverY != null && hoverValue != null && (
          <>
            <line x1={hoverX} y1={paddingTop} x2={hoverX} y2={height - paddingBottom} stroke="#9ca3af" strokeDasharray="4 4" />
            <circle cx={hoverX} cy={hoverY} r={3.5} fill="#22c55e" stroke="#fff" strokeWidth={1.5} />
            {(() => {
              const label = currency(hoverValue);
              const w = Math.max(96, label.length * 9);
              const h = 26;
              const bx = clamp(hoverX + 10, paddingLeft, width - w - paddingRight);
              const by = clamp(hoverY - h - 8, paddingTop, height - paddingBottom - h);
              return (
                <g>
                  <rect x={bx} y={by} width={w} height={h} rx={6} ry={6} fill="#fff" stroke="#d1d5db" />
                  <text x={bx + 8} y={by + 17} fontSize="12" fill="#111827">
                    {label}
                  </text>
                </g>
              );
            })()}
          </>
        )}
      </svg>
    </div>
  );
}

/* ======================= Page ======================= */
const COLOR_BY_TYPE: Record<string, string> = {
  TFSA: '#34d399',
  RRSP: '#60a5fa',
  RESP: '#fbbf24',
  Margin: '#f472b6',
  Other: '#a78bfa',
};

export default function DashboardPage() {
  const { session, loading } = useAuth();
  const token = session?.access_token ?? null;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [fetching, setFetching] = useState(false);

  // sliders
  const [monthly, setMonthly] = useState<number>(1000); // default $1,000
  const [annualPct, setAnnualPct] = useState<number>(10); // default 10%
  const [years, setYears] = useState<number>(10); // default 10y window ahead

  // fetch accounts (and poll)
  useEffect(() => {
    let timer: any;
    async function load() {
      if (!token) return;
      try {
        setFetching(true);
        const res = await fetch('/api/accounts', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const json = await res.json();
        if (json?.ok && Array.isArray(json.accounts)) setAccounts(json.accounts as Account[]);
      } finally {
        setFetching(false);
      }
    }
    load();
    timer = setInterval(load, 20_000);
    return () => clearInterval(timer);
  }, [token]);

  if (loading) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">Loading…</div>
      </main>
    );
  }
  if (!session) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <div className="rounded-2xl border bg-white p-8 shadow-sm text-center">
          <h2 className="text-xl font-semibold mb-2">Welcome to Compoundly</h2>
          <p className="text-gray-600 mb-4">Please sign in to view your dashboard.</p>
          <a href="/login" className="inline-block rounded-lg bg-blue-600 text-white px-4 py-2">
            Sign in
          </a>
        </div>
      </main>
    );
  }

  // totals & slices
  const total = accounts.reduce((a, b) => a + (Number.isFinite(b.balance) ? b.balance : 0), 0);
  const byType: Record<string, number> = {};
  for (const a of accounts) {
    const k = (a.type || 'Other').trim() || 'Other';
    byType[k] = (byType[k] ?? 0) + (Number.isFinite(a.balance) ? a.balance : 0);
  }
  const slices: Slice[] = Object.entries(byType).map(([k, v]) => ({
    key: k,
    value: v,
    color: COLOR_BY_TYPE[k] ?? COLOR_BY_TYPE.Other,
  }));

  // actual + projected (single dashed line) driven by accounts total & sliders
  const actualSeries = useMemo(() => makeActualSeries(total || 1, 36), [total]);
  const last = actualSeries[actualSeries.length - 1]?.value ?? total || 1;
  const projected = useMemo(
    () => projectFrom(last, years, annualPct / 100, monthly),
    [last, years, annualPct, monthly]
  );

  return (
    <main className="max-w-6xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Left: Chart + sliders */}
      <div className="lg:col-span-2 space-y-4">
        <ProjectionChart actual={actualSeries} projected={projected} years={years} />

        {/* Controls card */}
        <div className="rounded-2xl border p-4 shadow-sm bg-white">
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Monthly contribution */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Monthly Contribution</label>
                <div className="text-sm text-gray-700 tabular-nums">{currency(monthly)}</div>
              </div>
              <input
                type="range"
                min={0}
                max={10000}
                step={100}
                value={monthly}
                onChange={(e) => setMonthly(Math.round(+e.target.value / 100) * 100)}
                className="w-full mt-2 h-2 rounded bg-gray-200"
                aria-label="Monthly contribution"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>$0</span>
                <span>$10,000</span>
              </div>
            </div>

            {/* Annual growth */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Annual Growth Rate</label>
                <div className="text-sm text-gray-700 tabular-nums">{annualPct}%</div>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={annualPct}
                onChange={(e) => setAnnualPct(Math.round(+e.target.value))}
                className="w-full mt-2 h-2 rounded bg-gray-200"
                aria-label="Annual growth rate"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>0%</span>
                <span>100%</span>
              </div>
            </div>
          </div>

          {/* Years control */}
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing <span className="font-medium">{years}</span> years ahead
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setYears((y) => clamp(y - 5, 10, 40))}
                className="rounded-lg border px-3 py-1.5 text-sm"
                aria-label="Show 5 fewer years"
              >
                −5y
              </button>
              <button
                onClick={() => setYears((y) => clamp(y + 5, 10, 40))}
                className="rounded-lg border px-3 py-1.5 text-sm"
                aria-label="Show 5 more years"
              >
                +5y
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Donut + summary */}
      <div className="space-y-4">
        <Donut slices={slices} total={total} />
        <div className="rounded-2xl border p-4 shadow-sm bg-white">
          <div className="text-sm text-gray-500">Total Invested</div>
          <div className="text-2xl font-semibold mt-1">{currency(total)}</div>
          <div className="text-xs text-gray-400 mt-1">{fetching ? 'Refreshing…' : 'Live from your Accounts'}</div>
        </div>
        <div className="rounded-2xl border p-4 shadow-sm bg-white">
          <div className="text-sm font-medium mb-1">Breakdown</div>
          {slices.length === 0 ? (
            <div className="text-sm text-gray-500">No accounts yet.</div>
          ) : (
            <ul className="text-sm space-y-1">
              {slices.map((s) => (
                <li key={s.key} className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full" style={{ background: s.color }} />
                    {s.key}
                  </span>
                  <span className="tabular-nums">{currency(s.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
