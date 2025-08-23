'use client';
import { useEffect, useMemo, useRef, useState } from 'react';

/* =============== Types =============== */
type Slice = { key: string; value: number; color: string };

type BrokerageRoomProgress = {
  tfsaDepositedThisYear: number;
  rrspDepositedThisYear: number;
};

/* =============== Helpers =============== */
const CURRENT_YEAR = new Date().getFullYear();

function currency(n: number) {
  return n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  });
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
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
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

/* =============== Donut (allocation) =============== */
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
    .filter(s => s.value > 0)
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
          {slices.filter(s => s.value > 0).map(s => (
            <span key={s.key} className="inline-flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full" style={{ background: s.color }} />
              {s.key}
            </span>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56 overflow-visible">
        {paths.map(p => <path key={p.key} d={p.d} fill={p.color} opacity={0.95} />)}
        <circle cx={cx} cy={cy} r={innerRadius - 1} fill="#fff" />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="12" fill="#6b7280">Total</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="16" className="font-semibold" fill="#111827">
          {currency(total)}
        </text>
      </svg>
    </div>
  );
}

/* =============== Donut Progress (room filled) =============== */
function DonutProgress({
  percent,
  color = '#2563eb',
  bg = '#e5e7eb',
  width = 144,
  height = 112,
  innerRadius = 26,
  outerRadius = 38, // thicker ring
  caption = 'room filled',
}: {
  percent: number; // 0..100
  color?: string;
  bg?: string;
  width?: number;
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  caption?: string;
}) {
  const cx = width / 2;
  const cy = height / 2;
  const p = clamp(percent, 0, 100);
  const sweep = (p / 100) * 360;

  const ringBg = arcPath(cx, cy, outerRadius, innerRadius, 0, 359.999);
  const ringFg = p > 0 ? arcPath(cx, cy, outerRadius, innerRadius, 0, sweep) : '';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="block overflow-visible"
      aria-label={`${caption} ${p}%`}
    >
      <path d={ringBg} fill={bg} />
      {ringFg && <path d={ringFg} fill={color} />}
      <circle cx={cx} cy={cy} r={innerRadius - 1} fill="#fff" />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="14" className="font-semibold" fill="#111827">
        {Math.round(p)}%
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="9.5" fill="#6b7280">
        {caption}
      </text>
    </svg>
  );
}

/* =============== Auto-width number input (~10% longer than text) =============== */
function AutoWidthNumberInput({
  value,
  onChange,
  minPx = 96,
  maxPx = 360,
  className = '',
  inputClassName = '',
  title,
  'aria-label': ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  minPx?: number;
  maxPx?: number;
  className?: string;
  inputClassName?: string;
  title?: string;
  'aria-label'?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [widthPx, setWidthPx] = useState<number>(minPx);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const cs = window.getComputedStyle(el);
    // Build a canvas font string similar to the input
    const font = `${cs.fontStyle} ${cs.fontVariant} ${cs.fontWeight} ${cs.fontSize} / ${cs.lineHeight} ${cs.fontFamily}`;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.font = font;

    const txt = String(value || '');
    const metrics = ctx.measureText(txt);
    // Include padding + border
    const padLeft = parseFloat(cs.paddingLeft) || 0;
    const padRight = parseFloat(cs.paddingRight) || 0;
    const borderLeft = parseFloat(cs.borderLeftWidth) || 0;
    const borderRight = parseFloat(cs.borderRightWidth) || 0;

    const contentWidth = metrics.width;
    // Add 10% and the paddings/borders
    const target = contentWidth * 1.1 + padLeft + padRight + borderLeft + borderRight;

    setWidthPx(clamp(Math.round(target), minPx, maxPx));
  }, [value]);

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="number"
        value={value}
        aria-label={ariaLabel}
        title={title}
        onChange={(e) => onChange(Math.max(0, +e.target.value))}
        className={
          "border rounded-lg h-12 px-3 text-base leading-none " +
          "focus:outline-none focus:ring-2 focus:ring-blue-500 " +
          inputClassName
        }
        style={{ width: `${widthPx}px` }}
      />
    </div>
  );
}

/* =============== Projection Chart (free-cursor tooltip) =============== */
function ProjectionChart({
  actual,
  projectedBase,
  projectedConservative,
  projectedAggressive,
  years = 10,
}: {
  actual: { month: number; value: number }[];
  projectedBase: { month: number; value: number }[];
  projectedConservative: { month: number; value: number }[];
  projectedAggressive: { month: number; value: number }[];
  years?: number;
}) {
  const paddingLeft = 120, paddingRight = 20, paddingTop = 20, paddingBottom = 46;
  const width = 840, height = 320;
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverY, setHoverY] = useState<number | null>(null);
  const [hoverValue, setHoverValue] = useState<number | null>(null);

  const allPts = [...actual, ...projectedBase, ...projectedConservative, ...projectedAggressive];
  const minX = Math.min(...allPts.map(p => p.month), -12);
  const maxX = Math.max(...allPts.map(p => p.month), years * 12);
  const minY = Math.min(...allPts.map(p => p.value), 0);
  const maxY = Math.max(...allPts.map(p => p.value), 1);

  const innerW = width - paddingLeft - paddingRight;
  const innerH = height - paddingTop - paddingBottom;

  const scaleX = (m: number) => paddingLeft + (m - minX) * (innerW / (maxX - minX || 1));
  const scaleY = (v: number) => paddingTop + (maxY - v) * (innerH / (maxY - minY || 1));
  const linePath = (pts: { month: number; value: number }[]) =>
    pts.length ? pts.map((p, i) => `${i ? 'L' : 'M'} ${scaleX(p.month).toFixed(1)} ${scaleY(p.value).toFixed(1)}`).join(' ') : '';
  const areaPath = (pts: { month: number; value: number }[]) => {
    if (!pts.length) return '';
    const baselineY = scaleY(minY);
    const first = pts[0], last = pts[pts.length - 1];
    const line = linePath(pts);
    return `${line} L ${scaleX(last.month).toFixed(1)} ${baselineY.toFixed(1)} L ${scaleX(first.month).toFixed(1)} ${baselineY.toFixed(1)} Z`;
  };

  const actualLine = linePath(actual);
  const actualArea = areaPath(actual);
  const projLineBase = linePath(projectedBase);
  const projLineCons = linePath(projectedConservative);
  const projLineAggr = linePath(projectedAggressive);

  const clientToSvg = (evt: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
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
    setHoverValue(unscaleValue(yClamped)); // value at exact pointer height
  };
  const onMouseLeave = () => { setHoverX(null); setHoverY(null); setHoverValue(null); };

  const tipX = hoverX ?? 0, tipY = hoverY ?? 0;
  const tipLabel = hoverValue != null ? currency(hoverValue) : '';
  const boxW = Math.max(90, tipLabel.length * 10), boxH = 28;
  let boxX = clamp(tipX + 10, paddingLeft, width - paddingRight - boxW);
  let boxY = clamp(tipY - boxH - 8, paddingTop, height - paddingBottom - boxH);

  // x & y ticks
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
        <div className="flex items-center gap-4 text-xs text-gray-700">
          <span className="inline-flex items-center gap-2">
            <svg width="18" height="8" viewBox="0 0 18 8" aria-hidden="true">
              <line x1="0" y1="4" x2="18" y2="4" stroke="#111827" strokeWidth="3"/>
            </svg>
            Actual (area filled)
          </span>
          <span className="inline-flex items-center gap-2">
            <svg width="44" height="8" viewBox="0 0 44 8" aria-hidden="true">
              <line x1="0" y1="4" x2="44" y2="4" stroke="#22c55e" strokeWidth="3" strokeDasharray="6 6" />
            </svg>
            Projections: <span className="ml-1 text-gray-500">Conservative</span> · <span className="text-gray-900 font-medium">Base</span> · <span className="text-gray-500">Aggressive</span>
          </span>
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-80"
        role="img"
        aria-label="Portfolio chart"
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        {/* axes */}
        <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} stroke="#e5e7eb" />
        <line x1={paddingLeft} y1={paddingTop} x2={paddingLeft} y2={height - paddingBottom} stroke="#e5e7eb" />

        {/* grid + y labels */}
        {yTicks.map((t, i) => (
          <g key={`y-${i}`}>
            <line x1={paddingLeft} y1={t.y} x2={width - paddingRight} y2={t.y} stroke="#f3f4f6" />
            <text x={paddingLeft - 12} y={t.y + 4} fontSize="10" textAnchor="end" fill="#6b7280">
              {t.label}
            </text>
          </g>
        ))}

        {/* x ticks */}
        {xMinors.map((x, i) => (
          <g key={`x-minor-${i}`}>
            <line x1={x} y1={height - paddingBottom} x2={x} y2={height - paddingBottom + 6} stroke="#d1d5db" />
          </g>
        ))}
        {xMajors.map((t, i) => (
          <g key={`x-major-${i}`}>
            <line x1={t.x} y1={height - paddingBottom} x2={t.x} y2={height - paddingBottom + 8} stroke="#9ca3af" />
            <text x={t.x} y={height - paddingBottom + 18} fontSize="10" textAnchor="middle" fill="#6b7280">
              {t.label}
            </text>
          </g>
        ))}

        {/* area under actual */}
        {actualArea && <path d={actualArea} fill="#11182714" stroke="none" />}

        {/* lines */}
        {actualLine && <path d={actualLine} fill="none" stroke="#111827" strokeWidth={2.5} />}
        {projLineCons && <path d={projLineCons} fill="none" stroke="#22c55e" strokeOpacity={0.5} strokeWidth={2.5} strokeDasharray="6 6" />}
        {projLineBase && <path d={projLineBase} fill="none" stroke="#22c55e" strokeOpacity={1} strokeWidth={3} strokeDasharray="6 6" />}
        {projLineAggr && <path d={projLineAggr} fill="none" stroke="#22c55e" strokeOpacity={0.5} strokeWidth={2.5} strokeDasharray="6 6" />}

        {/* axis titles */}
        <text x={width / 2} y={height - 8} fontSize="11" textAnchor="middle" fill="#6b7280">Calendar Year</text>
        <text x={-58} y={height / 2} transform={`rotate(-90, -58, ${height / 2})`} fontSize="11" textAnchor="middle" fill="#6b7280">
          Portfolio value (CAD)
        </text>

        {/* crosshair + tooltip at the mouse tip */}
        {hoverX != null && hoverY != null && hoverValue != null && (
          <>
            <line x1={hoverX} y1={paddingTop} x2={hoverX} y2={height - paddingBottom} stroke="#9ca3af" strokeDasharray="4 4" />
            <circle cx={hoverX} cy={hoverY} r={3.5} fill="#22c55e" stroke="#fff" strokeWidth={1.5} />
            <g>
              <rect x={boxX} y={boxY} width={boxW} height={boxH} rx={6} ry={6} fill="#ffffff" stroke="#d1d5db" />
              <text x={boxX + 8} y={boxY + 18} fontSize="12" fill="#111827">{tipLabel}</text>
            </g>
          </>
        )}
      </svg>
    </div>
  );
}

/* =============== Demo Data Generators =============== */
function makeActualSeries(endValue: number, monthsBack = 60) {
  let val = endValue * 0.45;
  const driftAnnual = 0.06, volMonthly = 0.05, contribGuess = 600;
  let seed = 12345;
  const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

  const pts: { month: number; value: number }[] = [];
  for (let m = -monthsBack; m <= 0; m++) {
    if (m > -monthsBack) {
      const monthlyReturn = driftAnnual / 12 + (rand() - 0.5) * 2 * volMonthly;
      val = Math.max(0, val * (1 + monthlyReturn) + contribGuess);
    }
    pts.push({ month: m, value: val });
  }
  const finalVal = pts[pts.length - 1]?.value || 1;
  const scale = finalVal > 0 ? endValue / finalVal : 1;
  return pts.map(p => ({ month: p.month, value: p.value * scale }));
}
function projectFrom(startValue: number, years = 10, annualReturn = 0.06, monthlyContrib = 600) {
  const months = years * 12, r = annualReturn / 12;
  const out: { month: number; value: number }[] = [{ month: 0, value: startValue }];
  let v = startValue;
  for (let m = 1; m <= months; m++) {
    v = Math.max(0, v * (1 + r) + monthlyContrib);
    out.push({ month: m, value: v });
  }
  return out;
}

/* =============== Small Card =============== */
function Card({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded-2xl border p-4 shadow-sm bg-white">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {subtitle && <div className="text-xs text-gray-400 mt-1">{subtitle}</div>}
    </div>
  );
}

/* =============== Brokerage feed hook (mock; replace with real API) =============== */
function useBrokerageRoomProgress(): BrokerageRoomProgress | null {
  const [data, setData] = useState<BrokerageRoomProgress | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchProgress() {
      try {
        // TODO: replace with your real endpoint.
        // const res = await fetch('/api/brokerage/room-progress', { cache: 'no-store' });
        // const json = await res.json();
        // if (mounted) setData(json as BrokerageRoomProgress);

        // Mock demo data that “moves” a bit:
        const baseTfsa = 2200;
        const baseRrsp = 7400;
        const jitter = Math.floor((Date.now() / 30000) % 50) * 10;
        if (mounted) {
          setData({
            tfsaDepositedThisYear: baseTfsa + jitter,
            rrspDepositedThisYear: baseRrsp + jitter,
          });
        }
      } catch {
        if (mounted) setData(null);
      }
    }

    fetchProgress();
    const id = setInterval(fetchProgress, 30_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  return data;
}

/* =============== Page =============== */
export default function Home() {
  // Demo totals for allocation
  const totalForDonut = 65000;

  // ----- NEW: monthly contribution slider state -----
  const [monthly, setMonthly] = useState<number>(600);

  // Build actual + projections (client-only demo)
  const actualSeries = useMemo(() => makeActualSeries(totalForDonut, 60), [totalForDonut]);
  const lastActual = actualSeries[actualSeries.length - 1]?.value ?? totalForDonut;

  // Wire projections to current monthly slider value
  const projBase = useMemo(() => projectFrom(lastActual, 10, 0.06, monthly), [lastActual, monthly]);
  const projCons = useMemo(() => projectFrom(lastActual, 10, 0.035, monthly), [lastActual, monthly]);
  const projAggr = useMemo(() => projectFrom(lastActual, 10, 0.085, monthly), [lastActual, monthly]);

  // Right column allocation
  const alloc = {
    TFSA: totalForDonut * 0.66,
    RRSP: totalForDonut * 0.34,
    LIRA: 0,
    MARGIN: 0,
    OTHER: 0,
    overall: totalForDonut,
  };
  const donutSlices: Slice[] = [
    { key: 'TFSA',  value: alloc.TFSA,  color: '#34d399' },
    { key: 'RRSP',  value: alloc.RRSP,  color: '#60a5fa' },
    { key: 'LIRA',  value: alloc.LIRA,  color: '#fbbf24' },
    { key: 'Margin',value: alloc.MARGIN, color: '#f472b6' },
    { key: 'Other', value: alloc.OTHER, color: '#a78bfa' },
  ].filter(s => s.value > 0.0001);

  // Contribution Room (user inputs + brokerage feed)
  const [tfsaRoom, setTfsaRoom] = useState<number>(6500);
  const [rrspRoom, setRrspRoom] = useState<number>(18000);
  const brokerage = useBrokerageRoomProgress();

  const tfsaPercent = useMemo(() => {
    const dep = brokerage?.tfsaDepositedThisYear ?? 0;
    return tfsaRoom > 0 ? clamp((dep / tfsaRoom) * 100, 0, 100) : 0;
  }, [brokerage?.tfsaDepositedThisYear, tfsaRoom]);

  const rrspPercent = useMemo(() => {
    const dep = brokerage?.rrspDepositedThisYear ?? 0;
    return rrspRoom > 0 ? clamp((dep / rrspRoom) * 100, 0, 100) : 0;
  }, [brokerage?.rrspDepositedThisYear, rrspRoom]);

  // Fixed donut visual size used for aligning centers with the inputs
  const DONUT_W = 144;
  const DONUT_H = 112; // aligns with input h-12

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto p-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Compoundly</h1>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Chart + Slider + Contribution Room */}
        <div className="lg:col-span-2 space-y-4">
          <ProjectionChart
            actual={actualSeries}
            projectedBase={projBase}
            projectedConservative={projCons}
            projectedAggressive={projAggr}
            years={10}
          />

          {/* ----- NEW: Monthly Contribution Slider card ----- */}
          <div className="rounded-2xl border p-4 shadow-sm bg-white">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Monthly Contribution</label>
              <div className="text-sm text-gray-600">{currency(monthly)}</div>
            </div>
            <input
              type="range"
              min={0}
              max={10000}
              step={100}
              value={monthly}
              onChange={(e) => setMonthly(Math.round(+e.target.value / 100) * 100)}
              className="w-full mt-2"
              aria-label="Monthly contribution slider"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>$0</span>
              <span>$10,000</span>
            </div>
          </div>

          {/* ===== Contribution Room (below the slider) ===== */}
          <div className="rounded-2xl border p-4 shadow-sm bg-white">
            <div className="text-sm font-medium mb-3">Contribution Room — {CURRENT_YEAR}</div>

            <div className="space-y-8">
              {/* TFSA row — input and donut share the same centerline */}
              <div className="flex items-center justify-start gap-4">
                <div className="flex flex-col">
                  <label className="text-sm mb-2">TFSA room available for {CURRENT_YEAR}</label>
                  <div className="flex items-center gap-4">
                    {/* Auto-width input ~10% longer than text */}
                    <AutoWidthNumberInput
                      value={tfsaRoom}
                      onChange={setTfsaRoom}
                      aria-label="TFSA room"
                      title="TFSA room for the current year"
                      // centers align via items-center on the row container.
                      inputClassName="bg-white"
                    />
                    <div
                      className="shrink-0"
                      style={{
                        width: DONUT_W,
                        height: DONUT_H,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <DonutProgress
                        percent={tfsaPercent}
                        color="#34d399"
                        bg="#e8f7f0"
                        width={DONUT_W}
                        height={DONUT_H}
                        caption="room filled"
                      />
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Deposited so far: {currency(brokerage?.tfsaDepositedThisYear ?? 0)}
                  </div>
                </div>
              </div>

              {/* RRSP row — same alignment rules */}
              <div className="flex items-center justify-start gap-4">
                <div className="flex flex-col">
                  <label className="text-sm mb-2">RRSP room available for {CURRENT_YEAR}</label>
                  <div className="flex items-center gap-4">
                    <AutoWidthNumberInput
                      value={rrspRoom}
                      onChange={setRrspRoom}
                      aria-label="RRSP room"
                      title="RRSP room for the current year"
                      inputClassName="bg-white"
                    />
                    <div
                      className="shrink-0"
                      style={{
                        width: DONUT_W,
                        height: DONUT_H,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <DonutProgress
                        percent={rrspPercent}
                        color="#60a5fa"
                        bg="#e8f0fe"
                        width={DONUT_W}
                        height={DONUT_H}
                        caption="room filled"
                      />
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Deposited so far: {currency(brokerage?.rrspDepositedThisYear ?? 0)}
                  </div>
                </div>
              </div>
            </div>

            <div className="text-xs text-gray-400 mt-6">
              Replace the mock brokerage fetch with your API to update percentages automatically.
            </div>
          </div>
        </div>

        {/* Right: Allocation + Totals */}
        <div className="space-y-4">
          <Donut slices={donutSlices} total={totalForDonut} />
          <div className="grid grid-cols-2 gap-3">
            <Card title="TFSA" value={currency(alloc.TFSA)} />
            <Card title="RRSP" value={currency(alloc.RRSP)} />
            {alloc.LIRA > 0
              ? <Card title="LIRA" value={currency(alloc.LIRA)} />
              : <div className="rounded-2xl border p-4 bg-white text-sm text-gray-500 flex items-center justify-center">+ Add Account</div>}
            <Card title="Margin" value={currency(alloc.MARGIN)} />
          </div>
          <Card title="Total Invested" value={currency(totalForDonut)} subtitle="All accounts (demo data)" />
        </div>
      </div>
    </main>
  );
}
