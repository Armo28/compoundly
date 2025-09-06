import { NextRequest } from 'next/server';
import { getRouteClient, requireUser, jsonOK, jsonErr } from '@/lib/supabaseRoute';

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const { supabase } = getRouteClient(req);
    const year = new Date().getFullYear();

    // contributed this year
    const { data: ytdRows, error: e1 } = await supabase
      .from('resp_year_progress')
      .select('amount')
      .eq('user_id', user.id)
      .eq('year', year);

    if (e1) throw e1;
    const contributed_ytd = (ytdRows ?? []).reduce((s, r: any) => s + Number(r?.amount || 0), 0);

    // lifetime contributed (sum of all rows)
    const { data: lifeRows, error: e2 } = await supabase
      .from('resp_year_progress')
      .select('amount')
      .eq('user_id', user.id);

    if (e2) throw e2;
    const lifetime_contributed = (lifeRows ?? []).reduce((s, r: any) => s + Number(r?.amount || 0), 0);

    return jsonOK({ ok: true, contributed_ytd, lifetime_contributed });
  } catch (e: any) {
    // Safe default keeps Goals UI functioning
    return jsonOK({ ok: true, contributed_ytd: 0, lifetime_contributed: 0 });
  }
}
