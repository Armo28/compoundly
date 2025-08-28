import { NextRequest, NextResponse } from 'next/server';
import { getRouteClient, requireUser } from '@/lib/supabaseRoute';

/**
 * Schema expected (create):
 * { name: string; type: 'TFSA'|'RRSP'|'RESP'|'Margin'|'Other'; balance: number }
 *
 * Tables used:
 * - manual_accounts(user_id uuid, name text, type text, balance numeric, created_at timestamptz default now())
 *   RLS: enable, with policy: user_id = auth.uid()
 */

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
    return NextResponse.json({ ok: true, accounts: data ?? [] });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ ok: false, error: e?.message ?? 'Server error' }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const { name, type, balance } = body || {};
    if (!name || !type || typeof balance !== 'number') {
      return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
    }
    const { supabase } = getRouteClient(req);
    const { data, error } = await supabase
      .from('manual_accounts')
      .insert([{ user_id: user.id, name, type, balance }])
      .select('id,name,type,balance,created_at')
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, account: data });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ ok: false, error: e?.message ?? 'Server error' }, { status });
  }
}
