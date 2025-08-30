import { NextRequest } from 'next/server';
import { getRouteClient, jsonErr, jsonOK, requireUser } from '@/lib/supabaseRoute';

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const { supabase } = getRouteClient(req);

    const { data: sums, error: e1 } = await supabase
      .from('manual_accounts')
      .select('balance');
    if (e1) throw e1;
    const total = (sums ?? []).reduce((a,b)=>a+Number(b.balance||0), 0);
    const today = new Date().toISOString().slice(0,10);

    const { error: e2 } = await supabase
      .from('account_snapshots')
      .upsert({ user_id: user.id, taken_on: today, total }, { onConflict: 'user_id,taken_on' });
    if (e2) throw e2;

    return jsonOK({ ok: true, total });
  } catch (e:any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}
