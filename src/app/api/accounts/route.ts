import { NextRequest } from 'next/server';
import { adminClient } from '@/lib/supabaseServer';

// GET: list accounts for current user
// POST: create account {name?, institution?, type, balance}
export async function GET(req: NextRequest) {
  const supa = adminClient();
  const { data: { user } } = await supa.auth.getUser(); // relies on Supabase Auth cookies in prod
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data, error } = await supa
    .from('accounts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
}

export async function POST(req: NextRequest) {
  const supa = adminClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const body = await req.json();
  const { name, institution, type, balance } = body || {};
  if (!type) return new Response('Missing type', { status: 400 });

  const { data, error } = await supa
    .from('accounts')
    .insert({ user_id: user.id, name, institution, type, balance: Number(balance) || 0 })
    .select('*')
    .single();

  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
}

export async function DELETE(req: NextRequest) {
  const supa = adminClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return new Response('Missing id', { status: 400 });

  const { error } = await supa.from('accounts').delete().eq('id', id).eq('user_id', user.id);
  if (error) return new Response(error.message, { status: 500 });
  return new Response(null, { status: 204 });
}
