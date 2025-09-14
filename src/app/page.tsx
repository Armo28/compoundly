'use client';

import { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

type Point = { t: number; v: number };

const COLORS = {
  axis: '#60646c',
  grid: '#eceff3',
  actual: '#111827', // near-black
  projStroke: '#16a34a', // green-600
  projFillStart: 'rgba(22,163,74,0.35)', // toned down
  projFillEnd: 'rgba(22,163,74,0.08)',
  actualFillStart: 'rgba(17,24,39,0.18)',
  actualFillEnd: 'rgba(17,24,39,0.06)',
  pieTFSA: '#22c55e',
  pieRRSP: '#60a5fa',
  pieRESP: '#f59e0b',
};

const CAD = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

const compactNoCurrency = (n: number) =>
  Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function monthsBetween(a: Date, b: Date) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

export default function Dashboard() {
  // Defaults you requested earlier
  const [monthly, setMonthly] = useState(1000); // CA$1,000
  const [growth, setGrowth] = useState(0.1); // 10%
  const [yearsWin, setYearsWin] = useState(2); // example start (you can set 12 if you like)

  // Donut inputs (replace with real totals from Accounts when you wire it up)
  const equityTFSA = 25000;
  const equityRRSP = 50000;
  const equityRESP = 15000;
  const totalEquity = equityTFSA + equityRRSP + equityRESP;

  const now = useMemo(() => new Date(), []);
  const windowStart = useMemo(() => startOfMonth(now), [now]);
  const windowEnd = useMemo(() => addMonths(windowStart, yearsWin * 12), [windowStart, yearsWin]);

  const { actualData, projectionData, ticks, useMonthlyTicks } = useMemo(() => {
    const months = monthsBetween(windowStart, windowEnd) + 1;
    const r = 1 + growth / 12; // monthly compound factor

    // Build series from windowStart..windowEnd
    const dataAll: Point[] = [];
    // last known actual at "now" month index
    const nowIndex = Math.max(0, Math.min(monthsBetween(windowStart, startOfMonth(now)), months - 1));

    for (let i = 0; i < months; i++) {
      const t = addMonths(windowStart, i).getTime();
      if (i === 0) {
        // baseline
        dataAll.push({ t, v: totalEquity });
      } else if (i <= nowIndex) {
        // “actual” flat (placeholder until real historical points)
        dataAll.push({ t, v: totalEquity });
      } else {
        const prev = dataAll[i - 1].v;
        dataAll.push({ t, v: prev * r + monthly });
      }
    }

    const actual = dataAll.slice(0, Math.min(months, monthsBetween(windowStart, startOfMonth(now)) + 1));
    const proj = dataAll.slice(actual.length); // starts after the last actual point

    const totalMonths = monthsBetween(windowStart, windowEnd);
    const monthlyTicks = totalMonths <= 24;
    const ticks: number[] = [];
    if (monthlyTicks) {
      for (let i = 0; i < months; i++) ticks.push(addMonths(windowStart, i).getTime());
    } else {
      let y = windowStart.getFullYear();
      while (y <= windowEnd.getFullYear()) {
        ticks.push(new Date(y, 0, 1).getTime());
        y++;
      }
    }

    return { actualData: actual, projectionData: proj, ticks, useMonthlyTicks: monthlyTicks };
  }, [windowStart, windowEnd, totalEquity, monthly, growth, now]);

  const CustomTooltip = ({ active, label }: any) => {
    if (!active) return null;
    const ts = Number(label);
    const aLast = actualData[actualData.length - 1]?.t;
    const isActual = aLast != null && ts <= aLast;
    const v = isActual
      ? actualData.find((p) => p.t === ts)?.v
      : projectionData.find((p) => p.t === ts)?.v;
    if (v == null) return null;

    const d = new Date(ts);
    const when = useMonthlyTicks
      ? d.toLocaleString(undefined, { month: 'short', year: 'numeric' })
      : d.getFullYear().toString();

    return (
      <div className="rounded-md border bg-white px-3 py-2 shadow-sm">
        <div className="text-xs text-gray-600">{when}</div>
        <div
          className="text-sm font-medium"
          style={{ color: isActual ? COLORS.actual : COLORS.projStroke }}
        >
          {CAD(v)}
        </div>
      </div>
    );
  };

  const pieData = [
    { name: 'TFSA', value: equityTFSA, color: COLORS.pieTFSA },
    { name: 'RRSP', value: equityRRSP, color: COLORS.pieRRSP },
    { name: 'RESP', value: equityRESP, color: COLORS.pieRESP },
  ];

  return (
    <main className="max-w-7xl mx-auto p-4 space-y-4">
      {/* small CSS to kill any focus outlines on recharts */}
      <style jsx global>{`
        .no-outline:focus {
          outline: none;
        }
        .no-outline .recharts-surface:focus {
          outline: none;
        }
      `}</style>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm lg:col-span-2">
          <div className="mb-2 font-semibold">Portfolio Value (Actual & Projected)</div>
          <div className="h-[380px] no-outline" tabIndex={-1}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="projFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.projFillStart} />
                    <stop offset="100%" stopColor={COLORS.projFillEnd} />
                  </linearGradient>
                  <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.actualFillStart} />
                    <stop offset="100%" stopColor={COLORS.actualFillEnd} />
                  </linearGradient>
                </defs>

                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  ticks={ticks}
                  tickFormatter={(ts: number) => {
                    const d = new Date(ts);
                    if (useMonthlyTicks) {
                      const m = d.toLocaleString(undefined, { month: 'short' });
                      return d.getMonth() === 0 ? `${m} ${d.getFullYear()}` : m;
                    }
                    return d.getFullYear().toString();
                  }}
                  tick={{ fill: COLORS.axis, fontSize: 12 }}
                  axisLine={{ stroke: COLORS.grid }}
                  tickLine={{ stroke: COLORS.grid }}
                  minTickGap={22}
                />
                <YAxis
                  tick={{ fill: COLORS.axis, fontSize: 12 }}
                  axisLine={{ stroke: COLORS.grid }}
                  tickLine={{ stroke: COLORS.grid }}
                  tickFormatter={(n) => compactNoCurrency(n)}
                  width={56}
                />
                <Tooltip content={<CustomTooltip />} />

                {/* Actual (visible area) */}
                <Area
                  data={actualData}
                  dataKey="v"
                  stroke={COLORS.actual}
                  strokeWidth={2}
                  fill="url(#actualFill)"
                  isAnimationActive={false}
                />

                {/* Projection (dashed line + soft green fill) */}
                <Area
                  data={projectionData}
                  dataKey="v"
                  stroke={COLORS.projStroke}
                  strokeDasharray="6 6"
                  strokeWidth={2}
                  fill="url(#projFill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* sliders (kept in two neat cards) */}
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border p-3">
              <div className="mb-1 flex justify-between text-sm">
                <span>Monthly Contribution</span>
                <span className="font-medium">{CAD(monthly)}</span>
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
              <div className="mb-1 flex justify-between text-sm">
                <span>Annual Growth</span>
                <span className="font-medium">{Math.round(growth * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={50}
                step={1}
                value={Math.round(growth * 100)}
                onChange={(e) => setGrowth(Number(e.target.value) / 100)}
                className="w-full"
              />
            </div>
          </div>

          {/* zoom controls */}
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => setYearsWin((y) => Math.max(1, y - 1))}
              className="rounded-md border px-3 py-1 text-sm"
            >
              -1
            </button>
            <button
              onClick={() => setYearsWin((y) => Math.min(40, y + 1))}
              className="rounded-md border px-3 py-1 text-sm"
            >
              +1
            </button>
            <span className="text-sm text-gray-600">{yearsWin} year window</span>
          </div>
        </div>

        {/* Donut with centered total & no outline */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-2 font-semibold">Account Allocation</div>

          <div className="relative h-[300px] no-outline" tabIndex={-1}>
            {/* Center label overlay */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-xs text-gray-500">Total</div>
              <div className="text-lg font-semibold">{CAD(totalEquity)}</div>
            </div>

            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="60%"
                  outerRadius="85%"
                  stroke="none"
                  isAnimationActive={false}
                >
                  {pieData.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 flex items-center justify-center gap-4 text-sm">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: COLORS.pieTFSA }} />
              TFSA
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: COLORS.pieRRSP }} />
              RRSP
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: COLORS.pieRESP }} />
              RESP
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
