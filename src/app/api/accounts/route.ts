import { NextRequest } from 'next/server';
import { getRouteClient, jsonErr, jsonOK, requireUser } from '@/lib/supabaseRoute';

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const { supabase } = getRouteClient(req);
    const { data, error } = await supabase
      .from('manual_accounts')
      .select('id,institution,type,balance,source,created_at,updated_at')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return jsonOK({ ok: true, accounts: data ?? [] });
  } catch (e:any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const inst = `${body?.institution ?? ''}`.trim();
    const type = `${body?.type ?? ''}`.trim();
    const balance = Number(body?.balance ?? 0);
    if (!inst || !type || !isFinite(balance)) return jsonErr('Invalid payload', 400);

    const { supabase } = getRouteClient(req);
    const { data, error } = await supabase
      .from('manual_accounts')
      .insert([{ user_id: user.id, institution: inst, type, balance, source: 'manual' }])
      .select('id,institution,type,balance,source,created_at,updated_at')
      .single();
    if (error) throw error;

    await fetch(new URL('/api/snapshots', req.url), {
      method: 'POST',
      headers: { authorization: req.headers.get('authorization') ?? '' },
    });

    return jsonOK({ ok: true, account: data });
  } catch (e:any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}
