import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!; // server use only

// Admin client (server-only). Do NOT expose service key to browser.
export function adminClient() {
  return createClient(url, service, { auth: { persistSession: false } });
}
