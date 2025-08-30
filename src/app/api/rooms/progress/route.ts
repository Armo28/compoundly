import { NextRequest } from 'next/server';
import { getRouteClient, jsonErr, jsonOK, requireUser } from '@/lib/supabaseRoute';

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const year = Number(body?.year ?? new Date().getFullYear());
    const tfsa_deposited = Number(body?.tfsa_deposited ?? 0);
    const rrsp_deposited = Number(body?.rrsp_deposited ?? 0);
    const { supabase } = getRouteClient(req);
    const { data, error } = await supabase
      .from('room_progress')
      .upsert({ user_id: user.id, year, tfsa_deposited, rrsp_deposited, updated_at: new Date().toISOString() }, { onConflict: 'user_id,year' })
      .select('year,tfsa_deposited,rrsp_deposited').single();
    if (error) throw error;
    return jsonOK({ ok: true, progress: data });
  } catch (e:any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}
