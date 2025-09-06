import { NextRequest } from 'next/server';
import { getRouteClient, requireUser, jsonOK, jsonErr } from '@/lib/supabaseRoute';

// PATCH account
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const updates: Record<string, any> = {};

    if (typeof body?.name === 'string') {
      updates.name = body.name.trim();
      updates.institution = body.name.trim();
    }
    if (typeof body?.institution === 'string') {
      updates.institution = body.institution.trim();
      if (!updates.name) updates.name = updates.institution;
    }
    if (body?.type != null) updates.type = String(body.type).toUpperCase();
    if (body?.balance != null) updates.balance = Number(body.balance);
    if (body?.is_family_resp != null) updates.is_family_resp = Boolean(body.is_family_resp);
    if (body?.children_covered != null) updates.children_covered = Math.max(1, Number(body.children_covered));
    if (body?.resp_lifetime_contributed != null) updates.resp_lifetime_contributed = Math.max(0, Number(body.resp_lifetime_contributed));

    if (Object.keys(updates).length === 0) return jsonErr('No fields to update', 400);

    const { supabase } = getRouteClient(req);
    const { data, error } = await supabase
      .from('manual_accounts')
      .update(updates)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select('id, name, institution, type, balance, is_family_resp, children_covered, resp_lifetime_contributed, created_at')
      .single();

    if (error) throw error;
    return jsonOK({ ok: true, item: data });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}

// DELETE account
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
