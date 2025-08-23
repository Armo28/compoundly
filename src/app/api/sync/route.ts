import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ---- Minimal in-file "demo aggregator" ----
type DemoAccount = { id: string; name: string; type: 'TFSA'|'RRSP'|'RESP'|'MARGIN'; currency: 'CAD'|'USD' };
type DemoPosition = { accountId: string; symbol: string; quantity: number; avgCost?: number; price?: number; value?: number };

const DemoAggregator = {
  async listAccounts(_userId: string): Promise<DemoAccount[]> {
    return [
      { id: 'demo-tfsa-1', name: 'TFSA Main',  type: 'TFSA',  currency: 'CAD' },
      { id: 'demo-rrsp-1', name: 'RRSP Main',  type: 'RRSP',  currency: 'CAD' },
      { id: 'demo-cash-1', name: 'Margin/Cash',type: 'MARGIN',currency: 'CAD' },
    ];
  },
  async listPositions(_userId: string): Promise<DemoPosition[]> {
    return [
      { accountId: 'demo-tfsa-1', symbol: 'XEQT.TO', quantity: 10, avgCost: 30,  price: 35,  value: 350 },
      { accountId: 'demo-rrsp-1', symbol: 'VEQT.TO', quantity:  5, avgCost: 35,  price: 36,  value: 180 },
      { accountId: 'demo-cash-1', symbol: 'CASH',    quantity:500, avgCost: 1,   price: 1,   value: 500 },
    ];
  }
};

// ---- Supabase admin client (server-side) ----
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

    // 1) Upsert accounts and capture their internal IDs
    const accounts = await DemoAggregator.listAccounts(userId);
    const accountIdByExternal: Record<string, string> = {};

    for (const a of accounts) {
      const { data, error } = await supabaseAdmin
        .from('accounts')
        .upsert(
          {
            user_id: userId,
            external_institution_id: 'demo',
            external_account_id: a.id,
            name: a.name,
            type: a.type,
            currency: a.currency,
          },
          { onConflict: 'external_account_id' }
        )
        .select('id');

      if (error) {
        console.error('Upsert account error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const row = Array.isArray(data) ? data[0] : (data as any);
      let internalId = row?.id as string | undefined;

      if (!internalId) {
        const { data: fetched, error: fetchErr } = await supabaseAdmin
          .from('accounts')
          .select('id')
          .eq('external_account_id', a.id)
          .limit(1)
          .maybeSingle();
        if (fetchErr || !fetched?.id) {
          console.error('Failed to fetch account id after upsert:', fetchErr);
          return NextResponse.json({ error: 'Failed to upsert account id' }, { status: 500 });
        }
        internalId = fetched.id;
      }
      accountIdByExternal[a.id] = internalId!;
    }

    // 2) Insert positions using mapped internal IDs
    const positions = await DemoAggregator.listPositions(userId);
    const rows = positions.map((p) => {
      const internal = accountIdByExternal[p.accountId];
      if (!internal) return null;
      return {
        user_id: userId,
        account_id: internal,
        symbol: p.symbol,
        quantity: p.quantity,
        avg_cost: p.avgCost ?? null,
        market_price: p.price ?? null,
        market_value: p.value ?? null,
      };
    }).filter(Boolean) as any[];

    if (rows.length) {
      const { error: posErr } = await supabaseAdmin.from('positions').insert(rows);
      if (posErr) {
        console.error('Insert positions error:', posErr);
        return NextResponse.json({ error: posErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, accounts: accounts.length, positions: rows.length });
  } catch (e: any) {
    console.error('Sync fatal error:', e);
    return NextResponse.json({ error: e?.message ?? 'unknown error' }, { status: 500 });
  }
}
