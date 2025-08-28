import { NextRequest, NextResponse } from 'next/server';
import { getRouteClient, requireUser } from '@/lib/supabaseRoute';

/**
 * Table: contribution_rooms(user_id uuid, year int, tfsa numeric, rrsp numeric, updated_at timestamptz default now())
 * RLS: user_id = auth.uid()
 */

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const { supabase } = getRouteClient(req);
    const year = new Date().getFullYear();
    const { data, error } = await supabase
      .from('contribution_rooms')
      .select('year, tfsa, rrsp')
      .eq('user_id', user.id)
      .eq('year', year)
      .maybeSingle();

    if (error) throw error;
    return NextResponse.json({ ok: true, room: data ?? { year, tfsa: 0, rrsp: 0 } });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ ok: false, error: e?.message ?? 'Server error' }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const year = new Date().getFullYear();
    const tfsa = Number(body?.tfsa ?? 0);
    const rrsp = Number(body?.rrsp ?? 0);

    const { supabase } = getRouteClient(req);
    const { data, error } = await supabase
      .from('contribution_rooms')
      .upsert(
        [{ user_id: user.id, year, tfsa, rrsp, updated_at: new Date().toISOString() }],
        { onConflict: 'user_id,year' }
      )
      .select('year, tfsa, rrsp')
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, room: data });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ ok: false, error: e?.message ?? 'Server error' }, { status });
  }
}
