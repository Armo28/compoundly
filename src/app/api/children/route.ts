import { NextRequest } from 'next/server';
import { routeClient } from '@/lib/supabaseRoute';

export async function GET() {
  const supa = routeClient();
  const { data: { user }, error: uErr } = await supa.auth.getUser();
  if (uErr || !user) return new Response('Unauthorized', { status: 401 });

  const { data, error } = await supa
    .from('children')
    .select('*')
    .eq('user_id', user.id)
    .order('birth_year');

  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
}

export async function POST(req: NextRequest) {
  const supa = routeClient();
  const { data: { user }, error: uErr } = await supa.auth.getUser();
  if (uErr || !user) return new Response('Unauthorized', { status: 401 });

  const body = await req.json();
  const { name, birth_year } = body || {};
  if (!birth_year) return new Response('Missing birth_year', { status: 400 });

  const { data, error } = await supa
    .from('children')
    .insert({ user_id: user.id, name: name ?? null, birth_year: Number(birth_year) })
    .select('*')
    .single();

  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
}

export async function DELETE(req: NextRequest) {
  const supa = routeClient();
  const { data: { user }, error: uErr } = await supa.auth.getUser();
  if (uErr || !user) return new Response('Unauthorized', { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return new Response('Missing id', { status: 400 });

  const { error } = await supa.from('children').delete().eq('id', id).eq('user_id', user.id);
  if (error) return new Response(error.message, { status: 500 });
  return new Response(null, { status: 204 });
}
