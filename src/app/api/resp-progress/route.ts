import { NextRequest } from 'next/server';
import { getRouteClient, requireUser, jsonOK, jsonErr } from '@/lib/supabaseRoute';

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const { searchParams } = new URL(req.url);
    const year = Number(searchParams.get('year') ?? new Date().getFullYear());

    const { supabase } = getRouteClient(req);
    const { data, error } = await supabase
      .from('resp_year_progress')
      .select('year, contributed_ytd, grant_eligible_contrib_lifetime, carry_forward_grantable_per_child')
      .eq('user_id', user.id)
      .eq('year', year)
      .maybeSingle();

    if (error) throw error;

    return jsonOK({
      ok: true,
      year,
      contributed_ytd: Number(data?.contributed_ytd ?? 0),
      grant_eligible_contrib_lifetime: data?.grant_eligible_contrib_lifetime == null ? null : Number(data.grant_eligible_contrib_lifetime),
      carry_forward_grantable_per_child: data?.carry_forward_grantable_per_child == null ? null : Number(data.carry_forward_grantable_per_child),
    });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const year = Number(body?.year ?? new Date().getFullYear());

    const contributed_ytd = Math.max(0, Number(body?.contributed_ytd ?? 0));
    const grant_eligible_contrib_lifetime = body?.grant_eligible_contrib_lifetime == null ? null : Math.max(0, Number(body.grant_eligible_contrib_lifetime));
    const carry_forward_grantable_per_child = body?.carry_forward_grantable_per_child == null ? null : Math.max(0, Math.min(2500, Number(body.carry_forward_grantable_per_child)));

    const { supabase } = getRouteClient(req);
    const { data, error } = await supabase
      .from('resp_year_progress')
      .upsert([{
        user_id: user.id,
        year,
        contributed_ytd,
        grant_eligible_contrib_lifetime,
        carry_forward_grantable_per_child,
        updated_at: new Date().toISOString(),
      }], { onConflict: 'user_id,year' })
      .select('year, contributed_ytd, grant_eligible_contrib_lifetime, carry_forward_grantable_per_child')
      .single();

    if (error) throw error;
    return jsonOK({ ok: true, item: data });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}
