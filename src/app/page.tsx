'use client';

import { useMemo, useState } from 'react';
import {
  AreaChart, Area,
  Line, LineChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

// --- tiny fake projection so the page renders even with zero inputs ---
// If you already have a projection util, you can swap this out.
type Pt = { ts: number; value: number };
const makeSeries = (years = 15, start = Date.UTC(new Date().getFullYear(), 0, 1), total = 90000): Pt[] => {
  const arr: Pt[] = [];
  const step = 365; // days spacing just for a smooth line; X-axis will show yearly ticks
  for (let i = 0; i <= years; i++) {
    const ts = Date.UTC(new Date().getFullYear() + i, 0, 1);
    // flat projection unless sliders change elsewhere
    arr.push({ ts, value: total });
  }
  return arr;
};

export default function DashboardPage() {
  // If you have state for monthly/annual elsewhere, keep using it.
  const data = useMemo(() => makeSeries(15), []);

  // Build **exact** Jan 1 ticks (prevents overlap and keeps to one per year)
  const yearTicks = useMemo(() => {
    const startYear = new Date(data[0]?.ts ?? Date.UTC(new Date().getFullYear(), 0, 1)).getUTCFullYear();
    const endYear   = new Date(data[data.length - 1]?.ts ?? Date.UTC(new Date().getFullYear() + 15, 0, 1)).getUTCFullYear();
    const ticks: number[] = [];
    for (let y = startYear; y <= endYear; y++) {
      ticks.push(Date.UTC(y, 0, 1));
    }
    return ticks;
  }, [data]);

  return (
    <main className="mx-auto max-w-6xl p-4 space-y-4">
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-lg font-semibold mb-3">Portfolio Value (Actual &amp; Projected)</div>
        <div style={{ width: '100%', height: 360 }}>
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 12, right: 24, bottom: 12, left: 0 }}>
              <defs>
                <linearGradient id="fillArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="ts"
                type="number"
                domain={['dataMin', 'dataMax']}
                ticks={yearTicks}
                tickFormatter={(value) => new Date(Number(value)).getUTCFullYear().toString()}
                interval={0}              // show every tick we gave it
                minTickGap={28}           // extra protection against crowding
                allowDecimals={false}
              />
              <YAxis
                width={64}
                tickFormatter={(n) =>
                  n.toLocaleString(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
                }
              />
              <Tooltip
                labelFormatter={(v) => new Date(Number(v)).toUTCString().slice(5, 16)}
                formatter={(val: any) =>
                  (Number(val) || 0).toLocaleString(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
                }
              />
              <Area type="monotone" dataKey="value" stroke="#111827" fill="url(#fillArea)" />
              <Line type="monotone" dataKey="value" stroke="#22c55e" strokeDasharray="6 6" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Your allocation donut card stays as-is on your project */}
    </main>
  );
}
