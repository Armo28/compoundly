'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';

type Row = { id:number; institution:string; type:string; balance:number; source:'manual'|'broker' };

const TYPES = ['TFSA','RRSP','RESP','Margin','Other','LIRA'];

export default function Accounts() {
  const { session, loading } = useAuth();
  const token = session?.access_token ?? '';

  const [rows,setRows]=useState<Row[]>([]);
  const [inst,setInst]=useState('');
  const [type,setType]=useState('TFSA');
  const [balStr,setBalStr]=useState(''); // allow empty

  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState<string>('');

  async function load() {
    if(!token) return;
    const r=await fetch('/api/accounts',{headers:{authorization:`Bearer ${token}`}})
    const j=await r.json();
    if(j?.ok) setRows(j.accounts||[]);
  }

  useEffect(()=>{ load(); },[token]);

  async function add() {
    if(!inst || !type) return;
    setSaving(true);
    setMsg('');
    const body={institution:inst,type,balance: Number(balStr||0)};
    const r=await fetch('/api/accounts',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(body)});
    const j=await r.json();
    setSaving(false);
    if(!j?.ok){ setMsg(j?.error||'Error'); return; }
    setInst(''); setType('TFSA'); setBalStr('');
    load();
  }

  async function update(id:number, patch:Partial<Row>) {
    const r=await fetch(`/api/accounts/${id}`,{method:'PUT',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(patch)});
    const j=await r.json();
    if(!j?.ok){ alert(j?.error||'Error'); return; }
    load();
  }

  async function del(id:number) {
    if(!confirm('Delete this account?')) return;
    const r=await fetch(`/api/accounts/${id}`,{method:'DELETE',headers:{authorization:`Bearer ${token}`}}); 
    const j=await r.json();
    if(!j?.ok){ alert(j?.error||'Error'); return; }
    load();
  }

  if (loading) return <main className="max-w-4xl mx-auto p-4"><div className="border rounded-xl bg-white p-4">Loading…</div></main>;
  if (!session) return <main className="max-w-4xl mx-auto p-4"><div className="border rounded-xl bg-white p-4">Sign in first.</div></main>;

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="rounded-xl border bg-white p-4">
        <div className="text-sm font-medium mb-3">Add account</div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input value={inst} onChange={e=>setInst(e.target.value)} placeholder="Institution (e.g., Questrade)" className="border rounded-lg px-3 py-2"/>
          <select value={type} onChange={e=>setType(e.target.value)} className="border rounded-lg px-3 py-2">
            {TYPES.map(t=><option key={t}>{t}</option>)}
          </select>
          <input value={balStr} onChange={e=>setBalStr(e.target.value)} inputMode="decimal" placeholder="Balance (CAD)" className="border rounded-lg px-3 py-2"/>
          <button disabled={saving} onClick={add} className="rounded-lg bg-blue-600 text-white px-4 py-2 disabled:opacity-50">Save</button>
        </div>
        {msg && <p className="text-sm mt-2">{msg}</p>}
      </div>

      <div className="rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="[&>th]:text-left [&>th]:p-3 text-gray-600">
              <th>Institution</th><th>Type</th><th className="text-right">Balance</th><th></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map(r=>(
              <tr key={r.id} className="[&>td]:p-3">
                <td>
                  <input defaultValue={r.institution} disabled={r.source==='broker'} onBlur={(e)=>update(r.id,{institution:e.target.value})}
                         className={`px-2 py-1 border rounded-md w-full ${r.source==='broker'?'bg-gray-50':''}`}/>
                </td>
                <td>
                  <select defaultValue={r.type} disabled={r.source==='broker'} onChange={(e)=>update(r.id,{type:e.target.value as any})}
                          className={`px-2 py-1 border rounded-md w-full ${r.source==='broker'?'bg-gray-50':''}`}>
                    {TYPES.map(t=><option key={t}>{t}</option>)}
                  </select>
                </td>
                <td className="text-right">
                  <input defaultValue={String(r.balance)} disabled={r.source==='broker'} onBlur={(e)=>update(r.id,{balance:Number(e.target.value||0)})}
                         className={`px-2 py-1 border rounded-md w-40 text-right ${r.source==='broker'?'bg-gray-50':''}`}/>
                </td>
                <td className="text-right">
                  {r.source==='broker'
                    ? <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Synced</span>
                    : <button onClick={()=>del(r.id)} className="text-red-600 text-xs">Delete</button>}
                </td>
              </tr>
            ))}
            {rows.length===0 && <tr><td colSpan={4} className="p-4 text-gray-500">No accounts yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
