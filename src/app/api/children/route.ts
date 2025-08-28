import { NextRequest, NextResponse } from 'next/server';
import { getRouteClient, requireUser } from '@/lib/supabaseRoute';

/**
 * Table: children(user_id uuid, name text, birth_year int, created_at timestamptz default now())
 * RLS: user_id = auth.uid()
 */

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const { supabase } = getRouteClient(req);
    const { data, error } = await supabase
      .from('children')
      .select('id,name,birth_year,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ ok: true, children: data ?? [] });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ ok: false, error: e?.message ?? 'Server error' }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const name = `${body?.name ?? ''}`.trim();
    const birth_year = Number(body?.birth_year ?? 0);
    if (!name || !birth_year) {
      return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
    }
    const { supabase } = getRouteClient(req);
    const { data, error } = await supabase
      .from('children')
      .insert([{ user_id: user.id, name, birth_year }])
      .select('id,name,birth_year,created_at')
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, child: data });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ ok: false, error: e?.message ?? 'Server error' }, { status });
  }
}
