import { NextRequest } from 'next/server';
import { requireUser, jsonOK, jsonErr } from '@/lib/supabaseRoute';

/**
 * Placeholder upload endpoint.
 * No file reading on build; simply checks auth and returns OK.
 */
export async function POST(req: NextRequest) {
  try {
    await requireUser(req);
    return jsonOK({ ok: true, message: 'Upload endpoint placeholder' });
  } catch (e: any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}
