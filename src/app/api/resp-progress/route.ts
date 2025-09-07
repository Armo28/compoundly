import { NextRequest } from 'next/server';
import { getRouteClient, requireUser, jsonOK, jsonErr } from '@/lib/supabaseRoute';

/**
 * Table expected in Supabase:
 *
 * create table if not exists public.resp_year_progress (
 *   user_id uuid primary key references auth.users(id) on delete cascade,
 *   total_value numeric not null default 0,
 *   lifetime_contrib numeric not null default 0,
 *   contributed_this_year numeric not null default 0,
 *   is_family_resp boolean not null default false,
 *   children_covered int not null default 1,
 *   updated_at timestamptz not null default now()
 * );
 *
 * RLS example (owner-based):
 * create policy resp_progress_select on public.resp_year_progress
 *   for select using (auth.uid() = user_id);
 * create policy resp_progress_upsert on public.resp_year_progress
 *   for insert with check (auth.uid() = user_id);
 * create policy resp_progress_update on public.resp_year_progress
 *   for update using (auth.uid() = user_id);
 */

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const { supabase } = getRouteClient(req);

    const { data, error } = await supabase
      .from('resp_year_progress')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;

    // If user has no row yet, provide sensible defaults
    const payload = data ?? {
      user_id: user.id,
      total_value: 0,
      lifetime_contrib: 0,
      contributed_this_year: 0,
      is_family_resp: false,
      children_covered: 1,
      updated_at: new Date().toISOString(),
    };

    return jsonOK({ ok: true, data: payload });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json();

    const total_value = Number(body?.total_value ?? 0);
    const lifetime_contrib = Number(body?.lifetime_contrib ?? 0);
    const contributed_this_year = Number(body?.contributed_this_year ?? 0);
    const is_family_resp = Boolean(body?.is_family_resp ?? false);
    // null or <1 becomes 1 to keep math sane
    const kids = Math.max(1, Number(body?.children_covered ?? 1));

    const { supabase } = getRouteClient(req);

    const { data, error } = await supabase
      .from('resp_year_progress')
      .upsert(
        [{
          user_id: user.id,
          total_value,
          lifetime_contrib,
          contributed_this_year,
          is_family_resp,
          children_covered: kids,
          updated_at: new Date().toISOString(),
        }],
        { onConflict: 'user_id' }
      )
      .select('*')
      .single();

    if (error) throw error;

    return jsonOK({ ok: true, data: data });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}
