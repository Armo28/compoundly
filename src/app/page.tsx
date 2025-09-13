'use client';

import { useMemo, useState } from 'react';
import {
  AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, Legend
} from 'recharts';

// ---- Helpers you already had (or equivalents) ----
type Point = { t: number; actual?: number; proj?: number };

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const jan1 = (y: number) => new Date(y, 0, 1).getTime();

function buildYearTicks(minTs: number, maxTs: number): number[] {
  const minY = new Date(minTs).getFullYear();
  const maxY = new Date(maxTs).getFullYear();
  // pick a step so ticks don't crowd (≈ every 2–4 years, adaptive)
  const range = Math.max(1, maxY - minY);
  const step = range > 20 ? 4 : range > 12 ? 3 : 2;
  const ticks: number[] = [];
  for (let y = minY; y <= maxY; y += step) ticks.push(jan1(y));
  // ensure endpoints are present
  if (!ticks.includes(jan1(minY))) ticks.unshift(jan1(minY));
  if (!ticks.includes(jan1(maxY))) ticks.push(jan1(maxY));
  return ticks;
}

// ---- Demo-ish data shaper (use your real data) ----
function useChartData(): Point[] {
  // Keep your existing data compute; this is a placeholder that reads 20 years flat line
  const now = useMemo(() => Date.now(), []);
  const start = jan1(new Date().getFullYear());
  const points: Point[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = start + i * YEAR_MS;
    points.push({ t, actual: i === 0 ? 0 : undefined, proj: 90000 }); // keep your projection value
  }
  return points;
}

export default function Dashboard() {
  const data = useChartData();

  const [yearsShift, setYearsShift] = useState(0);
  const shifted = useMemo(() => {
    if (!yearsShift) return data;
    const delta = yearsShift * YEAR_MS;
    return data.map(p => ({ ...p, t: p.t + delta }));
  }, [data, yearsShift]);

  const domain = useMemo<[number, number]>(() => {
    if (!shifted.length) {
      const y = jan1(new Date().getFullYear());
      return [y, y + 10 * YEAR_MS];
    }
    return [shifted[0].t, shifted[shifted.length - 1].t];
  }, [shifted]);

  const ticks = useMemo(() => buildYearTicks(domain[0], domain[1]), [domain]);

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-lg font-semibold mb-2">Portfolio Value (Actual &amp; Projected)</div>
        <div style={{ width: '100%', height: 360 }}>
          <ResponsiveContainer>
            <AreaChart data={shifted} margin={{ top: 12, right: 16, bottom: 16, left: 0 }}>
              <defs>
                <linearGradient id="fillActual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#111827" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#111827" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <Legend />
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                type="number"
                domain={[domain[0], domain[1]]}
                ticks={ticks}
                // ✅ return a STRING; also anchor ticks at Jan 1 so labels don’t collide
                tickFormatter={(ts) => new Date(ts as number).getFullYear().toString()}
                interval="preserveStartEnd"
                minTickGap={28}
              />
              <YAxis tickFormatter={(v) =>
                v.toLocaleString(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
              } />
              <Tooltip
                labelFormatter={(ts) => new Date(ts as number).toLocaleDateString()}
                formatter={(val: number, name: string) => [
                  val.toLocaleString(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }),
                  name
                ]}
              />
              {/* Actual as area (if you have it) */}
              <Area
                type="monotone"
                dataKey="actual"
                name="Actual (area filled)"
                stroke="#111827"
                fill="url(#fillActual)"
                dot={false}
                isAnimationActive={false}
              />
              {/* Projection dashed line */}
              <Line
                type="monotone"
                dataKey="proj"
                name="Projection"
                strokeDasharray="6 6"
                stroke="#22c55e"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 flex gap-3">
          <button className="rounded border px-3 py-1.5" onClick={() => setYearsShift(y => y - 5)}>-5</button>
          <button className="rounded border px-3 py-1.5" onClick={() => setYearsShift(y => y + 5)}>+5</button>
        </div>
      </section>

      {/* Your right-side donut card stays as-is in your existing code */}
    </main>
  );
}
