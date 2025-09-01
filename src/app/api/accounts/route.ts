import { NextRequest } from 'next/server';
import { getRouteClient, jsonErr, jsonOK, requireUser } from '@/lib/supabaseRoute';

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const { supabase } = getRouteClient(req);

    const { data, error } = await supabase
      .from('manual_accounts')
      .select('id,institution,type,balance,source,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return jsonOK({ ok: true, accounts: data ?? [] });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const { supabase } = getRouteClient(req);
    const { institution, type, balance } = await req.json();

    const { data: inserted, error } = await supabase
      .from('manual_accounts')
      .insert({
        user_id: user.id,
        institution,
        type,
        balance: Number(balance || 0),
        source: 'manual',
      })
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
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const { error: upErr } = await supabase
      .from('account_snapshots')
      .upsert({ user_id: user.id, taken_on: today, total }, { onConflict: 'user_id,taken_on' });

    if (upErr) throw upErr;

    return jsonOK({ ok: true, account: inserted });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}
