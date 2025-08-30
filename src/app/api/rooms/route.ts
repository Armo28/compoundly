import { NextRequest } from 'next/server';
import { getRouteClient, jsonErr, jsonOK, requireUser } from '@/lib/supabaseRoute';

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const year = Number(new URL(req.url).searchParams.get('year') ?? new Date().getFullYear());
    const { supabase } = getRouteClient(req);

    const [{ data: room }, { data: prog }] = await Promise.all([
      supabase.from('contribution_rooms').select('year,tfsa,rrsp').eq('year', year).single(),
      supabase.from('room_progress').select('year,tfsa_deposited,rrsp_deposited').eq('year', year).single(),
    ]);

    return jsonOK({
      ok: true,
      year,
      room: room ?? { year, tfsa: 0, rrsp: 0 },
      progress: prog ?? { year, tfsa_deposited: 0, rrsp_deposited: 0 },
    });
  } catch (e:any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const year = Number(body?.year ?? new Date().getFullYear());
    const tfsa = Number(body?.tfsa ?? 0);
    const rrsp = Number(body?.rrsp ?? 0);
    const { supabase } = getRouteClient(req);

    const { data, error } = await supabase
      .from('contribution_rooms')
      .upsert({ user_id: user.id, year, tfsa, rrsp, updated_at: new Date().toISOString() }, { onConflict: 'user_id,year' })
      .select('year,tfsa,rrsp').single();
    if (error) throw error;

    return jsonOK({ ok: true, room: data });
  } catch (e:any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}
