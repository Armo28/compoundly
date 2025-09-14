'use client';

import {useEffect, useMemo, useState} from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend
} from 'recharts';

type Point = { t: number; v: number }; // t = timestamp (ms), v = value (CAD)

const CAD = (n:number)=>n.toLocaleString(undefined,{style:'currency',currency:'CAD',maximumFractionDigits:0});
const COLORS = {
  axis: '#60646c',
  grid: '#eceff3',
  actual: '#111827',
  projStroke: '#16a34a',
  projFillStart: 'rgba(22,163,74,1)',   // 100%
  projFillEnd:   'rgba(22,163,74,0.2)', // 20%
  pieTFSA: '#22c55e',
  pieRRSP: '#60a5fa',
  pieRESP: '#f59e0b',
};

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
  // ---- controls (defaults you asked for) ----
  const [monthly, setMonthly] = useState(1000);   // CA$1,000 default
  const [growth, setGrowth]   = useState(0.10);   // 10% default
  const [yearsWin, setYearsWin] = useState(12);   // a nice default window

  // pretend “current” equity is based on Accounts donut (we’ll read it from DOM later if needed)
  const [equityTFSA, equityRRSP, equityRESP] = [25000, 50000, 15000];
  const totalEquity = equityTFSA + equityRRSP + equityRESP;

  // ---- window and time bases ----
  const now = useMemo(()=> new Date(), []);
  const windowStart = useMemo(()=> startOfMonth(now), [now]);
  const windowEnd   = useMemo(()=> addMonths(windowStart, yearsWin*12), [windowStart, yearsWin]);

  // ---- build monthly series once per dependency change ----
  const {actualData, projectionData, ticks, useMonthlyTicks} = useMemo(()=>{
    // series includes windowStart..windowEnd (month steps)
    const months = monthsBetween(windowStart, windowEnd) + 1;
    const dataAll: Point[] = [];
    const r = (1 + growth/12); // monthly compound factor

    // model: start with totalEquity at “now” month; backfill earlier months linearly (flat) to keep a baseline
    // then compound forward for projection
    // To ensure a smooth join, we compute backwards from “now” one could model a simple flat line; that keeps
    // the “actual” separate visually while still filled area.
    const nowMonthIndex = 0; // first point is current month
    for (let i=0;i<months;i++){
      const d = addMonths(windowStart, i);
      const t = d.getTime();
      if (i <= nowMonthIndex) {
        // Actual: keep as the known totalEquity (you can later replace with true historical fetch)
        dataAll.push({t, v: totalEquity});
      } else {
        // Projection: compound prior value and add monthly contributions
        const prev = dataAll[i-1].v;
        const projected = prev*r + monthly;
        dataAll.push({t, v: projected});
      }
    }

    // Split series: actual = [windowStart..now]; projection = (now+1)..end
    const actual: Point[] = dataAll.slice(0, nowMonthIndex+1);
    const proj:   Point[] = dataAll.slice(nowMonthIndex+1);

    // X ticks
    const totalMonths = monthsBetween(windowStart, windowEnd);
    const monthlyTicks = totalMonths <= 24;
    const ticks: number[] = [];
    if (monthlyTicks) {
      for (let i=0;i<months;i++) ticks.push(addMonths(windowStart, i).getTime());
    } else {
      // year ticks (every January)
      let y = windowStart.getFullYear();
      while (y <= windowEnd.getFullYear()) {
        ticks.push(new Date(y, 0, 1).getTime());
        y += 1;
      }
    }

    return {actualData: actual, projectionData: proj, ticks, useMonthlyTicks: monthlyTicks};
  }, [windowStart, windowEnd, totalEquity, monthly, growth]);

  // ---- tooltip (no duplicate lines) ----
  const CustomTooltip = ({active, payload, label}: any) => {
    if (!active) return null;
    const ts = Number(label);
    // Decide which series we’re hovering: actual if ts === last actual timestamp; otherwise projection
    const isActual = actualData.length > 0 && ts === actualData[actualData.length-1].t;
    const seriesVal = isActual
      ? actualData.find(p=>p.t===ts)?.v
      : projectionData.find(p=>p.t===ts)?.v;

    if (seriesVal == null) return null;
    const date = new Date(ts);
    const when = useMonthlyTicks
      ? date.toLocaleString(undefined,{month:'short', year:'numeric'})
      : date.getFullYear().toString();

    return (
      <div className="rounded-md border bg-white px-3 py-2 shadow-sm">
        <div className="text-xs text-gray-600">{when}</div>
        <div className="text-sm font-medium" style={{color: isActual ? COLORS.actual : COLORS.projStroke}}>
          {CAD(seriesVal)}
        </div>
      </div>
    );
  };

  // ---- donut data ----
  const pieData = [
    {name:'TFSA', value: equityTFSA, color: COLORS.pieTFSA},
    {name:'RRSP', value: equityRRSP, color: COLORS.pieRRSP},
    {name:'RESP', value: equityRESP, color: COLORS.pieRESP},
  ];

  return (
    <main className="max-w-7xl mx-auto p-4 space-y-4">
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm lg:col-span-2">
          <div className="mb-2 font-semibold">Portfolio Value (Actual & Projected)</div>
          <div className="h-[380px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart margin={{left:0,right:12,top:8,bottom:0}}>
                <defs>
                  <linearGradient id="projFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.projFillStart} stopOpacity={1}/>
                    <stop offset="100%" stopColor={COLORS.projFillEnd} stopOpacity={1}/>
                  </linearGradient>
                  <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#111827" stopOpacity={0.18}/>
                    <stop offset="100%" stopColor="#111827" stopOpacity={0.06}/>
                  </linearGradient>
                </defs>

                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={['dataMin','dataMax']}
                  ticks={ticks}
                  tickFormatter={(ts:number)=>{
                    const d = new Date(ts);
                    return useMonthlyTicks ? d.toLocaleString(undefined,{month:'short'}) + (d.getMonth()===0 ? ` ${d.getFullYear()}` : '') : d.getFullYear().toString();
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
                  tickFormatter={(n)=>CAD(n).replace(/\.\d{2}$/,'')}
                  width={72}
                />
                <Tooltip content={<CustomTooltip />} />

                {/* Actual area up to now */}
                <Area
                  data={actualData}
                  dataKey="v"
                  stroke={COLORS.actual}
                  strokeWidth={2}
                  fill="url(#actualFill)"
                  isAnimationActive={false}
                />

                {/* Projection from next month onward */}
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

          {/* sliders in a single card */}
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
                onChange={e=>setMonthly(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div className="rounded-xl border p-3">
              <div className="mb-1 flex justify-between text-sm">
                <span>Annual Growth</span>
                <span className="font-medium">{Math.round(growth*100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={50}            // up to 50%
                step={1}
                value={Math.round(growth*100)}
                onChange={e=>setGrowth(Number(e.target.value)/100)}
                className="w-full"
              />
            </div>
          </div>

          {/* zoom controls + window label */}
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={()=>setYearsWin(y=>Math.max(1, y-1))}
              className="rounded-md border px-3 py-1 text-sm"
            >-1</button>
            <button
              onClick={()=>setYearsWin(y=>Math.min(40, y+1))}
              className="rounded-md border px-3 py-1 text-sm"
            >+1</button>
            <span className="text-sm text-gray-600">{yearsWin} year window</span>
          </div>
        </div>

        {/* Donut */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-2 font-semibold">Account Allocation</div>
          <div className="h-[300px]">
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
                  {pieData.map((s)=>(
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-center font-semibold">Total {CAD(totalEquity)}</div>
          <div className="mt-2 flex items-center justify-center gap-4 text-sm">
            <Legend
              wrapperStyle={{display:'none'}}
            />
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-full" style={{background:COLORS.pieTFSA}}/>
              TFSA
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-full" style={{background:COLORS.pieRRSP}}/>
              RRSP
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-full" style={{background:COLORS.pieRESP}}/>
              RESP
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
