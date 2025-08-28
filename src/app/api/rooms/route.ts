import { NextRequest } from 'next/server';
import { routeClient } from '@/lib/supabaseRoute';

export async function GET(req: NextRequest) {
  const supa = routeClient();
  const { data: { user }, error: uErr } = await supa.auth.getUser();
  if (uErr || !user) return new Response('Unauthorized', { status: 401 });

  const year = Number(new URL(req.url).searchParams.get('year')) || new Date().getFullYear();
  const { data, error } = await supa
    .from('contribution_rooms')
    .select('*')
    .eq('user_id', user.id)
    .eq('year', year)
    .maybeSingle();

  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data || null);
}

export async function POST(req: NextRequest) {
  const supa = routeClient();
  const { data: { user }, error: uErr } = await supa.auth.getUser();
  if (uErr || !user) return new Response('Unauthorized', { status: 401 });

  const body = await req.json();
  const year = Number(body.year) || new Date().getFullYear();
  const tfsa_room = Number(body.tfsa_room) || 0;
  const rrsp_room = Number(body.rrsp_room) || 0;

  const { data, error } = await supa
    .from('contribution_rooms')
    .upsert(
      { user_id: user.id, year, tfsa_room, rrsp_room },
      { onConflict: 'user_id,year' }
    )
    .select('*')
    .single();

  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
}
