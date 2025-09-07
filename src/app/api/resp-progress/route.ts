import { NextRequest } from 'next/server';
import { getRouteClient, requireUser, jsonOK, jsonErr } from '@/lib/supabaseRoute';

// One row per user per YEAR (for contributed_this_year). Lifetime fields live here as well.
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const year = new Date().getFullYear();
    const { supabase } = getRouteClient(req);
    const { data, error } = await supabase
      .from('resp_year_progress')
      .select('year,total_value,lifetime_contrib,contributed_this_year,is_family_resp,children_covered')
      .eq('user_id', user.id)
      .eq('year', year)
      .maybeSingle();
    if (error) throw error;
    return jsonOK({ ok: true, data });
  } catch (e:any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const year = new Date().getFullYear();

    const row = {
      user_id: user.id,
      year,
      total_value: Number(body?.total_value ?? 0),
      lifetime_contrib: Number(body?.lifetime_contrib ?? 0),
      contributed_this_year: Number(body?.contributed_this_year ?? 0),
      is_family_resp: Boolean(body?.is_family_resp ?? false),
      children_covered: body?.children_covered == null ? 1 : Math.max(1, Number(body.children_covered)),
      updated_at: new Date().toISOString(),
    };

    const { supabase } = getRouteClient(req);
    const { data, error } = await supabase
      .from('resp_year_progress')
      .upsert([row], { onConflict: 'user_id,year' })
      .select('year,total_value,lifetime_contrib,contributed_this_year,is_family_resp,children_covered')
      .single();

    if (error) throw error;
    return jsonOK({ ok: true, data });
  } catch (e:any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}
