cat > src/app/api/accounts/\[id]/route.ts <<'TS'
import { NextRequest } from 'next/server';
import { getRouteClient, requireUser, jsonOK, jsonErr } from '@/lib/supabaseRoute';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    const { supabase } = getRouteClient(req);
    const body = await req.json();

    const updates: Record<string, any> = {};
    if (body.balance !== undefined) updates.balance = Number(body.balance);
    if (body.name !== undefined) updates.name = String(body.name).trim();
    if (body.type !== undefined) updates.type = String(body.type).toUpperCase();
    if (body.is_family_resp !== undefined) updates.is_family_resp = Boolean(body.is_family_resp);
    if (body.children_covered !== undefined)
      updates.children_covered = Math.max(1, Number(body.children_covered));

    const { data, error } = await supabase
      .from('manual_accounts')
      .update(updates)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select('id, name, type, balance, is_family_resp, children_covered, created_at')
      .single();

    if (error) throw error;
    return jsonOK({ ok: true, item: data });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}

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
TS
