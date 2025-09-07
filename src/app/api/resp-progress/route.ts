import { NextRequest } from 'next/server';
import { getRouteClient, requireUser, jsonOK, jsonErr } from '@/lib/supabaseRoute';

const YEAR = new Date().getFullYear();

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const { supabase } = getRouteClient(req);

    const { data, error } = await supabase
      .from('resp_year_progress')
      .select('year,total_value,lifetime_contrib,contributed_this_year,is_family_resp,children_covered,updated_at')
      .eq('user_id', user.id)
      .eq('year', YEAR)
      .maybeSingle();

    if (error) throw error;
    return jsonOK({ ok: true, data: data ?? null });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json();

    const row = {
      user_id: user.id,
      year: YEAR,
      total_value: Number(body?.total_value ?? 0),
      lifetime_contrib: Number(body?.lifetime_contrib ?? 0),
      contributed_this_year: Number(body?.contributed_this_year ?? 0),
      is_family_resp: !!body?.is_family_resp,
      children_covered: Math.max(1, Number(body?.children_covered ?? 1)),
      updated_at: new Date().toISOString(),
    };

    const { supabase } = getRouteClient(req);
    const { data, error } = await supabase
      .from('resp_year_progress')
      .upsert(row, { onConflict: 'user_id,year' })
      .select('year,total_value,lifetime_contrib,contributed_this_year,is_family_resp,children_covered,updated_at')
      .single();

    if (error) throw error;
    return jsonOK({ ok: true, data });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}
