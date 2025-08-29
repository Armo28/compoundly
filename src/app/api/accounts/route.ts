// src/app/api/accounts/route.ts
import { NextRequest } from 'next/server';
import { getRouteClient, jsonErr, jsonOK, requireUser } from '@/lib/supabaseRoute';

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const { supabase } = getRouteClient(req);
    const { data, error } = await supabase
      .from('manual_accounts')
      .select('id,name,type,balance,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return jsonOK({ ok: true, accounts: data ?? [] });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const name = `${body?.name ?? ''}`.trim();
    const type = `${body?.type ?? ''}`.trim();
    const balance = Number(body?.balance ?? 0);
    if (!name || !type || Number.isNaN(balance)) return jsonErr('Invalid payload');

    const { supabase } = getRouteClient(req);
    const { data, error } = await supabase
      .from('manual_accounts')
      .insert([{ user_id: user.id, name, type, balance }])
      .select('id,name,type,balance,created_at')
      .single();
    if (error) throw error;
    return jsonOK({ ok: true, account: data });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const id = body?.id;
    if (!id) return jsonErr('Missing id');

    const patch: any = {};
    if (typeof body?.name === 'string') patch.name = body.name.trim();
    if (typeof body?.type === 'string') patch.type = body.type.trim();
    if (body?.balance === '' || body?.balance === null) patch.balance = 0;
    if (typeof body?.balance === 'number') patch.balance = body.balance;

    const { supabase } = getRouteClient(req);
    const { data, error } = await supabase
      .from('manual_accounts')
      .update(patch)
      .eq('user_id', user.id)
      .eq('id', id)
      .select('id,name,type,balance,created_at')
      .single();
    if (error) throw error;
    return jsonOK({ ok: true, account: data });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return jsonErr('Missing id');

    const { supabase } = getRouteClient(req);
    const { error } = await supabase
      .from('manual_accounts')
      .delete()
      .eq('user_id', user.id)
      .eq('id', id);
    if (error) throw error;
    return jsonOK({ ok: true });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}
