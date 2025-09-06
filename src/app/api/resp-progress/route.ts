import { NextRequest } from 'next/server';
import { getRouteClient, requireUser, jsonOK, jsonErr } from '@/lib/supabaseRoute';

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const year = new Date().getFullYear();
    const { supabase } = getRouteClient(req);

    const { data: row, error: e1 } = await supabase
      .from('resp_year_progress')
      .select('year, deposited')
      .eq('user_id', user.id)
      .eq('year', year)
      .maybeSingle();
    if (e1) throw e1;

    const { data: all, error: e2 } = await supabase
      .from('resp_year_progress')
      .select('deposited')
      .eq('user_id', user.id);
    if (e2) throw e2;

    const deposited_year = Number(row?.deposited ?? 0);
    const deposited_total = (all ?? []).reduce(
      (a, r: any) => a + Number(r.deposited || 0),
      0
    );

    return jsonOK({ ok: true, year, deposited_year, deposited_total });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const year = Number(body?.year ?? new Date().getFullYear());
    const deposited = Number(body?.deposited ?? 0);
    const { supabase } = getRouteClient(req);

    const { data, error } = await supabase
      .from('resp_year_progress')
      .upsert(
        [{ user_id: user.id, year, deposited, updated_at: new Date().toISOString() }],
        { onConflict: 'user_id,year' }
      )
      .select('year, deposited')
      .single();

    if (error) throw error;
    return jsonOK({ ok: true, item: data });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}
