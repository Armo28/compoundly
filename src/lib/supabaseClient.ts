'use client';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// v2 client (has auth.getSessionFromUrl and auth.exchangeCodeForSession)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
