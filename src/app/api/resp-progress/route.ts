import { NextRequest } from 'next/server';
import { getRouteClient, requireUser, jsonOK, jsonErr } from '@/lib/supabaseRoute';

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const year = new Date().getFullYear();
    const { supabase } = getRouteClient(req);

    const { data, error } = await supabase
      .from('resp_year_progress')
      .select('year, total_value, lifetime_contrib, contributed_this_year, is_family_resp, children_covered, catchup_years_per_child, updated_at')
      .eq('user_id', user.id)
      .eq('year', year)
      .maybeSingle();

    if (error) throw error;
    return jsonOK({ ok: true, data: data ?? { year, total_value: 0, lifetime_contrib: 0, contributed_this_year: 0, is_family_resp: false, children_covered: 1, catchup_years_per_child: 0 } });
  } catch (e:any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json();

    const year = new Date().getFullYear();
    const total_value = Number(body?.total_value ?? 0);
    const lifetime_contrib = Number(body?.lifetime_contrib ?? 0);
    const contributed_this_year = Number(body?.contributed_this_year ?? 0);
    const is_family_resp = Boolean(body?.is_family_resp ?? false);
    const children_covered = Math.max(1, Number(body?.children_covered ?? 1));
    const catchup_years_per_child = Math.max(0, Number(body?.catchup_years_per_child ?? 0));

    const { supabase } = getRouteClient(req);

    const { data, error } = await supabase
      .from('resp_year_progress')
      .upsert([{
        user_id: user.id,
        year,
        total_value,
        lifetime_contrib,
        contributed_this_year,
        is_family_resp,
        children_covered,
        catchup_years_per_child,
        updated_at: new Date().toISOString()
      }], { onConflict: 'user_id,year' })
      .select()
      .maybeSingle();

    if (error) throw error;
    return jsonOK({ ok: true, data });
  } catch (e:any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}
