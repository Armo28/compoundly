'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart, Area,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  PieChart, Pie, Cell,
} from 'recharts';
import { useAuth } from '@/lib/auth';

// ---------- helpers ----------
const CAD = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

const compactCAD = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `CA$${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000)     return `CA$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)         return `CA$${(n / 1_000).toFixed(1)}K`;
  return CAD(n);
};

const startOfYear = (y: number) => new Date(y, 0, 1).getTime();
const jan1 = (y: number) => new Date(y, 0, 1).getTime();

type Account = { id: string; type: 'TFSA'|'RRSP'|'RESP'|'Margin'|'Other'|'LIRA'; balance: number | null };

// Palette (match your app)
const COLORS = {
  tfsa: '#10b981',   // green
  rrsp: '#3b82f6',   // blue
  resp: '#f59e0b',   // yellow
  grid: '#e5e7eb',   // light gray
  axis: '#6b7280',   // gray-500
  area: '#16a34a',   // green-600
  dashed: '#16a34a', // same hue for projection
};

// ---------- page ----------
export default function DashboardPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  // fetch accounts -> allocation + starting balance
  const [accounts, setAccounts] = useState<Account[]>([]);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const headers = token ? { authorization: `Bearer ${token}` } : {};
        const r = await fetch('/api/accounts', { headers: headers as HeadersInit });
        const j = await r.json();
        if (!mounted) return;
        const list: Account[] = Array.isArray(j?.items) ? j.items : [];
        setAccounts(list);
      } catch {
        // leave empty; show zeros gracefully
      }
    })();
    return () => { mounted = false; };
  }, [token]);

  // allocation
  const { total, tfsa, rrsp, resp } = useMemo(() => {
    let tfsa = 0, rrsp = 0, resp = 0, other = 0;
    for (const a of accounts) {
      const bal = Number(a.balance ?? 0);
      if (a.type === 'TFSA') tfsa += bal;
      else if (a.type === 'RRSP') rrsp += bal;
      else if (a.type === 'RESP') resp += bal;
      else other += bal;
    }
    return { total: tfsa + rrsp + resp + other, tfsa, rrsp, resp };
  }, [accounts]);

  // controls (defaults to your screenshot)
  const [years, setYears] = useState(12);     // 12 years visible
  const [monthly, setMonthly] = useState(1000);
  const [growth, setGrowth]   = useState(10); // %

  const yearNow = new Date().getFullYear();
  const startTs = jan1(yearNow);               // x-axis starts Jan 1 this year
  const endTs   = jan1(yearNow + years);

  // projection model: monthly compounding with monthly contributions
  const data = useMemo(() => {
    const points: { ts: number; value: number; proj: number }[] = [];
    const monthlyRate = Math.pow(1 + growth / 100, 1 / 12) - 1;
    const months = years * 12;

    let balance = total; // start from aggregated current equity
    for (let i = 0; i <= months; i++) {
      const d = new Date(yearNow, 0, 1);
      d.setMonth(0 + i); // month i from Jan
      // project forward from current total
      balance = balance * (1 + monthlyRate) + monthly;
      points.push({ ts: d.getTime(), value: balance, proj: balance });
    }
    return points;
  }, [total, monthly, growth, years, yearNow]);

  // year ticks (avoid overlap)
  const yearTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let y = yearNow; y <= yearNow + years; y++) ticks.push(jan1(y));
    return ticks;
  }, [yearNow, years]);

  const tenYearMarker = jan1(yearNow + 10);

  // donut data
  const pieData = [
    { name: 'TFSA', value: tfsa, key: 'tfsa', color: COLORS.tfsa },
    { name: 'RRSP', value: rrsp, key: 'rrsp', color: COLORS.rrsp },
    { name: 'RESP', value: resp, key: 'resp', color: COLORS.resp },
  ];

  return (
    <main className="mx-auto max-w-7xl p-4 space-y-4">
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Chart card */}
        <div className="lg:col-span-2 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Portfolio Value (Actual &amp; Projected)</h2>
            <div className="flex items-center gap-4 text-sm">
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-2 w-6 rounded bg-black" />
                <span>Actual (area filled)</span>
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-0.5 w-6 rounded border-t-2 border-dashed" style={{ borderTopColor: COLORS.dashed }} />
                <span>Projection</span>
              </span>
            </div>
          </div>

          <div className="h-[380px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.area} stopOpacity={0.20} />
                    <stop offset="100%" stopColor={COLORS.area} stopOpacity={0.05} />
                  </linearGradient>
                </defs>

                <CartesianGrid stroke={COLORS.grid} vertical={false} />

                <XAxis
                  dataKey="ts"
                  type="number"
                  domain={[startTs, endTs]}
                  ticks={yearTicks}
                  tickFormatter={(ts) => new Date(Number(ts)).getFullYear().toString()}
                  tick={{ fill: COLORS.axis, fontSize: 12 }}
                  axisLine={{ stroke: COLORS.grid }}
                  tickLine={{ stroke: COLORS.grid }}
                  minTickGap={28}
                />
                <YAxis
                  tickFormatter={(v) => compactCAD(Number(v))}
                  tick={{ fill: COLORS.axis, fontSize: 12 }}
                  axisLine={{ stroke: COLORS.grid }}
                  tickLine={{ stroke: COLORS.grid }}
                  width={64}
                />
                <Tooltip
                  formatter={(v: any, _n, p) => [CAD(Number(v)), 'value']}
                  labelFormatter={(ts) =>
                    new Date(Number(ts)).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
                  }
                />

                {/* Filled "Actual" area (we render the same series as area to match the look) */}
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#111827"
                  fill="url(#areaFill)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />

                {/* Dashed projection line */}
                <Line
                  type="monotone"
                  dataKey="proj"
                  stroke={COLORS.dashed}
                  strokeWidth={2}
                  strokeDasharray="6 6"
                  dot={false}
                  isAnimationActive={false}
                />

                {/* 10-year vertical marker */}
                <ReferenceLine x={tenYearMarker} stroke="#9ca3af" strokeDasharray="3 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Zoom & sliders row */}
          <div className="mt-3 grid grid-cols-1 gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setYears((y) => Math.max(5, y - 5))}
                className="rounded-md border px-3 py-1 text-sm"
              >-5</button>
              <button
                onClick={() => setYears((y) => Math.min(40, y + 5))}
                className="rounded-md border px-3 py-1 text-sm"
              >+5</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Monthly Contribution slider */}
              <div className="rounded-xl border p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Monthly Contribution</span>
                  <span className="text-gray-700">{CAD(monthly)}</span>
                </div>
                <input
                  aria-label="Monthly Contribution"
                  type="range"
                  min={0}
                  max={10000}
                  step={50}
                  value={monthly}
                  onChange={(e) => setMonthly(Number(e.target.value))}
                  className="mt-2 w-full"
                />
              </div>

              {/* Annual Growth slider */}
              <div className="rounded-xl border p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Annual Growth</span>
                  <span className="text-gray-700">{growth}%</span>
                </div>
                <input
                  aria-label="Annual Growth"
                  type="range"
                  min={0}
                  max={20}
                  step={0.5}
                  value={growth}
                  onChange={(e) => setGrowth(Number(e.target.value))}
                  className="mt-2 w-full"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Allocation donut */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold">Account Allocation</h2>

          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={80}
                  outerRadius={120}
                  strokeWidth={0}
                  isAnimationActive={false}
                >
                  {pieData.map((s) => (
                    <Cell key={s.key} fill={s.color} />
                  ))}
                </Pie>

                {/* Center label */}
                <text
                  x="50%" y="45%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-gray-900"
                  style={{ fontWeight: 600 }}
                >
                  Total
                </text>
                <text
                  x="50%" y="58%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-gray-900"
                  style={{ fontWeight: 700, fontSize: 18 }}
                >
                  {CAD(total)}
                </text>
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="mt-2 flex items-center justify-center gap-5 text-sm">
            <LegendDot color={COLORS.tfsa} label="TFSA" />
            <LegendDot color={COLORS.rrsp} label="RRSP" />
            <LegendDot color={COLORS.resp} label="RESP" />
          </div>
        </div>
      </section>
    </main>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
      <span>{label}</span>
    </span>
  );
}
