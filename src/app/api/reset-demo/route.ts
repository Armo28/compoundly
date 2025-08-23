import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Missing x-user-id' }, { status: 401 });
    }

    // 1) Delete child rows first
    const { error: posErr } = await supabaseAdmin
      .from('positions')
      .delete()
      .eq('user_id', userId);
    if (posErr) {
      return NextResponse.json({ error: posErr.message }, { status: 500 });
    }

    // 2) (Optional) Delete transactions if your schema has this table
    const { error: txErr } = await supabaseAdmin
      .from('transactions')
      .delete()
      .eq('user_id', userId);
    // Ignore table-not-found errors (e.g., 42P01), otherwise surface real errors
    if (txErr && txErr.code !== '42P01') {
      return NextResponse.json({ error: txErr.message }, { status: 500 });
    }

    // 3) Delete parent rows
    const { error: accErr } = await supabaseAdmin
      .from('accounts')
      .delete()
      .eq('user_id', userId);
    if (accErr) {
      return NextResponse.json({ error: accErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unknown error' }, { status: 500 });
  }
}
