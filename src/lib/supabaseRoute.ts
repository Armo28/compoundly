import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Builds a Supabase client for API routes. It will:
 *  - Prefer a Bearer token from Authorization header
 *  - Otherwise fall back to no auth (will be treated as anon)
 */
export function getRouteClient(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null;

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return { supabase, token };
}

/** Require a signed-in user or throw */
export async function requireUser(req: NextRequest) {
  const { supabase } = getRouteClient(req);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    const e = new Error('Unauthorized');
    // @ts-ignore custom status
    (e as any).status = 401;
    throw e;
  }
  return data.user;
}
