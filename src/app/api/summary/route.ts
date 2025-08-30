import { NextRequest } from 'next/server';
import { requireUser, getRouteClient, jsonOK, jsonErr } from '@/lib/supabaseRoute';

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const { supabase } = getRouteClient(req);

    const { data, error } = await supabase
      .from('manual_accounts')
      .select('type,balance')
      .eq('user_id', user.id);

    if (error) throw error;

    const byType: Record<string, number> = {};
    let total = 0;
    for (const row of data ?? []) {
      const t = row.type ?? 'Other';
      const b = Number(row.balance ?? 0) || 0;
      byType[t] = (byType[t] ?? 0) + b;
      total += b;
    }

    return jsonOK({ ok: true, total, byType });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}
