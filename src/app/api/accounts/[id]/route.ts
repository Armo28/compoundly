import { NextRequest } from 'next/server';
import { getRouteClient, jsonErr, jsonOK, requireUser } from '@/lib/supabaseRoute';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    const { supabase } = getRouteClient(req);
    const { institution, type, balance } = await req.json();

    const { data: updated, error } = await supabase
      .from('manual_accounts')
      .update({
        institution,
        type,
        balance: Number(balance || 0),
      })
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    // Recompute total and UPSERT today's snapshot
    const { data: sumRows, error: sumErr } = await supabase
      .from('manual_accounts')
      .select('balance')
      .eq('user_id', user.id);
    if (sumErr) throw sumErr;

    const total = (sumRows ?? []).reduce((a, r: any) => a + Number(r.balance || 0), 0);
    const today = new Date().toISOString().slice(0, 10);

    const { error: upErr } = await supabase
      .from('account_snapshots')
      .upsert({ user_id: user.id, taken_on: today, total }, { onConflict: 'user_id,taken_on' });

    if (upErr) throw upErr;

    return jsonOK({ ok: true, account: updated });
  } catch (e: any) {
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

    // Recompute total and UPSERT today's snapshot
    const { data: sumRows, error: sumErr } = await supabase
      .from('manual_accounts')
      .select('balance')
      .eq('user_id', user.id);
    if (sumErr) throw sumErr;

    const total = (sumRows ?? []).reduce((a, r: any) => a + Number(r.balance || 0), 0);
    const today = new Date().toISOString().slice(0, 10);

    const { error: upErr } = await supabase
      .from('account_snapshots')
      .upsert({ user_id: user.id, taken_on: today, total }, { onConflict: 'user_id,taken_on' });

    if (upErr) throw upErr;

    return jsonOK({ ok: true });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}
