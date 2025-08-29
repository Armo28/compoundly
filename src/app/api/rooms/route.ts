// src/app/api/rooms/route.ts
import { NextRequest } from 'next/server';
import { getRouteClient, jsonErr, jsonOK, requireUser } from '@/lib/supabaseRoute';

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const { supabase } = getRouteClient(req);
    const year = new Date().getFullYear();
    const { data, error } = await supabase
      .from('contribution_rooms')
      .select('year,tfsa,rrsp')
      .eq('user_id', user.id)
      .eq('year', year)
      .single();
    if (error && error.code !== 'PGRST116') throw error; // not found is ok
    return jsonOK({ ok: true, room: data ?? { year, tfsa: 0, rrsp: 0 } });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const year = new Date().getFullYear();
    const tfsa = Number(body?.tfsa ?? 0);
    const rrsp = Number(body?.rrsp ?? 0);
    if (Number.isNaN(tfsa) || Number.isNaN(rrsp)) return jsonErr('Invalid numbers');

    const { supabase } = getRouteClient(req);
    const { data, error } = await supabase
      .from('contribution_rooms')
      .upsert(
        [{ user_id: user.id, year, tfsa, rrsp, updated_at: new Date().toISOString() }],
        { onConflict: 'user_id,year' }
      )
      .select('year,tfsa,rrsp')
      .single();
    if (error) throw error;
    return jsonOK({ ok: true, room: data });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}
