'use client';

import { useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceDot,
  CartesianGrid, Line, PieChart, Pie, Legend, Cell
} from 'recharts';

// --- colors (keep consistent with your app) ---
const COLORS = {
  grid: '#e5e7eb',
  axis: '#6b7280',
  actual: '#111827',
  proj: '#10b981',
  projFillFrom: 'rgba(16,185,129,0.22)', // toned down green
  projFillTo: 'rgba(16,185,129,0.06)',
  donutTFSA: '#22c55e', // green
  donutRRSP: '#60a5fa', // blue
  donutRESP: '#f59e0b', // amber
};

// Round to month start for stable ticks
function startOfMonth(d: Date) {
  const n = new Date(d);
  n.setDate(1); n.setHours(0, 0, 0, 0);
  return n;
}
function addMonths(d: Date, m: number) {
  const n = new Date(d);
  n.setMonth(n.getMonth() + m);
  return n;
}
function addYears(d: Date, y: number) {
  const n = new Date(d);
  n.setFullYear(n.getFullYear() + y);
  return n;
}
function monthsBetween(a: Date, b: Date) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

// format 0 → 0, 120000 → 120K, 1500000 → 1.5M
function formatCompact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  return `${n}`;
}

// Fake portfolio split from accounts API (replace with your real totals if you have them on this page)
const totals = { tfsa: 25000, rrsp: 50000, resp: 15000 };
const totalEquity = totals.tfsa + totals.rrsp + totals.resp;

type Point = { t: number; v: number };

export default function Dashboard() {
  // window & controls
  const [windowYears, setWindowYears] = useState(1);         // default small window makes the monthly ticks visible
  const [monthly, setMonthly] = useState(1000);
  const [growthPct, setGrowthPct] = useState(10);            // 10% default

  const now = startOfMonth(new Date());
  const left = startOfMonth(addYears(now, -windowYears));
  const right = startOfMonth(addYears(now, windowYears));

  const series = useMemo(() => {
    // Build a month-by-month series across the full window
    const months = monthsBetween(left, right);
    const data: Point[] = [];
    const actual: Point[] = [];
    const proj: Point[] = [];

    // simple compounding forward from the left edge to provide a smooth baseline
    let value = totalEquity; // assume left edge approx equals current total; you can backfill from snapshots if you have them
    const r = Math.pow(1 + growthPct / 100, 1 / 12) - 1; // monthly rate

    // generate base line from left→right
    for (let i = 0; i <= months; i++) {
      const t = startOfMonth(addMonths(left, i)).getTime();
      // apply monthly contribution and growth
      value = value * (1 + r) + monthly;
      data.push({ t, v: value });
    }

    // split into actual (≤ now) and projection (> now), BUT ensure the very first “actual” point exists
    for (const p of data) {
      if (p.t <= now.getTime()) actual.push(p);
      else proj.push(p);
    }
    // guard: if window is all-projection (e.g., tiny window), add one actual “now” point
    if (actual.length === 0) {
      const idxNow = data.findIndex(p => p.t >= now.getTime());
      if (idxNow >= 0) actual.push({ t: now.getTime(), v: data[idxNow].v });
      else actual.push({ t: now.getTime(), v: value });
    }
    // Ensure projection starts exactly where actual ends (duplicate boundary point to avoid visual gap)
    if (proj.length) {
      const lastA = actual[actual.length - 1];
      if (proj[0].t !== lastA.t) proj.unshift({ t: lastA.t, v: lastA.v });
    }

    return { actual, proj };
  }, [left, right, monthly, growthPct]);

  const monthTicks = useMemo(() => {
    // ≤ 24 months → monthly ticks; else, yearly ticks (Jan)
    const totalMonths = monthsBetween(left, right);
    const ticks: number[] = [];
    if (totalMonths <= 24) {
      for (let i = 0; i <= totalMonths; i++) {
        ticks.push(startOfMonth(addMonths(left, i)).getTime());
      }
    } else {
      for (let y = left.getFullYear(); y <= right.getFullYear(); y++) {
        ticks.push(new Date(y, 0, 1).getTime());
      }
    }
    return ticks;
  }, [left, right]);

  // donut data (order: TFSA, RRSP, RESP)
  const pieData = [
    { name: 'TFSA', value: totals.tfsa, color: COLORS.donutTFSA },
    { name: 'RRSP', value: totals.rrsp, color: COLORS.donutRRSP },
    { name: 'RESP', value: totals.resp, color: COLORS.donutRESP },
  ];

  return (
    <main className="mx-auto max-w-7xl p-4 space-y-4">
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left: chart */}
        <div className="lg:col-span-3 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-2 text-lg font-semibold">Portfolio Value (Actual &amp; Projected)</div>

          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series.actual}>
                <defs>
                  <linearGradient id="projFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.projFillFrom} />
                    <stop offset="100%" stopColor={COLORS.projFillTo} />
                  </linearGradient>
                  <linearGradient id="actualFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="rgba(17,24,39,0.16)" />
                    <stop offset="100%" stopColor="rgba(17,24,39,0.04)" />
                  </linearGradient>
                </defs>

                <CartesianGrid stroke={COLORS.grid} vertical={false} />

                <XAxis
                  dataKey="t"
                  type="number"
                  domain={[left.getTime(), right.getTime()]}
                  ticks={monthTicks}
                  tickFormatter={(ts) => {
                    const d = new Date(Number(ts));
                    return monthTicks.length <= 25
                      ? d.toLocaleString(undefined, { month: 'short' }) // monthly view
                      : d.getFullYear().toString();                      // yearly view
                  }}
                  tick={{ fill: COLORS.axis, fontSize: 12 }}
                  axisLine={{ stroke: COLORS.grid }}
                  tickLine={{ stroke: COLORS.grid }}
                  minTickGap={16}
                />

                <YAxis
                  width={46}
                  tickFormatter={(v) => formatCompact(Math.round(v))}
                  tick={{ fill: COLORS.axis, fontSize: 12 }}
                  axisLine={{ stroke: COLORS.grid }}
                  tickLine={{ stroke: COLORS.grid }}
                />

                {/* ACTUAL (solid line + fill) */}
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={COLORS.actual}
                  fill="url(#actualFill)"
                  strokeWidth={2}
                  isAnimationActive={false}
                  name="Actual"
                />

                {/* A reference dot marking “now” */}
                <ReferenceDot x={now.getTime()} y={series.actual.at(-1)?.v ?? totalEquity} r={3} stroke={COLORS.actual} fill={COLORS.actual} />

                {/* PROJECTION rendered as *separate* dataset, dashed + fill */}
                <Area
                  type="monotone"
                  data={series.proj}
                  dataKey="v"
                  stroke={COLORS.proj}
                  strokeDasharray="6 6"
                  strokeWidth={2}
                  fill="url(#projFill)"
                  isAnimationActive={false}
                  name="Projection"
                />

                <Tooltip
                  cursor={{ stroke: COLORS.grid }}
                  formatter={(val: any) => [`CA$${Number(val).toLocaleString()}`, 'value']}
                  labelFormatter={(ts) =>
                    new Date(Number(ts)).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: monthTicks.length <= 25 ? 'short' : undefined,
                    })
                  }
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Controls */}
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border p-3">
              <div className="flex items-center justify-between text-sm mb-1">
                <span>Monthly Contribution</span>
                <span>CA${monthly.toLocaleString()}</span>
              </div>
              <input
                type="range"
                min={0}
                max={5000}
                step={50}
                value={monthly}
                onChange={(e) => setMonthly(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="rounded-xl border p-3">
              <div className="flex items-center justify-between text-sm mb-1">
                <span>Annual Growth</span>
                <span>{growthPct}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={50}
                step={1}
                value={growthPct}
                onChange={(e) => setGrowthPct(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => setWindowYears((y) => Math.max(1, y - 1))}
              className="rounded border px-3 py-1"
            >
              −1
            </button>
            <button
              onClick={() => setWindowYears((y) => Math.min(40, y + 1))}
              className="rounded border px-3 py-1"
            >
              +1
            </button>
            <div className="text-sm text-gray-600">{windowYears} year window</div>
          </div>
        </div>

        {/* Right: donut */}
        <div className="lg:col-span-2 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-2 text-lg font-semibold">Account Allocation</div>

          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={80}
                  outerRadius={120}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {pieData.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>

                {/* centered total */}
                <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" className="fill-gray-500 text-sm">
                  Total
                </text>
                <text x="50%" y="56%" textAnchor="middle" dominantBaseline="middle" className="fill-gray-900 text-xl font-semibold">
                  CA${totalEquity.toLocaleString()}
                </text>

                <Legend
                  verticalAlign="bottom"
                  align="center"
                  iconType="circle"
                  wrapperStyle={{ outline: 'none' }}
                  formatter={(val) => <span style={{ color: '#111827' }}>{val}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </main>
  );
}
