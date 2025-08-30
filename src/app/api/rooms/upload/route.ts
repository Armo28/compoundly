import { NextRequest } from 'next/server';
import { jsonErr, jsonOK, requireUser } from '@/lib/supabaseRoute';
// @ts-ignore - no types
import pdf from 'pdf-parse';

function pickNumber(s?: string) {
  if (!s) return 0;
  const n = s.replace(/[, ]/g,'').match(/(\d+(\.\d+)?)/)?.[1];
  return n ? Number(n) : 0;
}

export async function POST(req: NextRequest) {
  try {
    await requireUser(req);
    const form = await req.formData();
    const file = form.get('file') as File | null;
    const expectYear = Number(form.get('year') ?? new Date().getFullYear());
    if (!file) return jsonErr('No file', 400);
    if (!file.type.includes('pdf')) return jsonErr('Please upload a PDF Notice of Assessment', 400);

    const buf = Buffer.from(await file.arrayBuffer());
    const parsed = await pdf(buf);
    const text = String(parsed?.text ?? '').replace(/\r/g,'');
    // very basic regex patterns that work for many CRA notices; tweak as needed
    const yearInDoc = Number(text.match(/for the year\s+(\d{4})/i)?.[1] ??
                           text.match(/as of January 1,\s*(\d{4})/i)?.[1] ??
                           text.match(/for\s+(\d{4})\s+tax/i)?.[1] ?? 0);

    if (yearInDoc && yearInDoc !== expectYear) {
      return jsonErr(`This appears to be for ${yearInDoc}, not ${expectYear}.`, 400);
    }

    // TFSA room
    const tfsaLine = text.match(/TFSA\s+(?:contribution\s+)?room.*?\$([0-9, ]+)/i)?.[1];
    // RRSP limit
    const rrspLine = text.match(/RRSP.*?(?:deduction|contribution)\s+limit.*?\$([0-9, ]+)/i)?.[1];

    const tfsa = pickNumber(tfsaLine);
    const rrsp = pickNumber(rrspLine);
    if (!tfsa && !rrsp) return jsonErr('Could not find TFSA/RRSP figures in this PDF.', 422);

    return jsonOK({ ok: true, year: expectYear, tfsa, rrsp });
  } catch (e:any) {
    return jsonErr(e?.message ?? 'Server error', e?.status ?? 500);
  }
}
