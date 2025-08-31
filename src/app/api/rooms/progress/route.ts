import { NextRequest } from 'next/server';
import { getRouteClient, requireUser, jsonOK, jsonErr } from '@/lib/supabaseRoute';

// GET deposited so far for current year
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const year = new Date().getFullYear();
    const { supabase } = getRouteClient(req);

    const { data, error } = await supabase
      .from('room_progress')
      .select('year, tfsa_deposited, rrsp_deposited')
      .eq('user_id', user.id)
      .eq('year', year)
      .maybeSingle();

    if (error) throw error;
    return jsonOK({ ok: true, progress: data ?? { year, tfsa_deposited: 0, rrsp_deposited: 0 } });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}

// POST upsert deposited so far for current year
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const year = new Date().getFullYear();

    const tfsa = Number(body?.tfsa_deposited ?? 0);
    const rrsp = Number(body?.rrsp_deposited ?? 0);

    const { supabase } = getRouteClient(req);
    const { data, error } = await supabase
      .from('room_progress')
      .upsert(
        [{ user_id: user.id, year, tfsa_deposited: tfsa, rrsp_deposited: rrsp, updated_at: new Date().toISOString() }],
        { onConflict: 'user_id,year' }
      )
      .select('year, tfsa_deposited, rrsp_deposited')
      .single();

    if (error) throw error;
    return jsonOK({ ok: true, progress: data });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}
