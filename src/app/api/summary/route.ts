import { NextRequest } from 'next/server';
import { getRouteClient, requireUser, jsonOK, jsonErr } from '@/lib/supabaseRoute';

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const { supabase } = getRouteClient(req);

    // balances by type
    const { data: accts, error: e1 } = await supabase
      .from('manual_accounts')
      .select('type,balance')
      .eq('user_id', user.id);
    if (e1) throw e1;

    const byType: Record<string, number> = {};
    let total = 0;
    for (const row of accts ?? []) {
      const t = row.type ?? 'Other';
      const b = Number(row.balance ?? 0) || 0;
      byType[t] = (byType[t] ?? 0) + b;
      total += b;
    }

    // history (prefer account_snapshots; fallback to snapshots)
    let history: { taken_on?: string; ts?: string; total: number }[] = [];
    const { data: h1, error: he1 } = await supabase
      .from('account_snapshots')
      .select('taken_on,total')
      .eq('user_id', user.id)
      .order('taken_on', { ascending: true });
    if (!he1 && h1) {
      history = h1 as any;
    } else {
      const { data: h2 } = await supabase
        .from('snapshots')
        .select('ts,total')
        .eq('user_id', user.id)
        .order('ts', { ascending: true });
      history = (h2 ?? []) as any;
    }

    return jsonOK({ ok: true, byType, total, overall: total, history });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}
