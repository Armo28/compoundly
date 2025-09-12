'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';

type Account = {
  id:string;
  name:string;
  type:'TFSA'|'RRSP'|'RESP'|'Margin'|'Other'|'LIRA';
  balance:number|null;
  created_at?:string;
};

type RowState = {
  balanceStr:string;
  dirty:boolean;
  saving:boolean;
  _saved_balanceStr:string;
};

const TYPES = ['TFSA','RRSP','RESP','Margin','Other','LIRA'] as const;

export default function AccountsPage(){
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  const headers = useMemo(()=>{
    const h=new Headers(); if(token) h.set('authorization',`Bearer ${token}`); return h as HeadersInit;
  },[token]);
  const jsonHeaders = useMemo(()=>{
    const h=new Headers(); if(token) h.set('authorization',`Bearer ${token}`); h.set('content-type','application/json'); return h as HeadersInit;
  },[token]);

  const [items,setItems]=useState<Account[]>([]);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState<string|null>(null);
  const [row,setRow]=useState<Record<string,RowState>>({});

  const num=(s:string)=>{ const n=Number((s??'').replace(/,/g,'').trim()); return Number.isFinite(n)?n:0; };
  const asStr=(n:number|null|undefined)=> n==null?'':String(n);

  useEffect(()=>{ if(!token){setLoading(false);return;} (async()=>{
    setLoading(true); setErr(null);
    try{
      const r=await fetch('/api/accounts',{headers}); const j=await r.json();
      if(!j?.ok) throw new Error(j?.error??'Failed to load accounts');
      const list:Account[] = Array.isArray(j.items)? j.items : [];
      setItems(list);
      setRow(prev=>{
        const next:{[k:string]:RowState}={...prev};
        for(const a of list){
          const saved = asStr(a.balance);
          const existing = prev[a.id];
          if(!existing || (!existing.dirty && !existing.saving)){
            next[a.id]={ balanceStr:saved, dirty:false, saving:false, _saved_balanceStr:saved };
          }
        }
        for(const id of Object.keys(next)) if(!list.find(x=>x.id===id)) delete next[id];
        return next;
      });
    }catch(e:any){ setErr(e?.message||'Error'); }
    finally{ setLoading(false); }
  })(); },[token,headers]);

  // Add
  const [newName,setNewName]=useState('');
  const [newType,setNewType]=useState<(typeof TYPES)[number]>('TFSA');
  const [newBal,setNewBal]=useState('');
  const [adding,setAdding]=useState(false);
  const canAdd=()=> !!newName.trim() && !!newType && newBal.trim()!=='';

  const addAccount=async ()=>{
    if(!canAdd()) return;
    setAdding(true);
    try{
      const payload={ name:newName.trim(), type:newType, balance:num(newBal) };
      const r=await fetch('/api/accounts',{method:'POST', headers:jsonHeaders, body:JSON.stringify(payload)});
      const j=await r.json(); if(!j?.ok) throw new Error(j?.error??'Failed to add account');
      const a:Account=j.item;
      setItems(p=>[...p,a]);
      setRow(p=>({ ...p, [a.id]:{ balanceStr:asStr(a.balance), dirty:false, saving:false, _saved_balanceStr:asStr(a.balance) }}));
      setNewName(''); setNewType('TFSA'); setNewBal('');
    }catch(e:any){ alert(e?.message||'Add failed'); }
    finally{ setAdding(false); }
  };

  const onEdit=(id:string, balanceStr:string)=>{
    setRow(prev=>{
      const curr=prev[id]; if(!curr) return prev;
      const dirty = balanceStr !== curr._saved_balanceStr;
      return { ...prev, [id]:{ ...curr, balanceStr, dirty } };
    });
  };

  const saveRow=async (a:Account)=>{
    const st=row[a.id]; if(!st || st.saving || !st.dirty) return;
    setRow(prev=>({ ...prev, [a.id]:{ ...prev[a.id], saving:true }}));
    try{
      const payload={ balance:num(st.balanceStr) };
      const r=await fetch(`/api/accounts/${a.id}`,{ method:'PATCH', headers:jsonHeaders, body:JSON.stringify(payload) });
      const j=await r.json(); if(!j?.ok) throw new Error(j?.error??'Save failed');
      const saved:Account=j.item ?? { ...a, ...payload };
      setItems(prev=>prev.map(x=>x.id===a.id?saved:x));
      setRow(prev=>({ ...prev, [a.id]:{ balanceStr:asStr(saved.balance), _saved_balanceStr:asStr(saved.balance), dirty:false, saving:false }}));
    }catch(e:any){
      alert(e?.message||'Save failed');
      setRow(prev=>({ ...prev, [a.id]:{ ...prev[a.id], saving:false }}));
    }
  };

  const del=async (id:string)=>{
    if(!confirm('Delete this account?')) return;
    try{
      const r=await fetch(`/api/accounts/${id}`,{ method:'DELETE', headers });
      const j=await r.json(); if(!j?.ok) throw new Error(j?.error??'Delete failed');
      setItems(prev=>prev.filter(x=>x.id!==id));
      setRow(prev=>{ const c={...prev}; delete c[id]; return c; });
    }catch(e:any){ alert(e?.message||'Delete failed'); }
  };

  if(!session) return <main className="max-w-6xl mx-auto p-4"><div className="rounded-xl border bg-white p-6">Sign in to manage accounts.</div></main>;

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-medium">Add account</div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Institution / Name</label>
            <input className="w-48 rounded-md border px-3 py-2" placeholder="e.g., TD TFSA" value={newName} onChange={e=>setNewName(e.target.value)} />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Type</label>
            <select className="w-32 rounded-md border px-3 py-2" value={newType} onChange={e=>setNewType(e.target.value as any)}>
              {TYPES.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Please enter the total value of the account</label>
            <input className="w-40 rounded-md border px-3 py-2" type="text" inputMode="decimal" placeholder="e.g., 12000" value={newBal} onChange={e=>setNewBal(e.target.value)} />
          </div>
          <button onClick={addAccount} disabled={!canAdd()||adding} className={(!canAdd()||adding)?'rounded bg-gray-300 px-4 py-2 text-gray-600 cursor-not-allowed':'rounded bg-blue-600 px-4 py-2 text-white'}>
            {adding?'Adding…':'Add'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-3 shadow-sm">
        <div className="mb-2 text-sm font-medium">Your accounts</div>
        {loading? <div className="text-sm text-gray-600">Loading…</div>
        : err? <div className="text-sm text-red-600">{err}</div>
        : items.length===0? <div className="text-sm text-gray-600">No accounts yet.</div>
        : (
          <div className="space-y-2">
            {items.map(a=>{
              const st=row[a.id]; if(!st) return null;
              const canSave = st.dirty && !st.saving;
              return (
                <div key={a.id} className="grid grid-cols-1 sm:grid-cols-12 items-center gap-2 border rounded-lg p-2">
                  <div className="sm:col-span-4">
                    <div className="text-xs text-gray-600">Institution / Name</div>
                    <div className="text-sm">{a.name}</div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="text-xs text-gray-600">Type</div>
                    <div className="text-sm">{a.type}</div>
                  </div>
                  <div className="sm:col-span-4">
                    <label className="text-xs text-gray-600">Total value</label>
                    <input className="mt-0.5 w-full rounded-md border px-3 py-2" type="text" inputMode="decimal" placeholder="e.g., 12000" value={st.balanceStr} onChange={e=>onEdit(a.id, e.target.value)} />
                  </div>
                  <div className="sm:col-span-2 flex justify-end gap-2">
                    <button onClick={()=>saveRow(a)} disabled={!canSave} className={canSave?'rounded bg-emerald-600 px-3 py-1.5 text-white':'rounded bg-gray-300 px-3 py-1.5 text-gray-600 cursor-not-allowed'}>
                      {st.saving?'Saving…':'Save'}
                    </button>
                    <button onClick={()=>del(a.id)} className="rounded bg-red-500 px-3 py-1.5 text-white">Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
