'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';

type Account = { id: string; institution: string; type: string; balance: number; source?: 'manual'|'broker' };

const TYPES = ['TFSA','RRSP','RESP','Margin','Other','LIRA'] as const;

export default function AccountsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  // add form
  const [inst,setInst]=useState('');
  const [type,setType]=useState<typeof TYPES[number]>('TFSA');
  const [bal,setBal]=useState<string>(''); // allow empty

  // list
  const [rows,setRows]=useState<Account[]>([]);
  const [loading,setLoading]=useState(false);
  const [msg,setMsg]=useState<string>('');

  async function load() {
    if (!token) return;
    setLoading(true);
    const r = await fetch('/api/accounts',{headers:{authorization:`Bearer ${token}`}});
    const j = await r.json();
    setLoading(false);
    if (j?.ok) setRows(j.accounts || []);
  }

  useEffect(()=>{ load(); /* eslint-disable-next-line */ },[token]);

  async function add() {
    try {
      if (!inst.trim() || bal.trim()==='') return;
      const body = { institution: inst.trim(), type, balance: Number(bal||0) };
      const r = await fetch('/api/accounts',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(body)});
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error||'Error');
      setInst(''); setType('TFSA'); setBal('');
      await load();
      setMsg('Saved.');
      setTimeout(()=>setMsg(''),1500);
    } catch(e:any) {
      setMsg(`Error: ${e?.message||'Save failed'}`);
    }
  }

  async function saveRow(a: Account) {
    const r = await fetch(`/api/accounts/${a.id}`,{
      method:'PATCH',
      headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
      body:JSON.stringify({ institution:a.institution, type:a.type, balance:a.balance })
    });
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.error||'Error');
  }

  async function del(id:string) {
    const r = await fetch(`/api/accounts/${id}`,{method:'DELETE',headers:{authorization:`Bearer ${token}`}});
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.error||'Error');
    await load();
  }

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="rounded-xl border bg-white p-4">
        <div className="text-sm font-medium mb-3">Add account</div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input className="border rounded-lg px-3 py-2 flex-1" placeholder="Institution (e.g., Questrade)" value={inst} onChange={e=>setInst(e.target.value)} />
          <select className="border rounded-lg px-3 py-2 w-40" value={type} onChange={e=>setType(e.target.value as any)}>
            {TYPES.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          <input className="border rounded-lg px-3 py-2 w-48" placeholder="Balance (CAD)" inputMode="decimal" value={bal} onChange={e=>setBal(e.target.value.replace(/[^\d.]/g,''))}/>
          <button onClick={add} className="rounded-lg bg-blue-600 text-white px-4">Save</button>
        </div>
        {msg && <div className="text-sm mt-2">{msg}</div>}
      </div>

      <div className="rounded-xl border bg-white">
        <div className="p-4 border-b text-sm font-medium">Institution / Type / Balance</div>
        {loading ? <div className="p-4 text-sm">Loading…</div> :
          rows.length===0 ? <div className="p-4 text-sm text-gray-500">No accounts yet.</div> :
          <ul className="divide-y">
            {rows.map((a,idx)=>(
              <li key={a.id} className="p-3 grid grid-cols-12 gap-3 items-center">
                <input
                  className="border rounded-lg px-3 py-2 col-span-5"
                  value={a.institution}
                  onChange={e=>{
                    const v=e.target.value;
                    setRows(prev=>prev.map((r,i)=>i===idx?{...r,institution:v}:r));
                  }}
                />
                <select
                  className="border rounded-lg px-3 py-2 col-span-2"
                  value={a.type}
                  onChange={e=>{
                    const v=e.target.value;
                    setRows(prev=>prev.map((r,i)=>i===idx?{...r,type:v}:r));
                  }}
                >
                  {TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
                <input
                  className="border rounded-lg px-3 py-2 col-span-3"
                  inputMode="decimal"
                  value={String(a.balance)}
                  onChange={e=>{
                    const v = e.target.value.replace(/[^\d.]/g,'');
                    setRows(prev=>prev.map((r,i)=>i===idx?{...r,balance: Number(v||0)}:r));
                  }}
                />
                <div className="col-span-2 flex gap-3 justify-end">
                  <button
                    onClick={async ()=>{ await saveRow(rows[idx]); await load(); }}
                    className="text-blue-600 hover:underline"
                  >Save</button>
                  <button onClick={()=>del(a.id)} className="text-red-600 hover:underline">Delete</button>
                </div>
              </li>
            ))}
          </ul>
        }
      </div>
    </main>
  );
}
