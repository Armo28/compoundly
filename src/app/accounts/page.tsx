'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';

type Account = {
  id: string;
  name: string;
  type: 'TFSA'|'RRSP'|'RESP'|'Margin'|'Other';
  balance: number;
  is_family_resp?: boolean;
  children_covered?: number;
};

const CAD = (n:number)=>n.toLocaleString(undefined,{style:'currency',currency:'CAD',maximumFractionDigits:0});

export default function AccountsPage() {
  const { session, loading } = useAuth();
  const token = session?.access_token ?? '';
  const hdrs = useMemo(()=> token ? { authorization: `Bearer ${token}` } : {}, [token]);

  const [list,setList] = useState<Account[]>([]);
  const [fetching,setFetching] = useState(false);

  // add-form state
  const [newName,setNewName] = useState('');
  const [newType,setNewType] = useState<'TFSA'|'RRSP'|'RESP'|'Margin'|'Other'>('TFSA');
  const [newBal,setNewBal] = useState<string>('');
  const [newIsFamily, setNewIsFamily] = useState(false);
  const [newChildren,setNewChildren] = useState<number>(1);

  // row edits
  const [dirty, setDirty] = useState<Record<string, boolean>>({});

  const load = async ()=>{
    if (!token) return;
    setFetching(true);
    try {
      const r = await fetch('/api/accounts', { headers: hdrs });
      const j = await r.json();
      if (j?.ok && Array.isArray(j.items)) {
        setList(j.items.map((a: any)=>({
          id: a.id, name: a.name, type: a.type, balance: Number(a.balance||0),
          is_family_resp: !!a.is_family_resp,
          children_covered: Number(a.children_covered ?? 1)
        })));
      }
    } finally {
      setFetching(false);
    }
  };

  useEffect(()=>{ load(); }, [token]); // eslint-disable-line

  const canAdd = newName.trim().length>0 && Number.isFinite(Number(newBal));

  const add = async ()=>{
    if (!canAdd || !token) return;
    const body = {
      name: newName.trim(),
      type: newType,
      balance: Number(newBal||0),
      is_family_resp: newType==='RESP' ? newIsFamily : false,
      children_covered: newType==='RESP' ? Math.max(1, Number(newChildren||1)) : 1
    };
    const r = await fetch('/api/accounts', {
      method:'POST',
      headers: { 'content-type':'application/json', ...hdrs },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (j?.ok && j.item) {
      setList(prev=>[...prev, j.item]);
      // reset
      setNewName('');
      setNewType('TFSA');
      setNewBal('');
      setNewIsFamily(false);
      setNewChildren(1);
    } else {
      alert(j?.error ?? 'Failed to add');
    }
  };

  const save = async (a: Account)=>{
    if (!token) return;
    const r = await fetch(`/api/accounts/${a.id}`, {
      method:'PATCH',
      headers: { 'content-type':'application/json', ...hdrs },
      body: JSON.stringify({
        name: a.name,
        type: a.type,
        balance: a.balance,
        is_family_resp: a.type==='RESP' ? !!a.is_family_resp : false,
        children_covered: a.type==='RESP' ? Math.max(1, Number(a.children_covered||1)) : 1
      })
    });
    const j = await r.json();
    if (j?.ok && j.item) {
      setList(prev=>prev.map(x=>x.id===a.id? j.item : x));
      setDirty(d=>({ ...d, [a.id]: false }));
    } else {
      alert(j?.error ?? 'Save failed');
    }
  };

  const del = async (id:string)=>{
    if (!token) return;
    const r = await fetch(`/api/accounts/${id}`, { method:'DELETE', headers: hdrs });
    const j = await r.json();
    if (j?.ok) setList(prev=>prev.filter(x=>x.id!==id));
    else alert(j?.error ?? 'Delete failed');
  };

  const markDirty = (id: string)=> setDirty(d=>({ ...d, [id]: true }));

  if (loading) {
    return <main className="max-w-5xl mx-auto p-4"><div className="rounded-xl border bg-white p-6">Loading…</div></main>;
  }
  if (!session) {
    return <main className="max-w-5xl mx-auto p-4"><div className="rounded-xl border bg-white p-6">Sign in to manage accounts.</div></main>;
  }

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-4">
      {/* Add form */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">Add account</div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <div className="text-xs text-gray-600 mb-1">Institution / Name</div>
            <input
              className="w-56 rounded-lg border px-3 py-2"
              value={newName}
              onChange={e=>setNewName(e.target.value)}
              placeholder="e.g. Questrade"
            />
          </label>

          <label className="text-sm">
            <div className="text-xs text-gray-600 mb-1">Type</div>
            <select
              className="w-36 rounded-lg border px-3 py-2"
              value={newType}
              onChange={e=>setNewType(e.target.value as any)}
            >
              <option>TFSA</option>
              <option>RRSP</option>
              <option>RESP</option>
              <option>Margin</option>
              <option>Other</option>
            </select>
          </label>

          <label className="text-sm">
            <div className="text-xs text-gray-600 mb-1">Balance</div>
            <input
              className="w-44 rounded-lg border px-3 py-2 text-right"
              inputMode="decimal"
              value={newBal}
              onChange={e=>setNewBal(e.target.value.replace(/[^\d.]/g,''))}
              placeholder="0"
            />
          </label>

          {newType==='RESP' && (
            <>
              <label className="text-sm inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  className="rounded border"
                  checked={newIsFamily}
                  onChange={e=>setNewIsFamily(e.target.checked)}
                />
                <span>Family RESP</span>
              </label>
              <label className="text-sm">
                <div className="text-xs text-gray-600 mb-1">Children covered</div>
                <input
                  className="w-28 rounded-lg border px-3 py-2 text-right"
                  type="number"
                  min={1}
                  value={newChildren}
                  onChange={e=>setNewChildren(Math.max(1, Number(e.target.value||1)))}
                />
              </label>
            </>
          )}

          <button
            onClick={add}
            disabled={!canAdd}
            className={canAdd ? 'rounded bg-indigo-600 px-3 py-2 text-white' : 'rounded bg-gray-300 px-3 py-2 text-gray-600 cursor-not-allowed'}
          >
            Add
          </button>
        </div>
      </section>

      {/* List */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">Your accounts</div>

        {fetching ? (
          <div className="p-3 text-sm">Loading…</div>
        ) : list.length===0 ? (
          <div className="p-3 text-sm text-gray-600">No accounts yet.</div>
        ) : (
          <div className="space-y-3">
            {list.map(a=>(
              <div key={a.id} className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
                <label className="text-sm">
                  <div className="text-xs text-gray-600 mb-1">Institution / Name</div>
                  <input
                    className="w-56 rounded-lg border px-3 py-2"
                    value={a.name}
                    onChange={e=>{
                      const name=e.target.value;
                      setList(prev=>prev.map(x=>x.id===a.id? {...x, name}:x));
                      markDirty(a.id);
                    }}
                  />
                </label>

                <label className="text-sm">
                  <div className="text-xs text-gray-600 mb-1">Type</div>
                  <select
                    className="w-36 rounded-lg border px-3 py-2"
                    value={a.type}
                    onChange={e=>{
                      const type=e.target.value as Account['type'];
                      setList(prev=>prev.map(x=>x.id===a.id? {...x, type}:x));
                      markDirty(a.id);
                    }}
                  >
                    <option>TFSA</option>
                    <option>RRSP</option>
                    <option>RESP</option>
                    <option>Margin</option>
                    <option>Other</option>
                  </select>
                </label>

                <label className="text-sm">
                  <div className="text-xs text-gray-600 mb-1">Balance</div>
                  <input
                    className="w-44 rounded-lg border px-3 py-2 text-right"
                    inputMode="decimal"
                    value={String(a.balance)}
                    onChange={e=>{
                      const balance=Number(e.target.value.replace(/[^\d.]/g,'')||0);
                      setList(prev=>prev.map(x=>x.id===a.id? {...x, balance}:x));
                      markDirty(a.id);
                    }}
                  />
                </label>

                {a.type==='RESP' && (
                  <>
                    <label className="text-sm inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="rounded border"
                        checked={!!a.is_family_resp}
                        onChange={e=>{
                          const is_family_resp = e.target.checked;
                          setList(prev=>prev.map(x=>x.id===a.id? {...x, is_family_resp}:x));
                          markDirty(a.id);
                        }}
                      />
                      <span>Family RESP</span>
                    </label>

                    <label className="text-sm">
                      <div className="text-xs text-gray-600 mb-1">Children covered</div>
                      <input
                        className="w-28 rounded-lg border px-3 py-2 text-right"
                        type="number"
                        min={1}
                        value={a.children_covered ?? 1}
                        onChange={e=>{
                          const children_covered = Math.max(1, Number(e.target.value||1));
                          setList(prev=>prev.map(x=>x.id===a.id? {...x, children_covered}:x));
                          markDirty(a.id);
                        }}
                      />
                    </label>
                  </>
                )}

                <div className="ms-auto flex items-center gap-2">
                  <button
                    onClick={()=>save(a)}
                    disabled={!dirty[a.id]}
                    className={dirty[a.id] ? 'rounded bg-emerald-600 px-3 py-1.5 text-white' : 'rounded bg-gray-300 px-3 py-1.5 text-gray-600 cursor-not-allowed'}
                  >
                    Save
                  </button>
                  <button
                    onClick={()=>del(a.id)}
                    className="rounded bg-red-500 px-3 py-1.5 text-white"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
