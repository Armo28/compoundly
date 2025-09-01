'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';

const CAD = (n:number)=>n.toLocaleString(undefined,{style:'currency',currency:'CAD',maximumFractionDigits:0});
const compact=(n:number)=>{
  try{return new Intl.NumberFormat(undefined,{style:'currency',currency:'CAD',notation:'compact',maximumFractionDigits:1}).format(n);}catch{return CAD(n);}
};

type Summary = {
  overall: number;                     // total equity now
  byType: Record<string, number>;      // TFSA/RRSP/RESP/Margin/Other/…
};

function Donut({ parts, total }:{parts:{key:string,val:number,color:string}[], total:number}) {
  const size=220, cx=size/2, cy=size/2, rO=90, rI=58;
  const sum=parts.reduce((a,p)=>a+p.val,0)||1;
  let a0=0;
  const arcs=parts.map(p=>{
    const frac=p.val/sum, sweep=frac*2*Math.PI, a1=a0+sweep;
    const sox=cx+Math.cos(a0)*rO, soy=cy+Math.sin(a0)*rO;
    const eox=cx+Math.cos(a1)*rO, eoy=cy+Math.sin(a1)*rO;
    const six=cx+Math.cos(a1)*rI, siy=cy+Math.sin(a1)*rI;
    const esx=cx+Math.cos(a0)*rI, esy=cy+Math.sin(a0)*rI;
    const large=sweep>Math.PI?1:0; a0=a1;
    const d=`M ${sox} ${soy} A ${rO} ${rO} 0 ${large} 1 ${eox} ${eoy} L ${six} ${siy} A ${rI} ${rI} 0 ${large} 0 ${esx} ${esy} Z`;
    return {d,color:p.color,key:p.key,val:p.val};
  });

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">Account Allocation</div>
        <div className="flex gap-3 text-xs text-gray-700 flex-wrap">
          {parts.map(p=>(
            <span key={p.key} className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full" style={{background:p.color}}/>
              {p.key}
            </span>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-56">
        {arcs.map(a=><path key={a.key} d={a.d} fill={a.color} opacity={0.95}/>)}
        <circle cx={cx} cy={cy} r={rI-1} fill="#fff"/>
        <text x={cx} y={cy-6} textAnchor="middle" fontSize="12" fill="#6b7280">Total</text>
        <text x={cx} y={cy+14} textAnchor="middle" fontSize="16" className="font-semibold" fill="#111827">{CAD(total)}</text>
      </svg>
    </div>
  );
}

type Pt = { m:number; v:number };

function Chart({
  startValue,
  proj,
  yearsFuture,
  onSetYearsFuture
}:{
  startValue:number;
  proj:Pt[];
  yearsFuture:number;
  onSetYearsFuture:(n:number)=>void;
}) {
  const padL=56,padR=16,padT=16,padB=56, w=860,h=320;

  // domain
  const minX = 0;
  const maxX = Math.max(12, yearsFuture*12);
  // keep the series visually centered when everything is flat
  const flatGuard = startValue>0 ? startValue*2 : 1;
  const maxY = Math.max(flatGuard, ...proj.map(p=>p.v));
  const minY = 0;

  const innerW=w-padL-padR, innerH=h-padT-padB;
  const sx=(m:number)=>padL + (m-minX)*(innerW/(maxX-minX || 1));
  const sy=(v:number)=>padT + (maxY-v)*(innerH/(maxY-minY || 1));

  const line=(pts:Pt[])=>pts.map((p,i)=>`${i?'L':'M'} ${sx(p.m).toFixed(1)} ${sy(p.v).toFixed(1)}`).join(' ');
  const area=(pts:Pt[])=>{
    if(!pts.length) return '';
    const first=pts[0], last=pts[pts.length-1];
    return `${line(pts)} L ${sx(last.m)} ${sy(0)} L ${sx(first.m)} ${sy(0)} Z`;
  };

  // X ticks: show years; skip every other when dense
  const startYear=new Date().getFullYear();
  const endYear=startYear+Math.ceil(maxX/12);
  const years:number[]=[];
  for(let y=startYear; y<=endYear; y++) years.push(y);
  const dense = years.length>9;
  const yearTicks = years.map((y,i)=>({y, show: dense ? i%2===0 : true}));

  // Y ticks (compact, remove “CA” prefix)
  const ticksY=5;
  const yTicks=new Array(ticksY+1).fill(0).map((_,i)=>minY+(i*(maxY-minY))/ticksY);

  // tooltip state (exists already and works—keeping intact, just driven by mouse)
  const [tip, setTip] = useState<{x:number,y:number,date:string,proj:number}|null>(null);
  const onMove=(e: React.MouseEvent<SVGSVGElement>)=>{
    const svg=e.currentTarget.getBoundingClientRect();
    const x=Math.min(Math.max(e.clientX-svg.left, padL), w-padR);
    const m = (x-padL)*(maxX-minX)/innerW + minX;
    const v = (()=>{ // value from projection at arbitrary m
      if (proj.length===0) return startValue;
      const idx=Math.min(Math.max(Math.floor(m),0), proj.length-1);
      return proj[idx].v;
    })();
    // flip left/right if close to right edge
    const flip = (x > w - 140);
    setTip({x, y: sy(v), date: new Date(startYear, 0, 1 + m*30).toLocaleDateString(undefined,{year:'numeric', month:'short'}), proj: v});
    (e.currentTarget as any).dataset.flip = flip ? '1' : '0';
  };
  const onLeave=()=>setTip(null);

  // zoom buttons
  const dec = yearsFuture>10 ? 5 : 1;
  const minusLabel = yearsFuture>10 ? '-5' : '-1';
  const onMinus=()=>onSetYearsFuture(Math.max(1, yearsFuture-dec));
  const onPlus =()=>onSetYearsFuture(Math.min(40, yearsFuture+5));

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">Portfolio Value (Projected)</div>
        <div className="flex items-center gap-4 text-xs text-gray-700">
          <span className="inline-flex items-center gap-2">
            <svg width="44" height="8"><line x1="0" y1="4" x2="44" y2="4" stroke="#22c55e" strokeWidth="3" strokeDasharray="6 6"/></svg>
            Projection
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-80"
           onMouseMove={onMove} onMouseLeave={onLeave}>
        {/* axes */}
        <line x1={padL} y1={h-padB} x2={w-padR} y2={h-padB} stroke="#e5e7eb"/>
        <line x1={padL} y1={padT} x2={padL} y2={h-padB} stroke="#e5e7eb"/>

        {/* y grid + labels */}
        {yTicks.map((v,i)=>(
          <g key={`y-${i}`}>
            <line x1={padL} y1={sy(v)} x2={w-padR} y2={sy(v)} stroke="#f3f4f6"/>
            <text x={padL-8} y={sy(v)+3} fontSize="10" textAnchor="end" fill="#6b7280">
              {compact(v).replace('CA','')}
            </text>
          </g>
        ))}

        {/* x years (skip every other when dense) */}
        {yearTicks.map(({y,show},i)=>{
          const m=(y-startYear)*12;
          return (
            <g key={`x-${y}`}>
              <line x1={sx(m)} y1={h-padB} x2={sx(m)} y2={h-padB+6} stroke="#d1d5db"/>
              {show && (
                <text x={sx(m)} y={h-padB+18} fontSize="10" textAnchor="middle" fill="#6b7280">
                  {y}
                </text>
              )}
            </g>
          );
        })}

        {/* Projection fill + line */}
        <defs>
          <linearGradient id="projFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.25"/>
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.05"/>
          </linearGradient>
        </defs>
        <path d={area(proj)} fill="url(#projFill)" />
        <path d={line(proj)} fill="none" stroke="#22c55e" strokeWidth={2.5} strokeDasharray="6 6"/>

        {/* tooltip (unchanged behaviour; we only render, not change logic) */}
        {tip && (
          <g>
            <line x1={tip.x} y1={padT} x2={tip.x} y2={h-padB} stroke="#d1d5db" strokeDasharray="3 3"/>
            <circle cx={tip.x} cy={tip.y} r={3} fill="#16a34a" />
            <foreignObject
              x={Number((tip.x + 8).toFixed(1))}
              y={Math.max(padT, tip.y - 32)}
              width="160" height="44">
              <div
                style={{
                  pointerEvents:'none',
                  whiteSpace:'nowrap'
                }}
                className="rounded-md border bg-white/95 px-2 py-1 text-[11px] text-gray-700 shadow">
                <div>Date: {tip.date}</div>
                <div>Value: {CAD(tip.proj)}</div>
              </div>
            </foreignObject>
          </g>
        )}
      </svg>

      <div className="mt-3 flex items-center gap-2">
        <button onClick={onMinus} className="rounded-md border px-3 py-1 text-sm">{minusLabel}</button>
        <button onClick={onPlus} className="rounded-md border px-3 py-1 text-sm">+5</button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { session, loading } = useAuth();
  const token = session?.access_token ?? '';

  const [summary,setSummary]=useState<Summary|null>(null);

  // controls
  const [monthly,setMonthly]=useState<number>(0);
  const [rate,setRate]=useState<number>(0); // %
  const [yearsFuture,setYearsFuture]=useState<number>(10);

  useEffect(()=>{
    if(!token) return;
    (async ()=>{
      const res=await fetch('/api/summary',{headers:{authorization:`Bearer ${token}`}});
      const j=await res.json();
      if(j?.ok) setSummary({overall:j.overall ?? 0, byType:j.byType ?? {}});
    })();
  },[token]);

  // Projection starts at today's total equity (no actual series)
  const proj = useMemo(()=>{
    const start = summary?.overall ?? 0;
    const months = yearsFuture*12;
    const r = (rate/100)/12;
    const out:Pt[]=[{m:0,v:start}];
    let v = start;
    for (let i=1;i<=months;i++){
      v = Math.max(0, v*(1+r) + monthly);
      out.push({m:i, v});
    }
    return out;
  },[summary?.overall, yearsFuture, monthly, rate]);

  const parts = useMemo(()=>{
    const bt = summary?.byType ?? {};
    const palette:Record<string,string>={TFSA:'#34d399',RRSP:'#60a5fa',RESP:'#fbbf24',Margin:'#f472b6',Other:'#a78bfa',LIRA:'#f59e0b'};
    return Object.keys(bt).map(k=>({key:k,val:bt[k],color:palette[k] ?? '#9ca3af'}));
  },[summary]);

  if (loading) return <main className="max-w-6xl mx-auto p-4"><div className="rounded-xl border bg-white p-6">Loading…</div></main>;
  if (!session) return <main className="max-w-6xl mx-auto p-4"><div className="rounded-xl border bg-white p-6">Sign in to view your dashboard.</div></main>;

  return (
    <main className="max-w-6xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Chart
          startValue={summary?.overall ?? 0}
          proj={proj}
          yearsFuture={yearsFuture}
          onSetYearsFuture={setYearsFuture}
        />
        <div className="rounded-2xl border bg-white p-3 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <label className="text-sm font-medium">Monthly Contribution</label>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600 min-w-[80px] text-right">{CAD(monthly)}</span>
              <input className="w-64 h-2 rounded-lg bg-gray-200 appearance-none accent-blue-600"
                     type="range" min={0} max={10000} step={100}
                     value={monthly}
                     onChange={e=>setMonthly(Math.round(+e.target.value/100)*100)}/>
            </div>
          </div>
          <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <label className="text-sm font-medium">Annual Growth</label>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600 min-w-[80px] text-right">{rate}%</span>
              <input className="w-64 h-2 rounded-lg bg-gray-200 appearance-none accent-green-600"
                     type="range" min={0} max={100} step={1}
                     value={rate}
                     onChange={e=>setRate(+e.target.value)}/>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <Donut parts={parts} total={summary?.overall ?? 0}/>
      </div>
    </main>
  );
}
