import { NextRequest, NextResponse } from 'next/server';
import { computeSplit } from '@/lib/split';
import { project } from '@/lib/projections';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(()=> ({}));
  const { monthly=0, tfsaRoom=0, rrspRoom=0, respRoom=0, years=10, scenario='base' } = body;
  const split = computeSplit({
    monthlyContribution: Number(monthly||0),
    tfsaRoom: Number(tfsaRoom||0),
    rrspRoom: Number(rrspRoom||0),
    respRoom: Number(respRoom||0),
  });
  const proj = project(0, Number(monthly||0), Number(years), scenario);
  return NextResponse.json({ split, projection: proj });
}
