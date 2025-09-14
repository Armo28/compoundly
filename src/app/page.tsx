// src/app/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { useAuth } from '@/lib/auth';

/** ---------- helpers ---------- */

const CAD = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

const CAD_SHORT = (n: number) =>
  // Compact (CA$1.2M / CA$250K) but keep currency
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'CAD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);

type Account = {
  id: string;
  type: 'TFSA' | 'RRSP' | 'RESP' | string;
  balance?: number | null;
};

type Allocation = { tfsa: number; rrsp: number; resp: number; other: number; total: number };

/** Build monthly projection points */
function buildSeries(startTs: number, months: number, monthly: number, annualPct: number, initialValue: number) {
  const r = annualPct / 100 / 12; // monthly rate
  let value = initialValue;
  const data: Array<{ ts: number; actual: number; projection: number }> = [];
  for (let i = 0; i <= months; i++) {
    const ts = new Date(startTs);
    ts.setMonth(ts.getMonth() + i);
    // Simple compound: add contribution, then grow remaining (end-of-period contributions)
    value = value * (1 + r) + monthly;
    data.push({ ts: ts.getTime(), actual: value, projection: value });
  }
  return data;
}

/** Jan 1 ticks between start and end; string labels to satisfy recharts typing */
function yearTicksBetween(start: Date, end: Date, stepYears = 2): Array<number> {
  const ticks: number[] = [];
  const y0 = start.getFullYear();
  const y1 = end.getFullYear();
  for (let y = y0; y <= y1; y += stepYears) {
    const d = new Date(Date.UTC(y, 0, 1)); // Jan 1 UTC
    ticks.push(d.getTime());
  }
  return ticks;
}

/** ---------- page ---------- */

export default function DashboardPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  // sliders: defaults requested
  const [monthly, setMonthly] = useState(1000);   // CA$1,000
  const [growth, setGrowth] = useState(10);       // 10%
  const [horizonY, setHorizonY] = useState(40);   // years shown (+/- buttons control)

  const [alloc, setAlloc] = useState<Allocation>({ tfsa: 0, rrsp: 0, resp: 0, other: 0, total: 0 });
  const [loadingAlloc, setLoadingAlloc] = useState(true);

  /** Fetch accounts to compute allocation donut */
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingAlloc(true);
      try {
        const headers: HeadersInit = token ? { authorization: `Bearer ${token}` } : {};
        const r = await fetch('/api/accounts', { headers });
        const j = await r.json();
        const items: Account[] = Array.isArray(j?.items) ? j.items : [];
        if (!mounted) return;

        const sum = (xs: Account[], pred: (a: Account) => boolean) =>
          xs.reduce((acc, a) => acc + (pred(a) ? (a.balance ?? 0) : 0), 0);

        const tfsa = sum(items, a => a.type === 'TFSA');
        const rrsp = sum(items, a => a.type === 'RRSP');
        const resp = sum(items, a => a.type === 'RESP');
        const total = sum(items, () => true);
        const other = Math.max(0, total - tfsa - rrsp - resp);

        setAlloc({ tfsa, rrsp, resp, other, total });
      } catch {
        if (!mounted) return;
        setAlloc({ tfsa: 0, rrsp: 0, resp: 0, other: 0, total: 0 });
      } finally {
        if (mounted) setLoadingAlloc(false);
      }
    })();
    return () => { mounted = false; };
  }, [token]);

  /** Projection series (actual area & projection line share the same numbers but use different keys) */
  const series = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setUTCDate(1); // normalize to day 1
    const months = Math.max(12, horizonY * 12);
    return buildSeries(start.getTime(), months, monthly, growth, alloc.total);
  }, [monthly, growth, horizonY, alloc.total]);

  /** X axis ticks: Jan 1 every 2–3 years depending on horizon */
  const xTicks = useMemo(() => {
    if (!series.length) return [];
    const start = new Date(series[0].ts);
    const end = new Date(series[series.length - 1].ts);
    const spanYears = end.getFullYear() - start.getFullYear();
    const step = spanYears > 36 ? 4 : spanYears > 24 ? 3 : 2;
    return yearTicksBetween(start, end, step);
  }, [series]);

  /** Colors (match your theme) */
  const GREEN = '#16a34a';
  const GREEN_LIGHT = '#bbf7d0';
  const BLUE = '#2563eb';
  const YELLOW = '#f59e0b';
  const GRAY = '#e5e7eb';

  /** Donut data */
  const donut = [
    { name: 'TFSA', value: alloc.tfsa, color: GREEN },
    { name: 'RRSP', value: alloc.rrsp, color: BLUE },
    { name: 'RESP', value: alloc.resp, color: YELLOW },
  ];

  return (
    <main className="max-w-7xl mx-auto p-4 space-y-6">
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-lg font-semibold mb-2">Portfolio Value (Actual &amp; Projected)</div>
          <div className="h-[380px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={series}
                margin={{ top: 12, right: 24, bottom: 8, left: 0 }}
              >
                <CartesianGrid stroke={GRAY} vertical={false} />
                <XAxis
                  dataKey="ts"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  ticks={xTicks}
                  tickFormatter={(ts) => new Date(ts as number).getFullYear().toString()}
                  interval="preserveStartEnd"
                  minTickGap={22}
                  tickLine={false}
                />
                <YAxis
                  width={90}
                  tickFormatter={(v) => CAD_SHORT(Number(v))}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value, name) => [CAD(Number(value)), name === 'actual' ? 'Actual' : 'Projection']}
                  labelFormatter={(ts) => new Date(ts as number).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: '2-digit'
                  })}
                />
                {/* Actual (filled area) */}
                <Area
                  type="monotone"
                  dataKey="actual"
                  stroke="#111827"
                  fill="#111827"
                  fillOpacity={0.08}
                  dot={false}
                  isAnimationActive={false}
                />
                {/* Projection (green dashed line) */}
                <Line
                  type="monotone"
                  dataKey="projection"
                  stroke={GREEN}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  strokeDasharray="6 6"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Horizon nudge buttons */}
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => setHorizonY(h => Math.max(5, h - 5))}
              className="px-3 py-1.5 rounded-lg border text-sm"
            >
              −5
            </button>
            <button
              onClick={() => setHorizonY(h => Math.min(50, h + 5))}
              className="px-3 py-1.5 rounded-lg border text-sm"
            >
              +5
            </button>
          </div>

          {/* Sliders */}
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border p-4">
              <div className="text-sm text-gray-600 mb-2">Monthly Contribution</div>
              <div className="text-right text-sm font-medium mb-1">{CAD(monthly)}</div>
              <input
                type="range"
                min={0}
                max={10000}
                step={50}
                value={monthly}
                onChange={(e) => setMonthly(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-sm text-gray-600 mb-2">Annual Growth</div>
              <div className="text-right text-sm font-medium mb-1">{growth}%</div>
              <input
                type="range"
                min={0}
                max={20}
                step={0.5}
                value={growth}
                onChange={(e) => setGrowth(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Donut */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-lg font-semibold mb-2">Account Allocation</div>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donut}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={70}
                  outerRadius={105}
                  paddingAngle={2}
                  stroke="#ffffff"
                  isAnimationActive={false}
                >
                  {donut.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Legend
                  verticalAlign="bottom"
                  align="center"
                  iconType="circle"
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="text-center text-sm text-gray-600 mt-1">
            <span className="font-medium">Total {CAD(alloc.total)}</span>
            {loadingAlloc ? ' • loading…' : null}
          </div>
        </div>
      </section>
    </main>
  );
}
