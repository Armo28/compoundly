// src/app/page.tsx
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

type Account = { id: string; name: string; type: string; balance: number };

function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }
function currency(n: number) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
}

function ProjectionChart({
  actual, projection, years
}: {
  actual: { month: number; value: number }[];
  projection: { month: number; value: number }[];
  years: number;
}) {
  const paddingLeft = 100, paddingRight = 20, paddingTop = 20, paddingBottom = 46;
  const width = 840, height = 320;
  const svgRef = useRef<SVGSVGElement | null>(null);

  const all = [...actual, ...projection];
  const minX = Math.min(...all.map(p => p.month), -12);
  const maxX = Math.max(...all.map(p => p.month), years * 12);
  const minY = Math.min(...all.map(p => p.value), 0);
  const maxY = Math.max(...all.map(p => p.value), 1);

  const innerW = width - paddingLeft - paddingRight;
  const innerH = height - paddingTop - paddingBottom;
  const sx = (m: number) => paddingLeft + (m - minX) * (innerW / (maxX - minX || 1));
  const sy = (v: number) => paddingTop + (maxY - v) * (innerH / (maxY - minY || 1));

  const path = (pts: { month: number; value: number }[]) =>
    pts.length ? pts.map((p, i) => `${i ? 'L' : 'M'} ${sx(p.month)} ${sy(p.value)}`).join(' ') : '';

  const actualLine = path(actual);
  const area = actual.length ? `${path(actual)} L ${sx(actual[actual.length - 1].month)} ${sy(minY)} L ${sx(actual[0].month)} ${sy(minY)} Z` : '';
  const projLine = path(projection);

  return (
    <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="w-full h-80">
      <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} stroke="#e5e7eb" />
      <line x1={paddingLeft} y1={paddingTop} x2={paddingLeft} y2={height - paddingBottom} stroke="#e5e7eb" />
      {area && <path d={area} fill="#11182714" stroke="none" />}
      {actualLine && <path d={actualLine} fill="none" stroke="#111827" strokeWidth={2.5} />}
      {projLine && <path d={projLine} fill="none" stroke="#22c55e" strokeWidth={3} strokeDasharray="6 6" />}
      <text x={width / 2} y={height - 8} fontSize="11" textAnchor="middle" fill="#6b7280">Calendar Year</text>
      <text x={-58} y={height / 2} transform={`rotate(-90, -58, ${height / 2})`} fontSize="11" textAnchor="middle" fill="#6b7280">Portfolio value (CAD)</text>
    </svg>
  );
}

function projectFrom(startValue: number, months: number, annual: number, monthlyContrib: number) {
  const r = annual / 12;
  const out: { month: number; value: number }[] = [{ month: 0, value: startValue }];
  let v = startValue;
  for (let m = 1; m <= months; m++) {
    v = Math.max(0, v * (1 + r) + monthlyContrib);
    out.push({ month: m, value: v });
  }
  return out;
}

export default function Dashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  // sliders
  const [monthly, setMonthly] = useState(1000); // default $1,000
  const [annualPct, setAnnualPct] = useState(10); // default 10%
  const [futureYears, setFutureYears] = useState(10); // can go up by +5 up to +30

  async function refreshAccounts() {
    setLoading(true);
    const res = await fetch('/api/accounts', { cache: 'no-store' });
    const json = await res.json();
    setLoading(false);
    if (json?.ok) setAccounts(json.accounts);
  }

  useEffect(() => {
    refreshAccounts();
    const id = setInterval(refreshAccounts, 30_000);
    return () => clearInterval(id);
  }, []);

  const totalNow = useMemo(() => accounts.reduce((a, b) => a + (b.balance || 0), 0), [accounts]);

  // build a simple "actual" series from running totals (demo: last 12 months flat at totalNow)
  const actual = useMemo(() => {
    const monthsBack = 12;
    const arr: { month: number; value: number }[] = [];
    for (let m = -monthsBack; m <= 0; m++) {
      arr.push({ month: m, value: totalNow });
    }
    return arr;
  }, [totalNow]);

  const projection = useMemo(() => {
    const months = futureYears * 12;
    return projectFrom(totalNow, months, annualPct / 100, monthly);
  }, [totalNow, futureYears, annualPct, monthly]);

  return (
    <main className="max-w-6xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Left: Chart & controls */}
      <div className="lg:col-span-2 space-y-4">
        <div className="rounded-2xl border p-4 shadow-sm bg-white">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Portfolio (Actual &amp; Projection)</div>
            <div className="text-sm text-gray-600">Total now: {currency(totalNow)}</div>
          </div>
          <ProjectionChart actual={actual} projection={projection} years={futureYears} />
        </div>

        <div className="rounded-2xl border p-4 shadow-sm bg-white space-y-3">
          {/* slimmer sliders */}
          <div>
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
              className="w-full h-2 mt-1"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Annual Growth</label>
              <div className="text-sm text-gray-600">{annualPct}%</div>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={annualPct}
              onChange={(e) => setAnnualPct(+e.target.value)}
              className="w-full h-2 mt-1"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Projection horizon</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFutureYears((y) => clamp(y - 5, 10, 40))}
                className="rounded border px-2 py-1 text-sm"
              >
                −5y
              </button>
              <div className="text-sm">{futureYears} years</div>
              <button
                onClick={() => setFutureYears((y) => clamp(y + 5, 10, 40))}
                className="rounded border px-2 py-1 text-sm"
              >
                +5y
              </button>
            </div>
          </div>
          <div className="text-xs text-gray-500">
            Minimum is 10 years. Maximum visible future is capped at 40.
          </div>
        </div>
      </div>

      {/* Right: quick links & snapshot */}
      <div className="space-y-4">
        <div className="rounded-2xl border p-4 shadow-sm bg-white">
          <div className="text-sm font-medium mb-2">Quick actions</div>
          <div className="flex flex-wrap gap-2">
            <Link href="/accounts" className="rounded-lg border px-3 py-1.5 text-sm">Manage accounts</Link>
            <Link href="/room" className="rounded-lg border px-3 py-1.5 text-sm">Contribution room</Link>
          </div>
        </div>

        <div className="rounded-2xl border p-4 shadow-sm bg-white">
          <div className="text-sm text-gray-500">Snapshot</div>
          <div className="text-2xl font-semibold mt-1">{currency(totalNow)}</div>
          <div className="text-xs text-gray-400 mt-1">Sum of manual accounts</div>
        </div>
      </div>
    </main>
  );
}
