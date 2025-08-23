import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    tfsaDepositedThisYear: 2400,
    rrspDepositedThisYear: 7600,
  });
}
