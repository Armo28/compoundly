'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
  AreaChart, Area,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';

type Account = {
  id: string;
  type: 'TFSA' | 'RRSP' | 'RESP' | 'Margin' | 'Other' | 'LIRA';
  balance: number | null;
};

const CAD = (n: number) =>
  (n || 0).toLocaleString(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

/* ---------------------- helpers ---------------------- */

function authHeaders(token?: string): HeadersInit {
  const h = new Headers();
  if (token) h.set('authorization', `Bearer ${token}`);
  return h as HeadersInit;
}

function jan1Ticks(fromYear: number, toYear: number, maxTicks = 12): number[] {
  const ticks: number[] = [];
  for (let y = fromYear; y <= toYear; y++) ticks.push(Date.UTC(y, 0, 1));

  if (ticks.length <= maxTicks) return ticks;

  // Downsample to avoid overlap when zoomed far out
  const step = Math.ceil(ticks.length / maxTicks);
  const filtered: number[] = [];
  for (let i = 0; i < ticks.length; i += step) filtered.push(ticks[i]);
  // ensure last year tick present
  if (filtered[filtered.length - 1] !== ticks[ticks.length - 1]) {
    filtered.push(ticks[ticks.length - 1]);
  }
  return filtered;
}

/** Monthly compounding with monthly contributions */
function buildProjectionSeries(params: {
  startTotal: number;
  monthlyContribution: number;
  annualGrowthPct: number;
  years: number;
}) {
  const { startTotal, monthlyContribution, annualGrowthPct, years } = params;
  const monthlyRate = Math.pow(1 + annualGrowthPct / 100, 1 / 12) - 1;

  const points: { ts: number; value: number }[] = [];
  let value = startTotal;

  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 1); // Jan 1 current year
  const totalMonths = years * 12;

  for (let m = 0; m <= totalMonths; m++) {
    // timestamp at month m from Jan 1 current year
    const dt = new Date(start);
    dt.setUTCMonth(dt.getUTCMonth() + m);
    points.push({ ts: dt.getTime(), value });

    // grow + contribute for next step
    value = value * (1 + monthlyRate) + monthlyContribution;
  }

  return points;
}

/* ---------------------- component ---------------------- */

export default function DashboardPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  // zoom horizon (years)
  const [years, setYears] = useState<number>(15);

  // sliders (defaults requested)
  const [monthlyContribution, setMonthlyContribution] = useState<number>(1000);
  const [annualGrowth, setAnnualGrowth] = useState<number>(10);

  // accounts -> allocation + starting equity
  const [alloc, setAlloc] = useState<{ TFSA: number; RRSP: number; RESP: number; Other: number }>({
    TFSA: 0, RRSP: 0, RESP: 0, Other: 0
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch('/api/accounts', { headers: authHeaders(token) });
        const j = await r.json();
        const items: Account[] = j?.items ?? [];

        const sums = { TFSA: 0, RRSP: 0, RESP: 0, Other: 0 };
        for (const a of items) {
          const v = a.balance ?? 0;
          if (a.type === 'TFSA') sums.TFSA += v;
          else if (a.type === 'RRSP') sums.RRSP += v;
          else if (a.type === 'RESP') sums.RESP += v;
          else sums.Other += v;
        }
        if (mounted) setAlloc(sums);
      } catch {
        /* ignore */
      }
    })();
    return () => { mounted = false; };
  }, [token]);

  const startTotal = alloc.TFSA + alloc.RRSP + alloc.RESP + alloc.Other;

  const series = useMemo(
    () => buildProjectionSeries({
      startTotal,
      monthlyContribution,
      annualGrowthPct: annualGrowth,
      years
    }),
    [startTotal, monthlyContribution, annualGrowth, years]
  );

  const startYear = new Date(series[0]?.ts ?? Date.UTC(new Date().getUTCFullYear(), 0, 1)).getUTCFullYear();
  const endYear = new Date(series[series.length - 1]?.ts ?? Date.UTC(new Date().getUTCFullYear() + years, 0, 1)).getUTCFullYear();
  const ticks = useMemo(() => jan1Ticks(startYear, endYear, 12), [startYear, endYear]);

  const totalEquity = startTotal;
  const pieData = [
    { name: 'TFSA', value: alloc.TFSA },
    { name: 'RRSP', value: alloc.RRSP },
    { name: 'RESP', value: alloc.RESP },
  ];
  const pieColors = ['#22c55e', '#60a5fa', '#facc15'];

  return (
    <main className="mx-auto max-w-6xl p-4 space-y-4">

      {/* Chart card */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-lg font-semibold mb-3">Portfolio Value (Actual &amp; Projected)</div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: chart */}
          <div className="lg:col-span-2" style={{ width: '100%', height: 360 }}>
            <ResponsiveContainer>
              <AreaChart data={series} margin={{ top: 12, right: 24, bottom: 12, left: 0 }}>
                <defs>
                  <linearGradient id="fillArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#111827" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#111827" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="ts"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  ticks={ticks}
                  interval={0} // show all provided ticks
                  minTickGap={28}
                  tickFormatter={(value) => new Date(Number(value)).getUTCFullYear().toString()}
                  allowDecimals={false}
                />
                <YAxis
                  width={64}
                  tickFormatter={(n) => CAD(Number(n))}
                />
                <Tooltip
                  labelFormatter={(v) => new Date(Number(v)).toUTCString().slice(5, 16)}
                  formatter={(val: any) => CAD(Number(val))}
                />
                {/* "Actual" (filled area) – if you add historical, bind to another key */}
                <Area type="monotone" dataKey="value" stroke="#111827" fill="url(#fillArea)" />
                {/* Projection line (dashed) */}
                <Line type="monotone" dataKey="value" stroke="#22c55e" strokeDasharray="6 6" dot={false} />
              </AreaChart>
            </ResponsiveContainer>

            {/* Zoom controls */}
            <div className="mt-3 flex items-center gap-3">
              <button
                className="rounded-md border px-3 py-1.5"
                onClick={() => setYears((y) => Math.max(5, y - 5))}
              >
                −5
              </button>
              <button
                className="rounded-md border px-3 py-1.5"
                onClick={() => setYears((y) => Math.min(40, y + 5))}
              >
                +5
              </button>
            </div>
          </div>

          {/* Right: allocation donut */}
          <div className="rounded-xl border p-4">
            <div className="text-sm font-medium">Account Allocation</div>
            <div className="mt-2" style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pieData} dataKey="value" innerRadius={60} outerRadius={90} paddingAngle={2}>
                    {pieData.map((_, i) => <Cell key={i} fill={pieColors[i]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="text-center text-lg font-semibold">Total {CAD(totalEquity)}</div>
            <div className="mt-2 flex justify-center gap-4 text-sm">
              <div className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full" style={{ background: pieColors[0] }} /> TFSA</div>
              <div className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full" style={{ background: pieColors[1] }} /> RRSP</div>
              <div className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full" style={{ background: pieColors[2] }} /> RESP</div>
            </div>
          </div>
        </div>

        {/* Sliders */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Monthly Contribution</span>
              <span className="text-sm">{CAD(monthlyContribution)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={10000}
              step={100}
              value={monthlyContribution}
              onChange={(e) => setMonthlyContribution(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="rounded-xl border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Annual Growth</span>
              <span className="text-sm">{annualGrowth}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={20}
              step={0.5}
              value={annualGrowth}
              onChange={(e) => setAnnualGrowth(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </div>
      </section>
    </main>
  );
}
