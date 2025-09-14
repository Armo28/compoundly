'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceDot,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

type Account = { id: string; type: 'TFSA'|'RRSP'|'RESP'|'Margin'|'Other'|'LIRA'; balance?: number | null };

const COLORS = {
  tfsa: '#22c55e',
  rrsp: '#60a5fa',
  resp: '#f59e0b',
  grid: '#e5e7eb',
  axis: '#111827',
  actualLine: '#111827',
  actualFill: 'url(#actualFill)',
  projLine: '#22c55e',
  projFill: 'url(#projFill)',
};

const CAD = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

/** Generate an inclusive sequence of months starting at `start` (UTC), length `count`. */
function genMonths(start: Date, count: number): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    out.push(d);
  }
  return out;
}

/** Simple monthly compounding from a starting value. */
function projectSeries(opts: {
  startValue: number;
  monthlyContribution: number;
  annualGrowthPct: number; // 0..100
  months: number;
}) {
  const r = opts.annualGrowthPct / 100 / 12;
  const out: number[] = [];
  let v = opts.startValue;
  for (let i = 0; i < opts.months; i++) {
    v = v * (1 + r) + opts.monthlyContribution;
    out.push(v);
  }
  return out;
}

type ChartPoint = { ts: number; actual?: number | null; proj?: number | null };

export default function DashboardPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  // --- Fetch accounts for donut / total ---
  const [loading, setLoading] = useState(true);
  const [err, setErr]       = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!token) { setLoading(false); return; }
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch('/api/accounts', {
          headers: token ? { authorization: `Bearer ${token}` } : {},
        });
        const j = await r.json();
        if (!j?.ok) throw new Error(j?.error ?? 'Failed to load accounts');
        if (!mounted) return;
        setAccounts(j.items ?? []);
      } catch (e:any) {
        if (!mounted) return;
        setErr(e?.message || 'Error');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [token]);

  const totals = useMemo(() => {
    const sum = (t: Account['type']) =>
      accounts.filter(a => a.type === t).reduce((acc, a) => acc + (a.balance ?? 0), 0);
    const tfsa = sum('TFSA');
    const rrsp = sum('RRSP');
    const resp = sum('RESP');
    const total = tfsa + rrsp + resp;
    return { tfsa, rrsp, resp, total };
  }, [accounts]);

  // --- Controls ---
  const [windowYears, setWindowYears] = useState(1);  // +/- buttons update this
  const [monthly, setMonthly] = useState(1000);       // slider shows CAD$1,000 default
  const [growth, setGrowth]   = useState(10);         // 10% default

  const windowMonths = Math.max(12, Math.min(600, Math.round(windowYears * 12)));
  const startMonth = useMemo(() => {
    // start at current month (UTC, day 1) minus (windowMonths-1), so last point is "now month"
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (windowMonths - 1), 1));
  }, [windowMonths]);

  // --- Build chart data ---
  const data: ChartPoint[] = useMemo(() => {
    const months = genMonths(startMonth, windowMonths);
    // "Actual" series: ensure at least 2 points so the line & fill are visible
    // For now, we synthesize a flat line equal to today's total for the last two months.
    const totalNow = totals.total || 0;
    const actualEndIndex = months.length >= 2 ? months.length - 1 : 0;
    const actualStartIndex = Math.max(0, actualEndIndex - 1);

    // Projected series begins AFTER the last actual point
    const projHorizon = months.length - (actualEndIndex + 1);
    const projValues =
      projHorizon > 0
        ? projectSeries({
            startValue: totalNow,
            monthlyContribution: monthly,
            annualGrowthPct: growth,
            months: projHorizon,
          })
        : [];

    const rows: ChartPoint[] = months.map((d, i) => {
      const ts = +d;
      if (i < actualStartIndex) {
        // before our minimal actual coverage: nothing
        return { ts, actual: null, proj: null };
      }
      if (i === actualStartIndex || i === actualEndIndex) {
        return { ts, actual: totalNow, proj: null };
      }
      // After last actual = projection only
      const projIndex = i - (actualEndIndex + 1);
      const projVal = projIndex >= 0 ? projValues[projIndex] : null;
      return { ts, actual: null, proj: projVal ?? null };
    });

    // Edge case: very small windows => guarantee two points present for actual
    if (rows.filter(r => r.actual != null).length < 2) {
      if (rows.length >= 2) {
        rows[rows.length - 2].actual = totalNow;
        rows[rows.length - 1].actual = totalNow;
      }
    }

    return rows;
  }, [startMonth, windowMonths, totals.total, monthly, growth]);

  const xIsMonthly = windowMonths <= 24;

  // Tooltips: show a single line with whichever value exists
  const tooltipFormatter = (val: any, name: string) => {
    return [CAD(Number(val)), name === 'actual' ? 'Actual' : 'Projection'];
  };

  const pieData = useMemo(
    () => [
      { name: 'TFSA', value: totals.tfsa, color: COLORS.tfsa },
      { name: 'RRSP', value: totals.rrsp, color: COLORS.rrsp },
      { name: 'RESP', value: totals.resp, color: COLORS.resp },
    ],
    [totals],
  );

  return (
    <main className="max-w-7xl mx-auto p-4 space-y-4">
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Left: line/area chart */}
          <div className="lg:col-span-3">
            <div className="text-lg font-semibold mb-2">Portfolio Value (Actual &amp; Projected)</div>
            <div className="h-[380px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data}
                  margin={{ top: 8, right: 12, bottom: 8, left: 8 }} // extra left pad so Y labels never clip
                >
                  <defs>
                    {/* subtle gray for actual area */}
                    <linearGradient id="actualFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#6b7280" stopOpacity={0.16} />
                      <stop offset="100%" stopColor="#6b7280" stopOpacity={0.04} />
                    </linearGradient>
                    {/* toned-down green for projection area */}
                    <linearGradient id="projFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0.06} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid stroke={COLORS.grid} vertical={false} />

                  <XAxis
                    dataKey="ts"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={
                      xIsMonthly
                        ? (ts) => new Date(Number(ts)).toLocaleString(undefined, { month: 'short' })
                        : (ts) => new Date(Number(ts)).getFullYear().toString()
                    }
                    tick={{ fill: COLORS.axis, fontSize: 12 }}
                    tickLine={{ stroke: COLORS.grid }}
                    axisLine={{ stroke: COLORS.grid }}
                    minTickGap={xIsMonthly ? 10 : 28}
                    allowDecimals={false}
                  />

                  <YAxis
                    width={52}
                    tickFormatter={(v) =>
                      Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })
                        .replace(/000$/, 'K') // 90,000 -> 90K (simple, readable)
                    }
                    tick={{ fill: COLORS.axis, fontSize: 12 }}
                    tickLine={{ stroke: COLORS.grid }}
                    axisLine={{ stroke: COLORS.grid }}
                    allowDecimals={false}
                  />

                  <Tooltip
                    formatter={tooltipFormatter}
                    labelFormatter={(ts) =>
                      new Date(Number(ts)).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: xIsMonthly ? 'short' : undefined,
                      })
                    }
                  />

                  {/* visible starting dot for actual */}
                  {data.length > 0 && (
                    <ReferenceDot
                      x={data.find((d) => d.actual != null)?.ts ?? data[0].ts}
                      y={data.find((d) => d.actual != null)?.actual ?? totals.total}
                      r={3}
                      fill={COLORS.actualLine}
                      stroke="none"
                    />
                  )}

                  {/* Actual up to now */}
                  <Area
                    dataKey="actual"
                    type="monotone"
                    stroke={COLORS.actualLine}
                    strokeWidth={2}
                    fill={COLORS.actualFill}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                  />

                  {/* Projection AFTER actual */}
                  <Area
                    dataKey="proj"
                    type="monotone"
                    stroke={COLORS.projLine}
                    strokeWidth={2}
                    strokeDasharray="6 6"
                    fill={COLORS.projFill}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Sliders */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <div className="rounded-xl border px-3 py-2">
                <div className="flex items-center justify-between text-sm mb-1">
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

              <div className="rounded-xl border px-3 py-2">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>Annual Growth</span>
                  <span className="font-medium">{growth}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  value={growth}
                  onChange={(e) => setGrowth(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>

            {/* Zoom controls */}
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => setWindowYears(Math.max(0.5, windowYears - 1))}
                className="rounded-md border px-3 py-1"
              >
                −1
              </button>
              <button
                onClick={() => setWindowYears(Math.min(50, windowYears + 1))}
                className="rounded-md border px-3 py-1"
              >
                +1
              </button>
              <div className="text-sm text-gray-600 ml-2">{windowYears} year window</div>
            </div>
          </div>

          {/* Right: donut */}
          <div className="lg:col-span-2">
            <div className="text-lg font-semibold mb-2">Account Allocation</div>
            <div className="h-[340px] w-full">
              <div className="h-full w-full outline-none focus:outline-none focus-visible:outline-none">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="60%"
                      outerRadius="80%"
                      isAnimationActive={false}
                    >
                      {pieData.map((s, i) => (
                        <Cell key={i} fill={s.color} stroke="transparent" />
                      ))}
                    </Pie>
                    {/* Center total */}
                    <text
                      x="50%"
                      y="50%"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="14"
                      fill="#374151"
                    >
                      Total
                    </text>
                    <text
                      x="50%"
                      y="58%"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="20"
                      fontWeight={700}
                      fill="#111827"
                    >
                      {CAD(totals.total)}
                    </text>
                    <Legend
                      verticalAlign="bottom"
                      align="center"
                      iconType="circle"
                      formatter={(v) => v}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {loading && (
          <div className="text-sm text-gray-500 mt-2">Loading accounts…</div>
        )}
        {err && (
          <div className="text-sm text-red-600 mt-2">{err}</div>
        )}
      </section>
    </main>
  );
}
