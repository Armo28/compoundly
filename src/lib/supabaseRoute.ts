import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export function getRouteClient(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const bearer = req.headers.get('authorization') ?? '';
  const match = bearer.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1] : undefined;

  const supabase = createClient(url, anon, {
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { supabase, token };
}

export async function requireUser(req: NextRequest) {
  const { supabase } = getRouteClient(req);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    const e = new Error('Unauthorized');
    // @ts-expect-error add status for our catch blocks
    e.status = 401;
    throw e;
  }
  return data.user;
}

export function jsonOK(body: any, init?: ResponseInit) {
  return NextResponse.json(body, init);
}

export function jsonErr(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
