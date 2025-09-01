'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useAuth } from '@/lib/auth';

const money = (n:number)=>new Intl.NumberFormat(undefined,{style:'currency',currency:'CAD',maximumFractionDigits:0}).format(n);
const compact = (n:number)=>new Intl.NumberFormat(undefined,{notation:'compact',maximumFractionDigits:1}).format(n);

// ===== Types =====
type HistoryPt = { taken_on: string; total: number };
type Summary = { byType: Record<string, number>; overall: number; history: HistoryPt[] };

// ===== Donut (unchanged except CAD in center) =====
function Donut({ parts, total }:{parts:{key:string,val:number,color:string}[], total:number}) {
  const size=220, cx=size/2, cy=size/2, rO=90, rI=58;
  const sum=parts.reduce((a,p)=>a+p.val,0)||1;
  let a0=0;
  const arcs=parts.map(p=>{
    const frac=p.val/sum, sweep=frac*Math.PI*2, a1=a0+sweep;
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
        <text x={cx} y={cy+14} textAnchor="middle" fontSize="16" className="font-semibold" fill="#111827">
          {money(total)}
        </text>
      </svg>
    </div>
  );
}

// ===== Small helpers for the chart =====
type Pt = { m:number; v:number };

function lerp(a:number,b:number,t:number){ return a + (b-a)*t; }
function lerpSeries(pts:Pt[], m:number){
  if(!pts.length) return 0;
  if(m<=pts[0].m) return pts[0].v;
  if(m>=pts[pts.length-1].m) return pts[pts.length-1].v;
  // find segment
  let lo=0, hi=pts.length-1;
  while(hi-lo>1){
    const mid=(lo+hi>>1);
    if(pts[mid].m<=m) lo=mid; else hi=mid;
  }
  const p=pts[lo], q=pts[hi];
  const t=(m-p.m)/Math.max(1e-9,q.m-p.m);
  return lerp(p.v,q.v,t);
}

// ===== Chart =====
function Chart({
  actual, proj, yearsFuture, onSetYearsFuture
}:{
  actual:Pt[];
  proj:Pt[];
  yearsFuture:number;
  onSetYearsFuture:(n:number)=>void;
}) {
  const padL=56,padR=16,padT=24,padB=50, w=860,h=340;
  const all=[...actual,...proj];

  // X domain in months
  const minX=Math.min(0, ...all.map(p=>p.m));
  const maxX=Math.max(yearsFuture*12, ...all.map(p=>p.m));

  // Y domain with special handling for “flat” case
  const latest = (actual.at(-1)?.v ?? 0);
  const projOnly = proj.length>1 && proj.every((p,i)=>p.v===proj[0].v || i===0);
  const isFlat = proj.length>1 && Math.abs(proj[0].v - proj.at(-1)!.v) < 1e-6;

  let minY = 0;
  let maxY = Math.max(1, ...all.map(p=>p.v));
  // If completely flat (e.g., monthly=0 & growth=0), center it with margins
  if (isFlat) {
    const base = latest || proj[0].v || 0;
    const pad = Math.max(1000, base*0.25); // ~±25% padding, min $1k so it’s visible
    minY = Math.max(0, base - pad);
    maxY = base + pad;
  }

  const innerW=w-padL-padR, innerH=h-padT-padB;
  const sx=(m:number)=>padL + (m-minX)*(innerW/Math.max(1e-9, (maxX-minX)));
  const sy=(v:number)=>padT + (maxY-v)*(innerH/Math.max(1e-9, (maxY-minY)));

  const line=(pts:Pt[])=>pts.map((p,i)=>`${i?'L':'M'} ${sx(p.m).toFixed(3)} ${sy(p.v).toFixed(3)}`).join(' ');
  const area=(pts:Pt[])=>{
    if(pts.length<2) return ''; // avoid single-point vertical strip
    const first=pts[0], last=pts[pts.length-1];
    return `${line(pts)} L ${sx(last.m)} ${sy(minY)} L ${sx(first.m)} ${sy(minY)} Z`;
  };

  // Y ticks (compact, no “CA”)
  const ticksY=5;
  const yTicks=new Array(ticksY+1).fill(0).map((_,i)=>minY+(i*(maxY-minY))/ticksY);

  // X ticks: monthly when <= 24 months visible; yearly otherwise
  const monthsVisible = (maxX - minX);
  const monthlyTicks = monthsVisible <= 24;
  const xTicks:number[]=[];
  if(monthlyTicks){
    for(let m=Math.ceil(minX); m<=Math.floor(maxX); m+=1) xTicks.push(m);
  }else{
    const startY=Math.ceil(minX/12), endY=Math.floor(maxX/12);
    for(let y=startY; y<=endY; y++) xTicks.push(y*12);
  }

  // Hover tracking anywhere on the canvas (interpolated tooltip)
  const [hoverM, setHoverM] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement|null>(null);
  const onMove=(e:React.MouseEvent)=>{
    const box = svgRef.current?.getBoundingClientRect();
    if(!box) return;
    const x = e.clientX - box.left;
    const m = minX + (x - padL) * (maxX-minX) / Math.max(1e-9, innerW);
    setHoverM(Math.min(maxX, Math.max(minX, m)));
  };
  const onLeave=()=>setHoverM(null);

  const hoverVals = useMemo(()=>{
    if(hoverM==null) return null;
    return {
      m: hoverM,
      a: lerpSeries(actual, hoverM),
      p: lerpSeries(proj, hoverM),
      date: (() => {
        const now = new Date();
        const d = new Date(now.getFullYear(), now.getMonth()+Math.round(hoverM), 1);
        return d.toLocaleString(undefined,{month:'short', year:'numeric'});
      })()
    };
  },[hoverM, actual, proj]);

  // Controls
  const dec = yearsFuture>10 ? 5 : 1;
  const minusLabel = yearsFuture>10 ? '-5' : '-1';
  const onMinus=()=>onSetYearsFuture(Math.max(1, yearsFuture-dec));
  const onPlus =()=>onSetYearsFuture(Math.min(40, yearsFuture+5));

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">Portfolio Value (Actual &amp; Projected)</div>
        <div className="flex items-center gap-4 text-xs text-gray-700">
          <span className="inline-flex items-center gap-2">
            <svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#111827" strokeWidth="3"/></svg>
            Actual (area filled)
          </span>
          <span className="inline-flex items-center gap-2">
            <svg width="44" height="8"><line x1="0" y1="4" x2="44" y2="4" stroke="#22c55e" strokeWidth="3" strokeDasharray="6 6"/></svg>
            Projection
          </span>
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-80"
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        {/* axes */}
        <line x1={padL} y1={h-padB} x2={w-padR} y2={h-padB} stroke="#e5e7eb"/>
        <line x1={padL} y1={padT} x2={padL} y2={h-padB} stroke="#e5e7eb"/>

        {/* y grid + labels */}
        {yTicks.map((v,i)=>(
          <g key={`y-${i}`}>
            <line x1={padL} y1={sy(v)} x2={w-padR} y2={sy(v)} stroke="#f3f4f6"/>
            <text x={padL-8} y={sy(v)+3} fontSize="10" textAnchor="end" fill="#6b7280">
              {/* no "CA" prefix, just $ */}
              {'$'+compact(v)}
            </text>
          </g>
        ))}

        {/* x ticks */}
        {xTicks.map((m,i)=>(
          <g key={`x-${i}`}>
            <line x1={sx(m)} y1={h-padB} x2={sx(m)} y2={h-padB+6} stroke="#d1d5db"/>
            <text x={sx(m)} y={h-padB+18} fontSize="10" textAnchor="middle" fill="#6b7280">
              { monthlyTicks
                ? new Date(new Date().getFullYear(), new Date().getMonth()+m).toLocaleString(undefined,{month:'short'})
                : (new Date().getFullYear() + Math.round(m/12)) }
            </text>
          </g>
        ))}

        {/* Fills + lines */}
        {/* Actual area (only if we have at least 2 points; avoids phantom vertical strip) */}
        {actual.length>=2 && <path d={area(actual)} fill="#11182714" />}
        {/* Actual line or single dot */}
        {actual.length>=2
          ? <path d={line(actual)} fill="none" stroke="#111827" strokeWidth={2.5}/>
          : actual.length===1
            ? <circle cx={sx(actual[0].m)} cy={sy(actual[0].v)} r={3} fill="#111827"/>
            : null}

        {/* Projection gradient fill + dashed line */}
        <defs>
          <linearGradient id="projFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.25"/>
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.05"/>
          </linearGradient>
        </defs>
        <path d={area(proj)} fill="url(#projFill)" />
        <path d={line(proj)} fill="none" stroke="#22c55e" strokeWidth={2.5} strokeDasharray="6 6"/>

        {/* Hover guide (tracks anywhere on the canvas) */}
        {hoverVals && (
          <>
            <line x1={sx(hoverVals.m)} y1={padT} x2={sx(hoverVals.m)} y2={h-padB} stroke="#e5e7eb" />
            <circle cx={sx(hoverVals.m)} cy={sy(hoverVals.a)} r={4} fill="#111827" />
            <circle cx={sx(hoverVals.m)} cy={sy(hoverVals.p)} r={4} fill="#22c55e" />
          </>
        )}
      </svg>

      {/* Tooltip readout below the chart (always shows when hovering) */}
      <div className="mt-2 text-sm text-gray-700">
        {hoverVals
          ? (
            <div className="flex items-center gap-6">
              <div><span className="font-medium">Date:</span> {hoverVals.date}</div>
              <div><span className="font-medium">Actual:</span> {money(hoverVals.a)}</div>
              <div><span className="font-medium">Projection:</span> {money(hoverVals.p)}</div>
            </div>
          )
          : (
            <div className="text-gray-500">Hover anywhere on the chart to see values.</div>
          )
        }
      </div>

      {/* Zoom controls */}
      <div className="mt-3 flex items-center gap-2">
        <button onClick={()=>onSetYearsFuture(Math.max(1, yearsFuture-dec))} className="rounded-md border px-3 py-1 text-sm">
          {minusLabel}
        </button>
        <button onClick={()=>onSetYearsFuture(Math.min(40, yearsFuture+5))} className="rounded-md border px-3 py-1 text-sm">
          +5
        </button>
      </div>
    </div>
  );
}

// ===== Dashboard page =====
export default function Dashboard() {
  const { session, loading } = useAuth();
  const [summary,setSummary]=useState<Summary|null>(null);

  const [monthly,setMonthly]=useState<number>(0);
  const [rate,setRate]=useState<number>(0); // %
  const [yearsFuture,setYearsFuture]=useState<number>(10);

  const token = session?.access_token ?? '';

  useEffect(()=>{
    if(!token) return;
    (async ()=>{
      const res=await fetch('/api/summary',{headers:{authorization:`Bearer ${token}`}});
      const j=await res.json();
      if(j?.ok) setSummary(j);
    })();
  },[token]);

  // Actual series from snapshots (m = months from now <= 0)
  const actual = useMemo(()=>{
    if(!summary?.history?.length){
      return [{m:0,v:summary?.overall ?? 0}];
    }
    const pts = summary.history.map(h=>{
      const d = new Date(h.taken_on);
      const now = new Date();
      const months = (d.getFullYear()-now.getFullYear())*12 + (d.getMonth()-now.getMonth());
      return { m: months, v: Number(h.total||0) };
    }).filter(p=>p.m<=0).sort((a,b)=>a.m-b.m);
    if (pts.length===0 || pts.at(-1)!.m<0) pts.push({m:0,v:summary?.overall ?? 0});
    return pts;
  },[summary]);

  // Projection (start at today’s actual)
  const proj = useMemo(()=>{
    const start = actual.at(-1)?.v ?? 0;
    const months = yearsFuture*12;
    const r = (rate/100)/12;
    const out:Pt[]=[{m:0,v:start}];
    let v = start;
    for (let i=1;i<=months;i++){
      v = Math.max(0, v*(1+r) + monthly);
      out.push({m:i, v});
    }
    return out;
  },[actual, yearsFuture, monthly, rate]);

  // Donut parts
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
        <Chart actual={actual} proj={proj} yearsFuture={yearsFuture} onSetYearsFuture={setYearsFuture}/>
        <div className="rounded-2xl border bg-white p-3 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <label className="text-sm font-medium">Monthly Contribution</label>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600 min-w-[80px] text-right">{money(monthly)}</span>
              <input className="w-64 h-2 rounded-lg bg-gray-200 appearance-none accent-blue-600" type="range" min={0} max={10000} step={100} value={monthly} onChange={e=>setMonthly(Math.round(+e.target.value/100)*100)}/>
            </div>
          </div>
          <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <label className="text-sm font-medium">Annual Growth</label>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600 min-w-[80px] text-right">{rate}%</span>
              <input className="w-64 h-2 rounded-lg bg-gray-200 appearance-none accent-green-600" type="range" min={0} max={100} step={1} value={rate} onChange={e=>setRate(+e.target.value)}/>
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
