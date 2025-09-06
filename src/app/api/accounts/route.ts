import { NextRequest, NextResponse } from 'next/server';
import { getRouteClient, requireUser, jsonOK, jsonErr } from '@/lib/supabaseRoute';

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const { supabase } = getRouteClient(req);

    const { data, error } = await supabase
      .from('manual_accounts')
      .select('id, name, type, balance, is_family_resp, children_covered, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return jsonOK({ ok: true, items: data ?? [] });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const name = (body?.name ?? '').trim();
    const type = String(body?.type ?? '').toUpperCase();
    const balance = Number(body?.balance ?? 0);
    const is_family_resp = Boolean(body?.is_family_resp ?? false);
    const children_covered = Math.max(1, Number(body?.children_covered ?? 1));

    if (!name || !type || !Number.isFinite(balance)) {
      return jsonErr('Invalid payload', 400);
    }

    const { supabase } = getRouteClient(req);
    const { data, error } = await supabase
      .from('manual_accounts')
      .insert([{
        user_id: user.id,
        name,
        type,
        balance,
        is_family_resp,
        children_covered
      }])
      .select('id, name, type, balance, is_family_resp, children_covered, created_at')
      .single();

    if (error) throw error;
    return jsonOK({ ok: true, item: data });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}
