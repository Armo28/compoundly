import { NextRequest } from 'next/server';
import { getRouteClient, requireUser, jsonOK, jsonErr } from '@/lib/supabaseRoute';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const { institution, type, balance } = body || {};
    const { supabase } = getRouteClient(req);

    const { error } = await supabase
      .from('manual_accounts')
      .update({
        institution: institution ?? undefined,
        type: type ?? undefined,
        balance: typeof balance === 'number' ? balance : undefined,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .eq('user_id', user.id);

    if (error) throw error;

    // Update today's snapshot
    const { data: sumData, error: e2 } = await supabase
      .from('manual_accounts')
      .select('balance')
      .eq('user_id', user.id);
    if (e2) throw e2;
    const total = (sumData ?? []).reduce((a:any,r:any)=>a + Number(r.balance||0), 0);

    // Prefer account_snapshots(taken_on date)
    const today = new Date().toISOString().slice(0,10);
    const { error: e3 } = await supabase
      .from('account_snapshots')
      .upsert({ user_id: user.id, taken_on: today as any, total });
    if (e3 && !String(e3.message||'').toLowerCase().includes('relation "account_snapshots" does not exist')) {
      throw e3;
    }

    return jsonOK({ ok: true });
  } catch (e:any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    const { supabase } = getRouteClient(req);

    const { error } = await supabase
      .from('manual_accounts')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id);

    if (error) throw error;
    return jsonOK({ ok: true });
  } catch (e:any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}
