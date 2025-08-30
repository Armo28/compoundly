import { NextRequest } from 'next/server';
import { requireUser, getRouteClient, jsonOK, jsonErr } from '@/lib/supabaseRoute';

// Update account
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const { name, type, balance } = body || {};
    const { supabase } = getRouteClient(req);

    const { data, error } = await supabase
      .from('manual_accounts')
      .update({ name, type, balance })
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select('id,name,type,balance,created_at')
      .single();

    if (error) throw error;
    return jsonOK({ ok: true, account: data });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}

// Delete account
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    const { supabase } = getRouteClient(req);

    const { error } = await supabase
      .from('manual_accounts')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id);

    if (error) throw error;
    return jsonOK({ ok: true });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}
