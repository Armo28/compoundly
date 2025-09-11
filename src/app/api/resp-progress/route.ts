import { NextRequest } from 'next/server';
import { getRouteClient, requireUser, jsonOK, jsonErr } from '@/lib/supabaseRoute';

type RespRow = {
  year: number;
  total_value: number;
  lifetime_contrib: number;
  contributed_this_year: number;
  is_family_resp: boolean;
  children_covered: number;
  updated_at?: string;
};

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const year = new Date().getFullYear();

    const { supabase } = getRouteClient(req);
    const { data, error } = await supabase
      .from('resp_year_progress')
      .select('year,total_value,lifetime_contrib,contributed_this_year,is_family_resp,children_covered,updated_at')
      .eq('user_id', user.id)
      .eq('year', year)
      .maybeSingle();

    if (error) throw error;

    // Always return a row shape; the Room page uses this to prefill blanks
    const empty: RespRow = {
      year,
      total_value: 0,
      lifetime_contrib: 0,
      contributed_this_year: 0,
      is_family_resp: false,
      children_covered: 1,
    };

    return jsonOK({ ok: true, data: data ?? empty });
  } catch (e: any) {
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
    const is_family_resp = !!body?.is_family_resp;
    const children_covered = Math.max(1, Number(body?.children_covered ?? 1));

    if (![total_value, lifetime_contrib, contributed_this_year].every(Number.isFinite)) {
      return jsonErr('Invalid numeric payload', 400);
    }

    const { supabase } = getRouteClient(req);

    // Application-level UPSERT that works even if partial indexes are present elsewhere
    const { data: existing, error: selErr } = await supabase
      .from('resp_year_progress')
      .select('year')
      .eq('user_id', user.id)
      .eq('year', year)
      .maybeSingle();

    if (selErr) throw selErr;

    if (existing) {
      const { data, error } = await supabase
        .from('resp_year_progress')
        .update({
          total_value,
          lifetime_contrib,
          contributed_this_year,
          is_family_resp,
          children_covered,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('year', year)
        .select('year,total_value,lifetime_contrib,contributed_this_year,is_family_resp,children_covered,updated_at')
        .single();

      if (error) throw error;
      return jsonOK({ ok: true, data });
    } else {
      const { data, error } = await supabase
        .from('resp_year_progress')
        .insert([{
          user_id: user.id,
          year,
          total_value,
          lifetime_contrib,
          contributed_this_year,
          is_family_resp,
          children_covered,
        }])
        .select('year,total_value,lifetime_contrib,contributed_this_year,is_family_resp,children_covered,updated_at')
        .single();

      if (error) throw error;
      return jsonOK({ ok: true, data });
    }
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}
