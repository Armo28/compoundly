'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

type Slice = { key: string; value: number; color: string };
type BrokerageRoomProgress = { tfsaDepositedThisYear: number; rrspDepositedThisYear: number };

const CURRENT_YEAR = new Date().getFullYear();

/* -------- utils -------- */
function currency(n: number) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
}
function compactCurrency(n: number) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'CAD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    const abs = Math.abs(n);
    if (abs >= 1_000_000_000) return `CA$${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
    if (abs >= 1_000_000) return `CA$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (abs >= 1_000) return `CA$${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return currency(n);
  }
}
function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad=((angleDeg-90)*Math.PI)/180;
  return { x: cx + r*Math.cos(rad), y: cy + r*Math.sin(rad) };
}
function arcPath(cx:number,cy:number,rOuter:number,rInner:number,startAngle:number,endAngle:number){
  const startOuter=polarToCartesian(cx,cy,rOuter,endAngle);
  const endOuter=polarToCartesian(cx,cy,rOuter,startAngle);
  const startInner=polarToCartesian(cx,cy,rInner,endAngle);
  const endInner=polarToCartesian(cx,cy,rInner,startAngle);
  const large=endAngle-startAngle<=180?0:1;
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${rInner} ${rInner} 0 ${large} 1 ${startInner.x} ${startInner.y}`,
    'Z',
  ].join(' ');
}

/* -------- donuts -------- */
function Donut({
  slices,total,width=360,height=220,innerRadius=58,outerRadius=90,title='Account Allocation',
}:{
  slices: Slice[]; total: number; width?: number; height?: number; innerRadius?: number; outerRadius?: number; title?: string;
}) {
  const cx = width/2, cy = height/2 + 10;
  const sum = Math.max(1, slices.reduce((a,s)=>a+(isFinite(s.value)?Math.max(0,s.value):0),0));
  let angle=0;
  const paths = slices.filter(s=>s.value>0).map(s=>{
    const frac=s.value/sum; const sweep=frac*360; const start=angle; const end=angle+sweep; angle=end;
    return { key:s.key, d: arcPath(cx,cy,outerRadius,innerRadius,start,end), color:s.color };
  });
  return (
    <div className="rounded-2xl border p-4 shadow-sm bg-white overflow-visible">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium">{title}</div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-700">
          {slices.filter(s=>s.value>0).map(s=>(
            <span key={s.key} className="inline-flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full" style={{ background: s.color }} />
              {s.key}
            </span>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56 overflow-visible">
        {paths.map(p=><path key={p.key} d={p.d} fill={p.color} opacity={0.95} />)}
        <circle cx={cx} cy={cy} r={innerRadius-1} fill="#fff" />
        <text x={cx} y={cy-6} textAnchor="middle" fontSize="12" fill="#6b7280">Total</text>
        <text x={cx} y={cy+14} textAnchor="middle" fontSize="16" className="font-semibold" fill="#111827">{currency(total)}</text>
      </svg>
    </div>
  );
}

function DonutProgress({
  percent,color='#2563eb',bg='#e5e7eb',width=144,height=112,innerRadius=26,outerRadius=38,caption='room filled',
}:{
  percent:number;color?:string;bg?:string;width?:number;height?:number;innerRadius?:number;outerRadius?:number;caption?:string;
}) {
  const cx=width/2, cy=height/2; const p=clamp(percent,0,100); const sweep=(p/100)*360;
  const ringBg=arcPath(cx,cy,outerRadius,innerRadius,0,359.999); const ringFg=p>0?arcPath(cx,cy,outerRadius,innerRadius,0,sweep):'';
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="block overflow-visible" aria-label={`${caption} ${p}%`}>
      <path d={ringBg} fill={bg} />
      {ringFg && <path d={ringFg} fill={color} />}
      <circle cx={cx} cy={cy} r={innerRadius-1} fill="#fff" />
      <text x={cx} y={cy-4} textAnchor="middle" fontSize="14" className="font-semibold" fill="#111827">{Math.round(p)}%</text>
      <text x={cx} y={cy+12} textAnchor="middle" fontSize="9.5" fill="#6b7280">{caption}</text>
    </svg>
  );
}

/* -------- chart (single dashed projection) -------- */
function ProjectionChart({
  actual, projected, years=10, annualPct,
}:{
  actual:{month:number;value:number}[];
  projected:{month:number;value:number}[];
  years?:number;
  annualPct:number;
}) {
  const paddingLeft=84,paddingRight=16,paddingTop=16,paddingBottom=44;
  const width=840, height=320;

  const [hoverX,setHoverX]=useState<number|null>(null);
  const [hoverY,setHoverY]=useState<number|null>(null);
  const [hoverValue,setHoverValue]=useState<number|null>(null);

  const allPts=[...actual,...projected];
  const minX=Math.min(...allPts.map(p=>p.month),-12);
  const maxX=Math.max(...allPts.map(p=>p.month),years*12);
  const minY=Math.min(...allPts.map(p=>p.value),0);
  const maxY=Math.max(...allPts.map(p=>p.value),1);

  const innerW=width-paddingLeft-paddingRight;
  const innerH=height-paddingTop-paddingBottom;

  const scaleX=(m:number)=>paddingLeft+(m-minX)*(innerW/(maxX-minX||1));
  const scaleY=(v:number)=>paddingTop+(maxY-v)*(innerH/(maxY-minY||1));

  const linePath=(pts:{month:number;value:number}[]) =>
    pts.length ? pts.map((p,i)=>`${i?'L':'M'} ${scaleX(p.month).toFixed(1)} ${scaleY(p.value).toFixed(1)}`).join(' ') : '';

  const areaPath=(pts:{month:number;value:number}[])=>{
    if(!pts.length) return '';
    const baselineY=scaleY(minY);
    const first=pts[0], last=pts[pts.length-1];
    const line=linePath(pts);
    return `${line} L ${scaleX(last.month).toFixed(1)} ${baselineY.toFixed(1)} L ${scaleX(first.month).toFixed(1)} ${baselineY.toFixed(1)} Z`;
  };

  const actualLine=linePath(actual);
  const actualArea=areaPath(actual);
  const projLine=linePath(projected);

  const svgRef=useRef<SVGSVGElement|null>(null);
  const clientToSvg=(evt:React.MouseEvent<SVGSVGElement>)=>{
    const svg=svgRef.current; if(!svg) return {x:0,y:0};
    const pt=svg.createSVGPoint(); pt.x=evt.clientX; pt.y=evt.clientY;
    const ctm=svg.getScreenCTM(); if(!ctm) return {x:0,y:0};
    const p=pt.matrixTransform(ctm.inverse()); return {x:p.x,y:p.y};
  };
  const unscaleValue=(y:number)=>maxY-((y-paddingTop)/(innerH||1))*(maxY-minY);

  const onMouseMove=(e:React.MouseEvent<SVGSVGElement>)=>{
    const {x,y}=clientToSvg(e);
    const xC=clamp(x,paddingLeft,width-paddingRight);
    const yC=clamp(y,paddingTop,height-paddingBottom);
    setHoverX(xC); setHoverY(yC); setHoverValue(unscaleValue(yC));
  };
  const onMouseLeave=()=>{ setHoverX(null); setHoverY(null); setHoverValue(null); };

  const tipX=hoverX??0, tipY=hoverY??0;
  const tipLabel=hoverValue!=null?currency(hoverValue):'';
  const boxW=Math.max(90, tipLabel.length*9.5), boxH=26;
  const boxX=clamp(tipX+10, paddingLeft, width-paddingRight-boxW);
  const boxY=clamp(tipY-boxH-8, paddingTop, height-paddingBottom-boxH);

  const xMajors:{x:number;label:string}[]=[]; const xMinors:number[]=[];
  { const startYearIndex=Math.ceil(minX/12); const endYearIndex=Math.floor(maxX/12);
    for(let y=startYearIndex;y<=endYearIndex;y++){
      const xPos=scaleX(y*12);
      if(y%2===0) xMajors.push({x:xPos,label:String(CURRENT_YEAR+y)}); else xMinors.push(xPos);
    }
  }
  const yTicks:{y:number;label:string}[]=(()=>{ const out:{y:number;label:string}[]=[]; const count=4;
    for(let i=0;i<=count;i++){ const v=minY+(i*(maxY-minY))/count; out.push({y:scaleY(v),label:compactCurrency(v)}); }
    return out;
  })();

  return (
    <div className="rounded-2xl border p-4 shadow-sm bg-white">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
        <div className="text-sm font-medium">Portfolio Value (Actual &amp; Projected)</div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-700">
          <span className="inline-flex items-center gap-2">
            <svg width="18" height="8" viewBox="0 0 18 8" aria-hidden="true"><line x1="0" y1="4" x2="18" y2="4" stroke="#111827" strokeWidth="3"/></svg>
            Actual (area filled)
          </span>
          <span className="inline-flex items-center gap-2">
            <svg width="44" height="8" viewBox="0 0 44 8" aria-hidden="true">
              <line x1="0" y1="4" x2="44" y2="4" stroke="#22c55e" strokeWidth="3" strokeDasharray="6 6" />
            </svg>
            Projection @ <span className="font-medium">{annualPct}%</span>
          </span>
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        role="img"
        aria-label="Portfolio chart"
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        preserveAspectRatio="xMidYMid meet"
      >
        <line x1={paddingLeft} y1={height-paddingBottom} x2={width-paddingRight} y2={height-paddingBottom} stroke="#e5e7eb" />
        <line x1={paddingLeft} y1={paddingTop} x2={paddingLeft} y2={height-paddingBottom} stroke="#e5e7eb" />

        {yTicks.map((t,i)=>(
          <g key={`y-${i}`}>
            <line x1={paddingLeft} y1={t.y} x2={width-paddingRight} y2={t.y} stroke="#f3f4f6" />
            <text x={paddingLeft-10} y={t.y+4} fontSize="10" textAnchor="end" fill="#6b7280">{t.label}</text>
          </g>
        ))}

        {xMinors.map((x,i)=>(<g key={`x-minor-${i}`}><line x1={x} y1={height-paddingBottom} x2={x} y2={height-paddingBottom+6} stroke="#d1d5db" /></g>))}
        {xMajors.map((t,i)=>(
          <g key={`x-major-${i}`}>
            <line x1={t.x} y1={height-paddingBottom} x2={t.x} y2={height-paddingBottom+8} stroke="#9ca3af" />
            <text x={t.x} y={height-paddingBottom+18} fontSize="10" textAnchor="middle" fill="#6b7280">{t.label}</text>
          </g>
        ))}

        {actualArea && <path d={actualArea} fill="#11182714" stroke="none" />}
        {actualLine && <path d={actualLine} fill="none" stroke="#111827" strokeWidth={2.3} />}

        {projLine && <path d={projLine} fill="none" stroke="#22c55e" strokeOpacity={1} strokeWidth={2.6} strokeDasharray="6 6" />}

        <text x={width/2} y={height-8} fontSize="10" textAnchor="middle" fill="#6b7280">Calendar Year</text>
        <text x={-54} y={height/2} transform={`rotate(-90, -54, ${height/2})`} fontSize="10" textAnchor="middle" fill="#6b7280">Portfolio value (CAD)</text>

        {hoverX!=null && hoverY!=null && hoverValue!=null && (
          <>
            <line x1={hoverX} y1={paddingTop} x2={hoverX} y2={height-paddingBottom} stroke="#9ca3af" strokeDasharray="4 4" />
            <circle cx={hoverX} cy={hoverY} r={3.5} fill="#22c55e" stroke="#fff" strokeWidth={1.5} />
            <g>
              <rect x={boxX} y={boxY} width={boxW} height={boxH} rx={6} ry={6} fill="#ffffff" stroke="#d1d5db" />
              <text x={boxX+8} y={boxY+17} fontSize="12" fill="#111827">{tipLabel}</text>
            </g>
          </>
        )}
      </svg>
    </div>
  );
}

/* -------- demo series -------- */
function makeActualSeries(endValue:number, monthsBack=36){
  let val=endValue*0.45; const driftAnnual=0.06, volMonthly=0.05, contribGuess=600; let seed=12345;
  const rand=()=> (seed=(seed*1664525+1013904223)%4294967296)/4294967296;
  const pts:{month:number;value:number}[]=[];
  for(let m=-monthsBack;m<=0;m++){
    if(m>-monthsBack){ const r=driftAnnual/12+(rand()-0.5)*2*volMonthly; val=Math.max(0,val*(1+r)+contribGuess); }
    pts.push({month:m,value:val});
  }
  const finalVal=pts[pts.length-1]?.value||1; const scale=finalVal>0?endValue/finalVal:1;
  return pts.map(p=>({month:p.month,value:p.value*scale}));
}
function projectFrom(startValue:number, years=10, annualReturn=0.06, monthlyContrib=600){
  const months=years*12, r=annualReturn/12; const out:{month:number;value:number}[]=[{month:0,value:startValue}]; let v=startValue;
  for(let m=1;m<=months;m++){ v=Math.max(0,v*(1+r)+monthlyContrib); out.push({month:m,value:v}); }
  return out;
}

function Card({ title,value,subtitle }:{ title:string; value:string; subtitle?:string }) {
  return (
    <div className="rounded-2xl border p-4 shadow-sm bg-white">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {subtitle && <div className="text-xs text-gray-400 mt-1">{subtitle}</div>}
    </div>
  );
}

function useBrokerageRoomProgress(): BrokerageRoomProgress | null {
  const [data,setData]=useState<BrokerageRoomProgress|null>(null);
  useEffect(()=>{ let mounted=true;
    async function fetchProgress(){ try{
      const baseTfsa=2200; const baseRrsp=7400; const jitter=Math.floor((Date.now()/30000)%50)*10;
      if(mounted){ setData({ tfsaDepositedThisYear: baseTfsa + jitter, rrspDepositedThisYear: baseRrsp + jitter }); }
    }catch{ if(mounted) setData(null); } }
    fetchProgress(); const id=setInterval(fetchProgress,30000);
    return ()=>{ mounted=false; clearInterval(id); };
  },[]);
  return data;
}

/* -------- page -------- */
export default function Home() {
  const { session, loading } = useAuth();

  // Thin sliders (global)
  const sliderCss = (
    <style jsx global>{`
      input[type="range"].thin {
        appearance: none;
        width: 100%;
        background: transparent;
        padding: 0;
        height: 16px;
      }
      input[type="range"].thin:focus { outline: none; }
      input[type="range"].thin::-webkit-slider-runnable-track {
        height: 4px;
        background: #e5e7eb;
        border-radius: 9999px;
      }
      input[type="range"].thin::-webkit-slider-thumb {
        appearance: none;
        margin-top: -6px;
        width: 16px;
        height: 16px;
        border-radius: 9999px;
        background: #2563eb;
        border: 2px solid white;
        box-shadow: 0 0 0 1px #d1d5db;
      }
      input[type="range"].thin::-moz-range-track {
        height: 4px;
        background: #e5e7eb;
        border: none;
        border-radius: 9999px;
      }
      input[type="range"].thin::-moz-range-thumb {
        width: 16px;
        height: 16px;
        border: 2px solid white;
        border-radius: 9999px;
        background: #2563eb;
        box-shadow: 0 0 0 1px #d1d5db;
      }
    `}</style>
  );

  if (loading) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        {sliderCss}
        <div className="rounded-2xl border bg-white p-6 shadow-sm">Loading…</div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        {sliderCss}
        <div className="rounded-2xl border bg-white p-8 shadow-sm text-center">
          <h2 className="text-xl font-semibold mb-2">Welcome to Compoundly</h2>
          <p className="text-gray-600 mb-4">Please sign in to view your portfolio and projections.</p>
          <Link href="/login" className="inline-block rounded-lg bg-blue-600 text-white px-4 py-2">Sign in</Link>
        </div>
      </main>
    );
  }

  const totalForDonut=65000;

  // ~3 years of actuals
  const monthsBackActual = 36;
  const firstActualYear = CURRENT_YEAR - Math.floor(monthsBackActual/12);

  // controls (defaults requested)
  const [monthly,setMonthly]=useState<number>(1000);  // default $1000
  const [annualPct,setAnnualPct]=useState<number>(10); // default 10%

  // Years into future that the user can view:
  // cap = first actual year + 30
  const maxEndYear = firstActualYear + 30;
  const maxFutureYears = Math.max(0, maxEndYear - CURRENT_YEAR);

  // minimum future window = 10 years (but if cap < 10, use the cap)
  const minYearsFuture = Math.min(10, maxFutureYears || 10);

  // start at 10 (or cap if smaller)
  const [yearsFuture,setYearsFuture]=useState<number>(Math.min(10, maxFutureYears || 10));

  // clamp the chosen value within [minYearsFuture, maxFutureYears]
  const clampedYearsFuture = clamp(
    yearsFuture,
    Math.min(minYearsFuture, maxFutureYears || minYearsFuture),
    maxFutureYears || minYearsFuture
  );

  // series
  const actualSeries=useMemo(()=>makeActualSeries(totalForDonut, monthsBackActual),[totalForDonut]);
  const lastActual=actualSeries[actualSeries.length-1]?.value??totalForDonut;
  const projected=useMemo(
    ()=>projectFrom(lastActual, clampedYearsFuture, annualPct/100, monthly),
    [lastActual, monthly, annualPct, clampedYearsFuture]
  );

  const alloc={ TFSA: totalForDonut*0.66, RRSP: totalForDonut*0.34, LIRA: 0, MARGIN: 0, OTHER: 0, overall: totalForDonut };

  const [tfsaRoom,setTfsaRoom]=useState<number>(6500);
  const [rrspRoom,setRrspRoom]=useState<number>(18000);
  const brokerage=useBrokerageRoomProgress();
  const tfsaPercent=useMemo(()=>{ const dep=brokerage?.tfsaDepositedThisYear??0; return tfsaRoom>0?clamp((dep/tfsaRoom)*100,0,100):0; },[brokerage?.tfsaDepositedThisYear,tfsaRoom]);
  const rrspPercent=useMemo(()=>{ const dep=brokerage?.rrspDepositedThisYear??0; return rrspRoom>0?clamp((dep/rrspRoom)*100,0,100):0; },[brokerage?.rrspDepositedThisYear,rrspRoom]);
  const DONUT_W=144, DONUT_H=112;

  const canPlus = clampedYearsFuture < Math.max(minYearsFuture, maxFutureYears);
  const canMinus = clampedYearsFuture > minYearsFuture;

  const onAddFiveYears = () => setYearsFuture(prev => Math.min(prev + 5, Math.max(minYearsFuture, maxFutureYears)));
  const onMinusFiveYears = () => setYearsFuture(prev => Math.max(prev - 5, minYearsFuture));

  return (
    <main className="max-w-6xl mx-auto p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
      {sliderCss}

      <div className="lg:col-span-2 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="text-sm text-gray-600">
            Showing <span className="font-medium">{clampedYearsFuture}y</span> into the future
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onMinusFiveYears}
              disabled={!canMinus}
              className="rounded-lg bg-gray-200 text-gray-900 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              – 5 years
            </button>
            <button
              onClick={onAddFiveYears}
              disabled={!canPlus}
              className="rounded-lg bg-gray-900 text-white px-3 py-1.5 text-sm disabled:opacity-40"
            >
              + 5 years
            </button>
          </div>
        </div>

        <ProjectionChart
          actual={actualSeries}
          projected={projected}
          years={clampedYearsFuture}
          annualPct={annualPct}
        />

        {/* Monthly contribution (thin slider) */}
        <div className="rounded-2xl border p-4 shadow-sm bg-white">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <label className="text-sm font-medium">Monthly Contribution</label>
            <div className="text-sm text-gray-600">{currency(monthly)}</div>
          </div>
          <input
            type="range"
            min={0}
            max={10000}
            step={100}
            value={monthly}
            onChange={(e)=>setMonthly(Math.round(+e.target.value/100)*100)}
            className="thin mt-2"
            aria-label="Monthly contribution slider"
          />
          <div className="flex justify-between text-xs text-gray-400"><span>$0</span><span>$10,000</span></div>
        </div>

        {/* Annual return (thin slider) */}
        <div className="rounded-2xl border p-4 shadow-sm bg-white">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <label className="text-sm font-medium">Assumed Annual Return</label>
            <div className="text-sm text-gray-600">{annualPct}%</div>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={0.5}
            value={annualPct}
            onChange={(e)=>setAnnualPct(Math.max(0, Math.min(100, +e.target.value)))}
            className="thin mt-2"
            aria-label="Annual return slider"
          />
          <div className="flex justify-between text-xs text-gray-400"><span>0%</span><span>100%</span></div>
        </div>

        {/* Contribution room */}
        <div className="rounded-2xl border p-4 shadow-sm bg-white">
          <div className="text-sm font-medium mb-3">Contribution Room — {CURRENT_YEAR}</div>
          <div className="space-y-8">
            <div className="flex items-center justify-start gap-4">
              <div className="flex flex-col">
                <label className="text-sm mb-2">TFSA room available for {CURRENT_YEAR}</label>
                <div className="flex items-center gap-4">
                  <AutoWidthNumberInput value={tfsaRoom} onChange={setTfsaRoom} aria-label="TFSA room" title="TFSA room for the current year" inputClassName="bg-white" />
                  <div className="shrink-0" style={{width:DONUT_W,height:DONUT_H,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <DonutProgress percent={tfsaPercent} color="#34d399" bg="#e8f7f0" width={DONUT_W} height={DONUT_H} caption="room filled" />
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-2">Deposited so far: {currency(brokerage?.tfsaDepositedThisYear ?? 0)}</div>
              </div>
            </div>
            <div className="flex items-center justify-start gap-4">
              <div className="flex flex-col">
                <label className="text-sm mb-2">RRSP room available for {CURRENT_YEAR}</label>
                <div className="flex items-center gap-4">
                  <AutoWidthNumberInput value={rrspRoom} onChange={setRrspRoom} aria-label="RRSP room" title="RRSP room for the current year" inputClassName="bg-white" />
                  <div className="shrink-0" style={{width:DONUT_W,height:DONUT_H,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <DonutProgress percent={rrspPercent} color="#60a5fa" bg="#e8f0fe" width={DONUT_W} height={DONUT_H} caption="room filled" />
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-2">Deposited so far: {currency(brokerage?.rrspDepositedThisYear ?? 0)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right column */}
      <div className="space-y-4">
        <Donut slices={[
          { key:'TFSA',  value: alloc.TFSA, color:'#34d399' },
          { key:'RRSP',  value: alloc.RRSP, color:'#60a5fa' },
        ]} total={alloc.overall} />
        <div className="grid grid-cols-2 gap-3">
          <Card title="TFSA" value={currency(alloc.TFSA)} />
          <Card title="RRSP" value={currency(alloc.RRSP)} />
          <div className="rounded-2xl border p-4 bg-white text-sm text-gray-500 flex items-center justify-center">+ Add Account</div>
          <Card title="Margin" value={currency(0)} />
        </div>
        <Card title="Total Invested" value={currency(alloc.overall)} subtitle="All accounts (demo data)" />
      </div>
    </main>
  );
}

/* -------- input helper -------- */
function AutoWidthNumberInput({
  value,onChange,minPx=96,maxPx=360,className='',inputClassName='',title,'aria-label':ariaLabel,
}:{
  value:number; onChange:(n:number)=>void; minPx?:number; maxPx?:number; className?:string; inputClassName?:string; title?:string; 'aria-label'?:string;
}) {
  const inputRef=useRef<HTMLInputElement|null>(null); const [widthPx,setWidthPx]=useState<number>(minPx);
  useEffect(()=>{ const el=inputRef.current; if(!el) return;
    const cs=window.getComputedStyle(el);
    const font=`${cs.fontStyle} ${cs.fontVariant} ${cs.fontWeight} ${cs.fontSize} / ${cs.lineHeight} ${cs.fontFamily}`;
    const canvas=document.createElement('canvas'); const ctx=canvas.getContext('2d'); if(!ctx) return; ctx.font=font;
    const txt=String(value||''); const m=ctx.measureText(txt);
    const padLeft=parseFloat(cs.paddingLeft)||0; const padRight=parseFloat(cs.paddingRight)||0;
    const borderLeft=parseFloat(cs.borderLeftWidth)||0; const borderRight=parseFloat(cs.borderRightWidth)||0;
    const target=m.width*1.1+padLeft+padRight+borderLeft+borderRight;
    setWidthPx(clamp(Math.round(target),minPx,maxPx));
  },[value]);
  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="number"
        value={value}
        aria-label={ariaLabel}
        title={title}
        onChange={(e)=>onChange(Math.max(0,+e.target.value))}
        className={"border rounded-lg h-12 px-3 text-base leading-none focus:outline-none focus:ring-2 focus:ring-blue-500 "+inputClassName}
        style={{ width: `${widthPx}px` }}
      />
    </div>
  );
}
